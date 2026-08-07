import { McapIndexedReader, McapWriter } from '@mcap/core'
import { describe, expect, it, vi } from 'vitest'
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
