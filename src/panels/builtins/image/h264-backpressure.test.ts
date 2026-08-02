import { describe, expect, it } from 'vitest'
import {
  MAX_H264_PENDING_FRAMES,
  selectLatestCompleteH264Gop,
} from './h264-backpressure'

describe('selectLatestCompleteH264Gop', () => {
  it('keeps the newest complete GOP after frame-count overflow', () => {
    const entries = Array.from({ length: MAX_H264_PENDING_FRAMES + 20 }, (_, index) => ({
      timestampUs: index * 10_000,
      isKeyframe: index === 0 || index === 100,
      id: index,
    }))

    const selected = selectLatestCompleteH264Gop(entries)

    expect(selected[0].id).toBe(100)
    expect(selected.at(-1)?.id).toBe(entries.length - 1)
  })

  it('drops an overflowing delta-only tail and waits for a keyframe', () => {
    const entries = Array.from({ length: MAX_H264_PENDING_FRAMES + 1 }, (_, index) => ({
      timestampUs: index * 10_000,
      isKeyframe: false,
    }))

    expect(selectLatestCompleteH264Gop(entries)).toEqual([])
  })

  it('does not alter a queue below both limits', () => {
    const entries = [
      { timestampUs: 0, isKeyframe: true },
      { timestampUs: 20_000, isKeyframe: false },
    ]

    expect(selectLatestCompleteH264Gop(entries)).toEqual(entries)
  })
})
