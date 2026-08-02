export interface H264QueueEntry {
  timestampUs: number
  isKeyframe: boolean
}

export const MAX_H264_PENDING_FRAMES = 120
export const MAX_H264_PENDING_DURATION_US = 1_000_000
export const VIDEO_DECODER_HIGH_WATER = 4
export const VIDEO_OUTPUT_DEADLINE_US = 120_000

export function isH264QueueOverLimit(entries: readonly H264QueueEntry[]): boolean {
  if (entries.length > MAX_H264_PENDING_FRAMES) {
    return true
  }
  const first = entries[0]
  const last = entries.at(-1)
  return Boolean(first && last && last.timestampUs - first.timestampUs > MAX_H264_PENDING_DURATION_US)
}

/**
 * Keep the newest complete GOP that fits the queue limits. Returning an empty
 * queue means decoding must wait for the next keyframe.
 */
export function selectLatestCompleteH264Gop<T extends H264QueueEntry>(entries: readonly T[]): T[] {
  if (!isH264QueueOverLimit(entries)) {
    return Array.from(entries)
  }

  const newest = entries.at(-1)
  if (!newest) {
    return []
  }
  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index]
    if (
      entry.isKeyframe
      && entries.length - index <= MAX_H264_PENDING_FRAMES
      && newest.timestampUs - entry.timestampUs <= MAX_H264_PENDING_DURATION_US
    ) {
      return entries.slice(index)
    }
  }
  return []
}
