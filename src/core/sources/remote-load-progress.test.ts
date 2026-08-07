import { describe, expect, it } from 'vitest'
import {
  getPlayableTimeRanges,
  getRangeByteLength,
  mergeByteRanges,
} from './remote-load-progress'

describe('remote load progress', () => {
  it('merges overlapping and adjacent downloaded byte ranges', () => {
    const ranges = mergeByteRanges([
      { start: 20, end: 30 },
      { start: 0, end: 10 },
      { start: 10, end: 20 },
      { start: 40, end: 50 },
    ])

    expect(ranges).toEqual([
      { start: 0, end: 30 },
      { start: 40, end: 50 },
    ])
    expect(getRangeByteLength(ranges)).toBe(40)
  })

  it('only marks chunks whose complete byte range is available', () => {
    const coverage = [
      { byteRange: { start: 0, end: 10 }, startNs: 0n, endNs: 2_000_000_000n },
      { byteRange: { start: 10, end: 20 }, startNs: 2_100_000_000n, endNs: 4_000_000_000n },
      { byteRange: { start: 20, end: 30 }, startNs: 10_000_000_000n, endNs: 12_000_000_000n },
    ]

    expect(getPlayableTimeRanges(coverage, [{ start: 0, end: 15 }])).toEqual([
      { startNs: 0n, endNs: 2_000_000_000n },
    ])
    expect(getPlayableTimeRanges(coverage, [{ start: 0, end: 30 }])).toEqual([
      { startNs: 0n, endNs: 4_000_000_000n },
      { startNs: 10_000_000_000n, endNs: 12_000_000_000n },
    ])
  })
})
