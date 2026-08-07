import type { IReadable } from '@mcap/core'

export interface UrlReadableOptions {
  /** Custom fetch implementation, defaults to globalThis.fetch */
  fetch?: typeof fetch
  /** Minimum fetch size for range coalescing/pre-fetching (default: 128KB) */
  minFetchSize?: number
}

interface CacheBlock {
  start: bigint
  end: bigint
  data: Uint8Array
}

export class UrlReadable implements IReadable {
  private url: string
  private customFetch: typeof fetch
  private cachedSize?: bigint
  private blocks: CacheBlock[] = []
  private maxBlocks = 64
  private minFetchSize: bigint

  constructor(url: string, options: UrlReadableOptions = {}) {
    this.url = url
    this.customFetch = options.fetch ?? globalThis.fetch.bind(globalThis)
    this.minFetchSize = BigInt(options.minFetchSize ?? 128 * 1024)
  }

  async size(): Promise<bigint> {
    if (this.cachedSize !== undefined) {
      return this.cachedSize
    }

    // Try HEAD request first to fetch content-length
    try {
      const response = await this.customFetch(this.url, { method: 'HEAD' })
      if (response.ok) {
        const contentLength = response.headers.get('content-length')
        if (contentLength) {
          this.cachedSize = BigInt(contentLength)
          return this.cachedSize
        }
      }
    }
    catch {
      // Fallback to GET range request if HEAD fails or CORS blocks HEAD
    }

    // Fallback: Range request bytes=0-0 to extract total size from Content-Range header
    const response = await this.customFetch(this.url, {
      headers: { Range: 'bytes=0-0' },
    })

    if (!response.ok && response.status !== 206) {
      throw new Error(`Failed to fetch file info (HTTP ${response.status}): ${response.statusText}`)
    }

    const contentRange = response.headers.get('content-range')
    if (contentRange) {
      const match = contentRange.match(/\/(\d+)$/)
      if (match) {
        this.cachedSize = BigInt(match[1])
        return this.cachedSize
      }
    }

    const contentLength = response.headers.get('content-length')
    if (contentLength && response.status === 200) {
      this.cachedSize = BigInt(contentLength)
      return this.cachedSize
    }

    throw new Error('Remote server does not support file size inspection (missing Content-Length or Content-Range)')
  }

  async read(offset: bigint, size: bigint): Promise<Uint8Array> {
    if (size === 0n) {
      return new Uint8Array(0)
    }

    const targetEnd = offset + size - 1n

    // 1. Check if requested range is fully covered by a cached block
    for (const block of this.blocks) {
      if (offset >= block.start && targetEnd <= block.end) {
        const relativeStart = Number(offset - block.start)
        const relativeEnd = relativeStart + Number(size)
        return block.data.subarray(relativeStart, relativeEnd)
      }
    }

    // 2. Pre-fetch larger block to coalesce multiple small HTTP Range requests
    let actualFetchSize = size
    if (size < this.minFetchSize) {
      actualFetchSize = this.minFetchSize
    }

    let actualEnd = offset + actualFetchSize - 1n
    if (this.cachedSize !== undefined && actualEnd >= this.cachedSize) {
      actualEnd = this.cachedSize - 1n
    }

    const response = await this.customFetch(this.url, {
      headers: {
        Range: `bytes=${offset}-${actualEnd}`,
      },
    })

    if (!response.ok && response.status !== 206) {
      throw new Error(`HTTP error ${response.status} when fetching range bytes=${offset}-${actualEnd}`)
    }

    const buffer = await response.arrayBuffer()
    const fetchedData = new Uint8Array(buffer)

    // 3. Store block in memory cache
    if (this.blocks.length >= this.maxBlocks) {
      this.blocks.shift()
    }
    this.blocks.push({
      start: offset,
      end: offset + BigInt(fetchedData.length) - 1n,
      data: fetchedData,
    })

    // 4. Return requested sub-array
    const resultSize = Math.min(Number(size), fetchedData.length)
    return fetchedData.subarray(0, resultSize)
  }
}
