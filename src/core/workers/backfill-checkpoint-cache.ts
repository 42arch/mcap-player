import type { DecodedMessage } from './message-cursor'

export interface BackfillCheckpoint<T> {
  timeNs: bigint
  resumeTimeNs: bigint
  state: T
  lastMessage: DecodedMessage
  lastUsed: number
  /**
   * Checkpoints built by the one-time spatial index cover the whole recording
   * and must survive the small LRU of exact, user-selected seek positions.
   */
  pinned?: boolean
}

export function findCheckpoint<T>(
  cache: Map<string, BackfillCheckpoint<T>[]>,
  topic: string,
  seekTimeNs: bigint,
  getAccessCount: () => number,
): BackfillCheckpoint<T> | undefined {
  let nearest: BackfillCheckpoint<T> | undefined
  for (const checkpoint of cache.get(topic) || []) {
    if (
      checkpoint.timeNs <= seekTimeNs
      && (!nearest || checkpoint.timeNs > nearest.timeNs)
    ) {
      nearest = checkpoint
    }
  }
  if (nearest) {
    nearest.lastUsed = getAccessCount()
  }
  return nearest
}

export function storeCheckpoint<T>(
  cache: Map<string, BackfillCheckpoint<T>[]>,
  topic: string,
  checkpoint: Omit<BackfillCheckpoint<T>, 'lastUsed'>,
  nextAccessCount: number,
  maxCheckpoints = 64,
): void {
  let checkpoints = cache.get(topic)
  if (!checkpoints) {
    checkpoints = []
    cache.set(topic, checkpoints)
  }
  const existingIndex = checkpoints.findIndex(item => item.timeNs === checkpoint.timeNs)
  const next = {
    ...checkpoint,
    lastUsed: nextAccessCount,
    pinned: checkpoint.pinned || (existingIndex >= 0 && checkpoints[existingIndex].pinned),
  }
  if (existingIndex >= 0) {
    checkpoints[existingIndex] = next
    return
  }
  checkpoints.push(next)
  if (checkpoints.length <= maxCheckpoints) {
    return
  }
  let leastRecentlyUsedIndex = -1
  for (let index = 0; index < checkpoints.length; index++) {
    if (checkpoints[index].pinned) {
      continue
    }
    if (
      leastRecentlyUsedIndex === -1
      || checkpoints[index].lastUsed < checkpoints[leastRecentlyUsedIndex].lastUsed
    ) {
      leastRecentlyUsedIndex = index
    }
  }
  // The adaptive index interval keeps pinned checkpoints below the limit. Keep
  // this fallback for malformed metadata or unusually short custom intervals.
  if (leastRecentlyUsedIndex === -1) {
    leastRecentlyUsedIndex = checkpoints.reduce(
      (least, item, index) => item.lastUsed < checkpoints[least].lastUsed ? index : least,
      0,
    )
  }
  checkpoints.splice(leastRecentlyUsedIndex, 1)
}
