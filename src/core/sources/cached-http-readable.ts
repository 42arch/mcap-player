import type { IReadable } from '@mcap/core'
import type { ByteRange } from './remote-load-progress'
import type { PersistentRemoteBlockStore, RemoteBlockCacheIdentity } from './persistent-remote-block-store'
import type { SessionBlockProvider } from './session-opfs-block-provider'
import { getRangeByteLength, mergeByteRanges } from './remote-load-progress'

const MIB = 1024 * 1024
const DEFAULT_BLOCK_SIZE = 4 * MIB
const DEFAULT_CACHE_SIZE = 96 * MIB
const DEFAULT_RETRY_ATTEMPTS = 4
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504])
const CONTENT_RANGE_PATTERN = /^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export interface CachedHttpReadableOptions {
  knownSize?: number
  blockSizeBytes?: number
  cacheSizeBytes?: number
  retryAttempts?: number
  fetch?: FetchLike
  persistentBlockStore?: PersistentRemoteBlockStore | null
  /** A session-scoped shared cache supplied by the remote cache worker. */
  blockProvider?: SessionBlockProvider
}

interface CachedBlock {
  data: Uint8Array
}

function abortError(): DOMException {
  return new DOMException('Remote MCAP request was canceled.', 'AbortError')
}

function waitForRetry(delayMs: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError())
      return
    }
    let timeout: ReturnType<typeof setTimeout>
    const handleAbort = () => {
      clearTimeout(timeout)
      reject(abortError())
    }
    timeout = setTimeout(() => {
      signal.removeEventListener('abort', handleAbort)
      resolve()
    }, delayMs)
    signal.addEventListener('abort', handleAbort, { once: true })
  })
}

function parseContentRange(value: string | null): { start: number, end: number, size?: number } | null {
  const match = value?.match(CONTENT_RANGE_PATTERN)
  if (!match) {
    return null
  }
  return {
    start: Number(match[1]),
    end: Number(match[2]),
    size: match[3] === '*' ? undefined : Number(match[3]),
  }
}

/**
 * Random-access HTTP reader backed by a bounded in-worker LRU block cache.
 * The server must honor single byte-range requests with 206 responses.
 */
export class CachedHttpReadable implements IReadable {
  private readonly url: string
  private readonly fetchImpl: FetchLike
  private readonly blockSizeBytes: number
  private readonly cacheSizeBytes: number
  private readonly retryAttempts: number
  private readonly persistentBlockStore: PersistentRemoteBlockStore | null
  private readonly blockProvider: SessionBlockProvider | undefined
  private readonly abortController = new AbortController()
  private readonly cache = new Map<number, CachedBlock>()
  private readonly inFlightBlocks = new Map<number, Promise<Uint8Array>>()
  private readonly downloadedBlocks = new Set<number>()
  private cachedBytes = 0
  private fileSize: number | undefined
  private sizePromise: Promise<number> | null = null
  private persistentIdentity: RemoteBlockCacheIdentity | null = null
  private persistentBlocks = new Set<number>()
  private persistentBlocksPromise: Promise<void> | null = null
  private validator: string | undefined

  constructor(url: string, options: CachedHttpReadableOptions = {}) {
    this.url = url
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis)
    this.blockSizeBytes = Math.max(1, Math.floor(options.blockSizeBytes ?? DEFAULT_BLOCK_SIZE))
    this.cacheSizeBytes = Math.max(this.blockSizeBytes, Math.floor(options.cacheSizeBytes ?? DEFAULT_CACHE_SIZE))
    this.retryAttempts = Math.max(1, Math.floor(options.retryAttempts ?? DEFAULT_RETRY_ATTEMPTS))
    // Production remote sources use blockProvider. Keep an explicitly supplied
    // store only for compatibility with callers that provide one themselves.
    this.persistentBlockStore = options.persistentBlockStore ?? null
    this.blockProvider = options.blockProvider
    if (options.knownSize !== undefined) {
      if (!Number.isSafeInteger(options.knownSize) || options.knownSize <= 0) {
        throw new Error('Remote MCAP size must be a positive safe integer.')
      }
      this.fileSize = options.knownSize
    }
  }

  async size(): Promise<bigint> {
    return BigInt(await this.getSize())
  }

  async read(offset: bigint, length: bigint): Promise<Uint8Array> {
    if (this.abortController.signal.aborted) {
      throw abortError()
    }
    const numericOffset = Number(offset)
    const numericLength = Number(length)
    if (
      offset < 0n
      || length < 0n
      || !Number.isSafeInteger(numericOffset)
      || !Number.isSafeInteger(numericLength)
    ) {
      throw new Error('Remote MCAP read range is outside the supported integer range.')
    }
    if (numericLength === 0) {
      return new Uint8Array()
    }

    const size = await this.getSize()
    const readEnd = numericOffset + numericLength
    if (!Number.isSafeInteger(readEnd) || readEnd > size) {
      throw new Error(`Remote MCAP read past end of file (${readEnd} > ${size}).`)
    }

    const firstBlock = Math.floor(numericOffset / this.blockSizeBytes)
    const lastBlock = Math.floor((readEnd - 1) / this.blockSizeBytes)
    const blocks = await Promise.all(
      Array.from({ length: lastBlock - firstBlock + 1 }, (_, index) => this.getBlock(firstBlock + index)),
    )

    const output = new Uint8Array(numericLength)
    let outputOffset = 0
    for (let index = 0; index < blocks.length; index++) {
      const blockIndex = firstBlock + index
      const blockStart = blockIndex * this.blockSizeBytes
      const from = Math.max(numericOffset, blockStart) - blockStart
      const to = Math.min(readEnd, blockStart + blocks[index].byteLength) - blockStart
      const slice = blocks[index].subarray(from, to)
      output.set(slice, outputOffset)
      outputOffset += slice.byteLength
    }
    if (outputOffset !== numericLength) {
      throw new Error(`Short remote MCAP read: expected ${numericLength} bytes, received ${outputOffset}.`)
    }
    return output
  }

  close(): void {
    if (!this.abortController.signal.aborted) {
      this.abortController.abort()
    }
    this.cache.clear()
    this.inFlightBlocks.clear()
    this.downloadedBlocks.clear()
    this.cachedBytes = 0
  }

  getDownloadedRanges(): ByteRange[] {
    if (this.fileSize === undefined || this.downloadedBlocks.size === 0) {
      return []
    }
    return mergeByteRanges(Array.from(this.downloadedBlocks, (blockIndex) => {
      const start = blockIndex * this.blockSizeBytes
      return {
        start,
        end: Math.min(this.fileSize!, start + this.blockSizeBytes),
      }
    }))
  }

  getDownloadedBytes(): number {
    return getRangeByteLength(this.getDownloadedRanges())
  }

  getResidentRanges(): ByteRange[] {
    return this.getRangesForBlocks(this.cache.keys())
  }

  getResidentBytes(): number {
    return getRangeByteLength(this.getResidentRanges())
  }

  async getPersistedRanges(): Promise<ByteRange[]> {
    if (this.blockProvider) {
      const progress = await this.blockProvider.getProgress()
      return this.getRangesForBlocks(progress.storedBlockIndexes)
    }
    await this.initializePersistentBlocks()
    return this.getRangesForBlocks(this.persistentBlocks)
  }

  async getPersistedBytes(): Promise<number> {
    return getRangeByteLength(await this.getPersistedRanges())
  }

  /**
   * Warm blocks covering the supplied byte ranges without retaining an
   * unbounded number of pending fetches. Existing cache and in-flight entries
   * are reused by getBlock().
   */
  async prefetchByteRanges(ranges: readonly ByteRange[], maxConcurrent = 2): Promise<void> {
    if (this.abortController.signal.aborted || ranges.length === 0) {
      return
    }
    const size = await this.getSize()
    const blockIndexes = new Set<number>()
    for (const range of ranges) {
      const start = Math.max(0, Math.floor(range.start))
      const end = Math.min(size, Math.ceil(range.end))
      if (end <= start) {
        continue
      }
      const firstBlock = Math.floor(start / this.blockSizeBytes)
      const lastBlock = Math.floor((end - 1) / this.blockSizeBytes)
      for (let blockIndex = firstBlock; blockIndex <= lastBlock; blockIndex++) {
        blockIndexes.add(blockIndex)
      }
    }

    const pending = Array.from(blockIndexes)
    let nextIndex = 0
    const worker = async () => {
      while (nextIndex < pending.length) {
        const blockIndex = pending[nextIndex++]
        await this.getBlock(blockIndex)
      }
    }
    await Promise.all(Array.from(
      { length: Math.min(Math.max(1, Math.floor(maxConcurrent)), pending.length) },
      worker,
    ))
  }

  private async getSize(): Promise<number> {
    if (this.fileSize !== undefined) {
      return this.fileSize
    }
    if (this.blockProvider) {
      this.fileSize = await this.blockProvider.getSize()
      return this.fileSize
    }
    if (!this.sizePromise) {
      this.sizePromise = this.probeSize().catch((error) => {
        this.sizePromise = null
        throw error
      })
    }
    return this.sizePromise
  }

  private async probeSize(): Promise<number> {
    const response = await this.fetchWithRetry({
      headers: { Range: 'bytes=0-0' },
      signal: this.abortController.signal,
    })
    if (response.status !== 206) {
      await response.body?.cancel().catch(() => undefined)
      throw new Error('The remote server does not support HTTP byte-range requests (expected 206 Partial Content).')
    }
    const range = parseContentRange(response.headers.get('Content-Range'))
    await response.body?.cancel().catch(() => undefined)
    if (!range?.size || range.start !== 0 || range.end !== 0 || !Number.isSafeInteger(range.size)) {
      throw new Error('The remote server did not expose a valid Content-Range header. Check its CORS configuration.')
    }
    this.validator = response.headers.get('ETag') ?? response.headers.get('Last-Modified') ?? undefined
    this.fileSize = range.size
    return range.size
  }

  private getBlock(blockIndex: number): Promise<Uint8Array> {
    const cached = this.cache.get(blockIndex)
    if (cached) {
      this.cache.delete(blockIndex)
      this.cache.set(blockIndex, cached)
      return Promise.resolve(cached.data)
    }
    const active = this.inFlightBlocks.get(blockIndex)
    if (active) {
      return active
    }

    const request = this.loadBlock(blockIndex)
      .then((data) => {
        this.downloadedBlocks.add(blockIndex)
        this.addBlock(blockIndex, data)
        return data
      })
      .finally(() => {
        this.inFlightBlocks.delete(blockIndex)
      })
    this.inFlightBlocks.set(blockIndex, request)
    return request
  }

  private async fetchBlock(blockIndex: number): Promise<Uint8Array> {
    if (this.blockProvider) {
      return this.blockProvider.getBlock(blockIndex)
    }
    const size = await this.getSize()
    const start = blockIndex * this.blockSizeBytes
    const end = Math.min(size, start + this.blockSizeBytes) - 1
    const expectedLength = end - start + 1
    const response = await this.fetchWithRetry({
      headers: { Range: `bytes=${start}-${end}` },
      signal: this.abortController.signal,
    })
    if (response.status !== 206) {
      await response.body?.cancel().catch(() => undefined)
      throw new Error(`The remote server ignored byte range ${start}-${end}.`)
    }

    const range = parseContentRange(response.headers.get('Content-Range'))
    if (!range || range.start !== start || range.end !== end || (range.size !== undefined && range.size !== size)) {
      await response.body?.cancel().catch(() => undefined)
      throw new Error(`Invalid Content-Range response for bytes ${start}-${end}.`)
    }
    const data = new Uint8Array(await response.arrayBuffer())
    if (data.byteLength !== expectedLength) {
      throw new Error(`Short remote MCAP response: expected ${expectedLength} bytes, received ${data.byteLength}.`)
    }
    return data
  }

  private async loadBlock(blockIndex: number): Promise<Uint8Array> {
    const identity = await this.initializePersistentBlocks()
    if (!identity || !this.persistentBlockStore) {
      return this.fetchBlock(blockIndex)
    }

    const cached = await this.persistentBlockStore.get(identity, blockIndex)
    if (cached) {
      this.persistentBlocks.add(blockIndex)
      return cached
    }

    return this.persistentBlockStore.runExclusive(identity, blockIndex, async () => {
      const sharedCached = await this.persistentBlockStore!.get(identity, blockIndex)
      if (sharedCached) {
        this.persistentBlocks.add(blockIndex)
        return sharedCached
      }
      const data = await this.fetchBlock(blockIndex)
      if (await this.persistentBlockStore!.put(identity, blockIndex, data)) {
        this.persistentBlocks.add(blockIndex)
      }
      return data
    })
  }

  private async initializePersistentBlocks(): Promise<RemoteBlockCacheIdentity | null> {
    if (!this.persistentBlockStore) {
      return null
    }
    const size = await this.getSize()
    if (!this.persistentIdentity) {
      this.persistentIdentity = { url: this.url, size, validator: this.validator }
      this.persistentBlocksPromise = this.persistentBlockStore
        .listBlockIndexes(this.persistentIdentity)
        .then((blockIndexes) => {
          this.persistentBlocks = new Set(blockIndexes)
        })
        .catch(() => undefined)
    }
    await this.persistentBlocksPromise
    return this.persistentIdentity
  }

  private getRangesForBlocks(blockIndexes: Iterable<number>): ByteRange[] {
    if (this.fileSize === undefined) {
      return []
    }
    return mergeByteRanges(Array.from(blockIndexes, (blockIndex) => {
      const start = blockIndex * this.blockSizeBytes
      return { start, end: Math.min(this.fileSize!, start + this.blockSizeBytes) }
    }))
  }

  private async fetchWithRetry(init: RequestInit): Promise<Response> {
    let delayMs = 250
    let lastError: unknown
    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      if (this.abortController.signal.aborted) {
        throw abortError()
      }
      try {
        const response = await this.fetchImpl(this.url, init)
        if (!RETRYABLE_STATUS.has(response.status) || attempt === this.retryAttempts) {
          return response
        }
        await response.body?.cancel().catch(() => undefined)
      }
      catch (error) {
        if (this.abortController.signal.aborted) {
          throw abortError()
        }
        lastError = error
        if (attempt === this.retryAttempts) {
          throw error
        }
      }
      await waitForRetry(delayMs, this.abortController.signal)
      delayMs = Math.min(delayMs * 2, 2000)
    }
    throw lastError instanceof Error ? lastError : new Error('Remote MCAP request failed.')
  }

  private addBlock(blockIndex: number, data: Uint8Array): void {
    const previous = this.cache.get(blockIndex)
    if (previous) {
      this.cachedBytes -= previous.data.byteLength
      this.cache.delete(blockIndex)
    }
    this.cache.set(blockIndex, { data })
    this.cachedBytes += data.byteLength

    while (this.cachedBytes > this.cacheSizeBytes && this.cache.size > 1) {
      const oldestKey = this.cache.keys().next().value as number | undefined
      if (oldestKey === undefined) {
        break
      }
      const oldest = this.cache.get(oldestKey)
      this.cache.delete(oldestKey)
      this.cachedBytes -= oldest?.data.byteLength ?? 0
    }
  }
}
