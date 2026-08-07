export interface ByteRange {
  start: number
  end: number
}

export interface IndexedChunkCoverage {
  byteRange: ByteRange
  startNs: bigint
  endNs: bigint
}

export interface RemoteTimeRange {
  startNs: bigint
  endNs: bigint
}

export interface RemoteLoadProgress {
  downloadedBytes: number
  totalBytes: number
  percent: number
  downloadedByteRanges: ByteRange[]
  playableTimeRanges: RemoteTimeRange[]
}

const DEFAULT_MAX_CONTIGUOUS_GAP_NS = 750_000_000n

export function mergeByteRanges(ranges: readonly ByteRange[]): ByteRange[] {
  const sorted = ranges
    .filter(range => range.end > range.start)
    .map(range => ({ ...range }))
    .sort((a, b) => a.start - b.start || a.end - b.end)
  const merged: ByteRange[] = []
  for (const range of sorted) {
    const previous = merged.at(-1)
    if (!previous || range.start > previous.end) {
      merged.push(range)
      continue
    }
    previous.end = Math.max(previous.end, range.end)
  }
  return merged
}

export function getRangeByteLength(ranges: readonly ByteRange[]): number {
  return ranges.reduce((total, range) => total + Math.max(0, range.end - range.start), 0)
}

export function isByteRangeCovered(target: ByteRange, ranges: readonly ByteRange[]): boolean {
  return ranges.some(range => range.start <= target.start && range.end >= target.end)
}

/** Maps fully downloaded MCAP chunks to their playable time coverage. */
export function getPlayableTimeRanges(
  chunkCoverage: readonly IndexedChunkCoverage[],
  downloadedByteRanges: readonly ByteRange[],
  maxContiguousGapNs = DEFAULT_MAX_CONTIGUOUS_GAP_NS,
): RemoteTimeRange[] {
  const result: RemoteTimeRange[] = []
  let active: RemoteTimeRange | null = null

  for (const chunk of chunkCoverage) {
    if (!isByteRangeCovered(chunk.byteRange, downloadedByteRanges)) {
      active = null
      continue
    }

    if (!active || chunk.startNs > active.endNs + maxContiguousGapNs) {
      active = { startNs: chunk.startNs, endNs: chunk.endNs }
      result.push(active)
      continue
    }
    if (chunk.endNs > active.endNs) {
      active.endNs = chunk.endNs
    }
  }
  return result
}
