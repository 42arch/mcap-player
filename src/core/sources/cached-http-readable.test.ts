import { McapIndexedReader, McapWriter } from '@mcap/core'
import { describe, expect, it, vi } from 'vitest'
import type { PersistentRemoteBlockStore, RemoteBlockCacheIdentity } from './persistent-remote-block-store'
import type { SessionBlockProvider } from './session-opfs-block-provider'
import { CachedHttpReadable } from './cached-http-readable'

class MemoryWritable {
  private chunks: Uint8Array[] = []
  private byteLength = 0

  position(): bigint {
    return BigInt(this.byteLength)
  }

  write(data: Uint8Array): Promise<void> {
    this.chunks.push(data.slice())
    this.byteLength += data.byteLength
    return Promise.resolve()
  }

  toUint8Array(): Uint8Array {
    const output = new Uint8Array(this.byteLength)
    let offset = 0
    for (const chunk of this.chunks) {
      output.set(chunk, offset)
      offset += chunk.byteLength
    }
    return output
  }
}

function partialResponse(data: number[], start: number, end: number, size: number, status = 206): Response {
  return new Response(new Uint8Array(data), {
    status,
    headers: {
      'Content-Range': `bytes ${start}-${end}/${size}`,
    },
  })
}

function createMemoryBlockStore(): PersistentRemoteBlockStore {
  const blocks = new Map<string, Uint8Array>()
  const getKey = (identity: RemoteBlockCacheIdentity, blockIndex: number) =>
    `${identity.url}:${identity.size}:${identity.validator ?? ''}:${blockIndex}`
  return {
    get: async (identity, blockIndex) => blocks.get(getKey(identity, blockIndex))?.slice() ?? null,
    put: async (identity, blockIndex, data) => {
      blocks.set(getKey(identity, blockIndex), data.slice())
      return true
    },
    listBlockIndexes: async (identity) => Array.from(blocks.keys())
      .filter(key => key.startsWith(`${identity.url}:${identity.size}:${identity.validator ?? ''}:`))
      .map(key => Number(key.slice(key.lastIndexOf(':') + 1))),
    runExclusive: async (_identity, _blockIndex, task) => task(),
  }
}

function createSessionBlockProvider(bytes: Uint8Array, blockSize: number): SessionBlockProvider {
  const blocks = new Map<number, Uint8Array>()
  return {
    getSize: async () => bytes.byteLength,
    getBlock: async (blockIndex) => {
      const cached = blocks.get(blockIndex)
      if (cached) {
        return cached.slice()
      }
      const start = blockIndex * blockSize
      const data = bytes.slice(start, Math.min(bytes.byteLength, start + blockSize))
      blocks.set(blockIndex, data)
      return data.slice()
    },
    getProgress: async () => ({
      storedBlockIndexes: Array.from(blocks.keys()),
      residentBlockIndexes: Array.from(blocks.keys()),
    }),
    close: () => undefined,
  }
}

describe('cachedHttpReadable', () => {
  it('probes the size with a one-byte range request', async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => partialResponse([0], 0, 0, 12))
    const readable = new CachedHttpReadable('https://example.com/run.mcap', { fetch })

    await expect(readable.size()).resolves.toBe(12n)
    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch.mock.calls[0]?.[1]?.headers).toEqual({ Range: 'bytes=0-0' })
  })

  it('reads across blocks and reuses cached blocks', async () => {
    const bytes = Uint8Array.from({ length: 12 }, (_, index) => index)
    const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const range = (init?.headers as Record<string, string>).Range
      const match = /bytes=(\d+)-(\d+)/.exec(range)!
      const start = Number(match[1])
      const end = Number(match[2])
      return partialResponse(Array.from(bytes.slice(start, end + 1)), start, end, bytes.length)
    })
    const readable = new CachedHttpReadable('https://example.com/run.mcap', {
      fetch,
      knownSize: bytes.length,
      blockSizeBytes: 4,
      cacheSizeBytes: 8,
    })

    await expect(readable.read(2n, 5n)).resolves.toEqual(Uint8Array.from([2, 3, 4, 5, 6]))
    await expect(readable.read(4n, 2n)).resolves.toEqual(Uint8Array.from([4, 5]))
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('coalesces concurrent reads of the same block', async () => {
    let resolveFetch!: (response: Response) => void
    const fetch = vi.fn(() => new Promise<Response>((resolve) => {
      resolveFetch = resolve
    }))
    const readable = new CachedHttpReadable('https://example.com/run.mcap', {
      fetch,
      knownSize: 4,
      blockSizeBytes: 4,
      cacheSizeBytes: 4,
    })

    const first = readable.read(0n, 2n)
    const second = readable.read(1n, 2n)
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    resolveFetch(partialResponse([0, 1, 2, 3], 0, 3, 4))

    await expect(first).resolves.toEqual(Uint8Array.from([0, 1]))
    await expect(second).resolves.toEqual(Uint8Array.from([1, 2]))
  })

  it('evicts the least recently used block when the cache is full', async () => {
    const bytes = Uint8Array.from({ length: 12 }, (_, index) => index)
    const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const match = /bytes=(\d+)-(\d+)/.exec((init?.headers as Record<string, string>).Range)!
      const start = Number(match[1])
      const end = Number(match[2])
      return partialResponse(Array.from(bytes.slice(start, end + 1)), start, end, bytes.length)
    })
    const readable = new CachedHttpReadable('https://example.com/run.mcap', {
      fetch,
      knownSize: bytes.length,
      blockSizeBytes: 4,
      cacheSizeBytes: 8,
    })

    await readable.read(0n, 1n)
    await readable.read(4n, 1n)
    await readable.read(8n, 1n)
    await readable.read(0n, 1n)

    expect(fetch).toHaveBeenCalledTimes(4)
    expect(readable.getDownloadedRanges()).toEqual([{ start: 0, end: 12 }])
    expect(readable.getDownloadedBytes()).toBe(12)
  })

  it('prefetches requested ranges with bounded concurrent block reads', async () => {
    const bytes = Uint8Array.from({ length: 16 }, (_, index) => index)
    const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const match = /bytes=(\d+)-(\d+)/.exec((init?.headers as Record<string, string>).Range)!
      const start = Number(match[1])
      const end = Number(match[2])
      return partialResponse(Array.from(bytes.slice(start, end + 1)), start, end, bytes.length)
    })
    const readable = new CachedHttpReadable('https://example.com/run.mcap', {
      fetch,
      knownSize: bytes.length,
      blockSizeBytes: 4,
    })

    await readable.prefetchByteRanges([{ start: 1, end: 11 }])

    expect(fetch).toHaveBeenCalledTimes(3)
    expect(readable.getDownloadedRanges()).toEqual([{ start: 0, end: 12 }])
  })

  it('reuses persisted blocks across independent remote readers', async () => {
    const bytes = Uint8Array.from([0, 1, 2, 3])
    const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const match = /bytes=(\d+)-(\d+)/.exec((init?.headers as Record<string, string>).Range)!
      const start = Number(match[1])
      const end = Number(match[2])
      return partialResponse(Array.from(bytes.slice(start, end + 1)), start, end, bytes.length)
    })
    const persistentBlockStore = createMemoryBlockStore()
    const first = new CachedHttpReadable('https://example.com/run.mcap', {
      fetch,
      knownSize: bytes.length,
      blockSizeBytes: 4,
      persistentBlockStore,
    })
    const second = new CachedHttpReadable('https://example.com/run.mcap', {
      fetch,
      knownSize: bytes.length,
      blockSizeBytes: 4,
      persistentBlockStore,
    })

    await expect(first.read(0n, 4n)).resolves.toEqual(bytes)
    await expect(second.read(0n, 4n)).resolves.toEqual(bytes)

    expect(fetch).toHaveBeenCalledOnce()
    await expect(second.getPersistedBytes()).resolves.toBe(4)
  })

  it('uses the shared session block provider instead of making HTTP requests', async () => {
    const bytes = Uint8Array.from({ length: 8 }, (_, index) => index)
    const fetch = vi.fn()
    const readable = new CachedHttpReadable('https://example.com/run.mcap', {
      fetch,
      knownSize: bytes.length,
      blockSizeBytes: 4,
      persistentBlockStore: null,
      blockProvider: createSessionBlockProvider(bytes, 4),
    })

    await expect(readable.read(2n, 5n)).resolves.toEqual(Uint8Array.from([2, 3, 4, 5, 6]))
    await expect(readable.getPersistedRanges()).resolves.toEqual([{ start: 0, end: 8 }])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('can persist every block in a remote file for offline reuse', async () => {
    const bytes = Uint8Array.from({ length: 16 }, (_, index) => index)
    const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const match = /bytes=(\d+)-(\d+)/.exec((init?.headers as Record<string, string>).Range)!
      const start = Number(match[1])
      const end = Number(match[2])
      return partialResponse(Array.from(bytes.slice(start, end + 1)), start, end, bytes.length)
    })
    const readable = new CachedHttpReadable('https://example.com/run.mcap', {
      fetch,
      knownSize: bytes.length,
      blockSizeBytes: 4,
      persistentBlockStore: createMemoryBlockStore(),
    })

    await readable.prefetchByteRanges([{ start: 0, end: bytes.length }])

    await expect(readable.getPersistedBytes()).resolves.toBe(bytes.length)
    expect(fetch).toHaveBeenCalledTimes(4)
  })

  it('provides random access to a real indexed MCAP reader', async () => {
    const writable = new MemoryWritable()
    const writer = new McapWriter({
      writable,
      useChunks: true,
      useChunkIndex: true,
      useStatistics: true,
    })
    await writer.start({ profile: 'test', library: 'mcap-player-test' })
    const schemaId = await writer.registerSchema({
      name: 'example.Message',
      encoding: 'jsonschema',
      data: new TextEncoder().encode('{"type":"object"}'),
    })
    const channelId = await writer.registerChannel({
      schemaId,
      topic: '/example',
      messageEncoding: 'json',
      metadata: new Map(),
    })
    await writer.addMessage({
      channelId,
      sequence: 1,
      logTime: 1_000_000_000n,
      publishTime: 1_000_000_000n,
      data: new TextEncoder().encode('{"value":42}'),
    })
    await writer.end()
    const bytes = writable.toUint8Array()
    const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const match = /bytes=(\d+)-(\d+)/.exec((init?.headers as Record<string, string>).Range)!
      const start = Number(match[1])
      const end = Number(match[2])
      return partialResponse(Array.from(bytes.slice(start, end + 1)), start, end, bytes.length)
    })
    const readable = new CachedHttpReadable('https://example.com/run.mcap', {
      fetch,
      knownSize: bytes.length,
      blockSizeBytes: 64,
      cacheSizeBytes: 256,
    })

    const reader = await McapIndexedReader.Initialize({ readable })
    const messages = []
    for await (const message of reader.readMessages({ topics: ['/example'] })) {
      messages.push(message)
    }

    expect(messages).toHaveLength(1)
    expect(new TextDecoder().decode(messages[0]?.data)).toBe('{"value":42}')
    expect(fetch).toHaveBeenCalled()
  })

  it('rejects servers that ignore range requests', async () => {
    const fetch = vi.fn(async () => new Response(new Uint8Array([0]), { status: 200 }))
    const readable = new CachedHttpReadable('https://example.com/run.mcap', { fetch })

    await expect(readable.size()).rejects.toThrow('does not support HTTP byte-range requests')
  })

  it('aborts active reads when closed', async () => {
    const fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    }))
    const readable = new CachedHttpReadable('https://example.com/run.mcap', {
      fetch,
      knownSize: 4,
      blockSizeBytes: 4,
    })
    const request = readable.read(0n, 1n)
    readable.close()

    await expect(request).rejects.toMatchObject({ name: 'AbortError' })
  })
})
