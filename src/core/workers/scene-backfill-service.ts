import type { McapIndexedReader } from '@mcap/core'
import type { BackfillCheckpoint } from './backfill-checkpoint-cache'
import type { DecodedMessage } from './message-cursor'
import { SceneUpdateState } from '@/core/parsers/scene-update-parser'
import { findCheckpoint, storeCheckpoint } from './backfill-checkpoint-cache'

const MIN_STATE_CHECKPOINT_INTERVAL_NS = 30_000_000_000n
const MAX_STATE_CHECKPOINTS_PER_TOPIC = 256
const PINNED_STATE_CHECKPOINT_TARGET = 48n
const PINNED_STATE_MESSAGE_TARGET = 192n

function getStateCheckpointIntervalNs(reader: McapIndexedReader): bigint {
  const statistics = reader.statistics
  let durationNs = 0n
  if (statistics && statistics.messageEndTime >= statistics.messageStartTime) {
    durationNs = statistics.messageEndTime - statistics.messageStartTime
  }
  else {
    const firstChunk = reader.chunkIndexes?.[0]
    const lastChunk = reader.chunkIndexes?.at(-1)
    if (firstChunk && lastChunk && lastChunk.messageEndTime >= firstChunk.messageStartTime) {
      durationNs = lastChunk.messageEndTime - firstChunk.messageStartTime
    }
  }
  const coveringInterval = durationNs > 0n
    ? (durationNs + PINNED_STATE_CHECKPOINT_TARGET - 1n) / PINNED_STATE_CHECKPOINT_TARGET
    : 0n
  return coveringInterval > MIN_STATE_CHECKPOINT_INTERVAL_NS
    ? coveringInterval
    : MIN_STATE_CHECKPOINT_INTERVAL_NS
}

function getTopicMessageCount(reader: McapIndexedReader, topic: string): bigint {
  const channelMessageCounts = reader.statistics?.channelMessageCounts
  if (!channelMessageCounts) {
    return 0n
  }
  let count = 0n
  for (const [channelId, channel] of reader.channelsById) {
    if (channel.topic === topic) {
      count += channelMessageCounts.get(channelId) ?? 0n
    }
  }
  return count
}

function getStateCheckpointMessageInterval(reader: McapIndexedReader, topic: string): bigint {
  const messageCount = getTopicMessageCount(reader, topic)
  return messageCount > 0n
    ? (messageCount + PINNED_STATE_MESSAGE_TARGET - 1n) / PINNED_STATE_MESSAGE_TARGET
    : 1n
}

export interface SceneBackfillOptions {
  reader: McapIndexedReader | null
  topic: string
  seekTimeNs: bigint
  sceneCheckpoints: Map<string, BackfillCheckpoint<SceneUpdateState>[]>
  getAccessCount: () => number
  decodeMessage: (rawMessage: any) => DecodedMessage | null
  isCanceled: () => boolean
  pinCheckpoints?: boolean
}

export async function getSceneBackfillSnapshot({
  decodeMessage,
  getAccessCount,
  isCanceled,
  reader,
  sceneCheckpoints,
  seekTimeNs,
  topic,
  pinCheckpoints = false,
}: SceneBackfillOptions): Promise<DecodedMessage[]> {
  if (!reader) {
    return []
  }
  const checkpoint = findCheckpoint(sceneCheckpoints, topic, seekTimeNs, getAccessCount)
  const state = checkpoint?.state.clone() || new SceneUpdateState()
  let lastMessage = checkpoint?.lastMessage
  let lastCheckpointTimeNs = checkpoint?.timeNs
  let messagesSinceCheckpoint = 0n
  const checkpointIntervalNs = getStateCheckpointIntervalNs(reader)
  const checkpointMessageInterval = getStateCheckpointMessageInterval(reader, topic)
  const iterator = reader.readMessages({
    ...(checkpoint ? { startTime: checkpoint.resumeTimeNs } : {}),
    endTime: seekTimeNs + 1n,
    topics: [topic],
  })

  for await (const rawMessage of iterator) {
    if (isCanceled()) {
      return []
    }
    const decoded = decodeMessage(rawMessage)
    if (!decoded) {
      continue
    }
    if (
      lastMessage
      && lastCheckpointTimeNs !== undefined
      && decoded.logTime > lastMessage.logTime
      && (
        decoded.logTime - lastCheckpointTimeNs >= checkpointIntervalNs
        || messagesSinceCheckpoint >= checkpointMessageInterval
      )
    ) {
      const boundaryTimeNs = decoded.logTime > 0n ? decoded.logTime - 1n : 0n
      storeCheckpoint(sceneCheckpoints, topic, {
        timeNs: boundaryTimeNs,
        resumeTimeNs: decoded.logTime,
        state: state.clone(),
        lastMessage,
        pinned: pinCheckpoints,
      }, getAccessCount(), MAX_STATE_CHECKPOINTS_PER_TOPIC)
      lastCheckpointTimeNs = boundaryTimeNs
      messagesSinceCheckpoint = 0n
    }
    state.advanceTo(seekTimeNs)
    state.applyMutation(decoded.payload, decoded.logTime)
    lastMessage = decoded
    messagesSinceCheckpoint++
    // A single static SceneUpdate is common. Persist its initial state so every
    // later seek can start at that message instead of decompressing from zero.
    if (lastCheckpointTimeNs === undefined) {
      storeCheckpoint(sceneCheckpoints, topic, {
        timeNs: decoded.logTime,
        resumeTimeNs: decoded.logTime + 1n,
        state: state.clone(),
        lastMessage: decoded,
        pinned: pinCheckpoints,
      }, getAccessCount(), MAX_STATE_CHECKPOINTS_PER_TOPIC)
      lastCheckpointTimeNs = decoded.logTime
      messagesSinceCheckpoint = 0n
    }
  }

  if (!lastMessage || isCanceled()) {
    return []
  }
  state.advanceTo(seekTimeNs)
  storeCheckpoint(sceneCheckpoints, topic, {
    timeNs: seekTimeNs,
    resumeTimeNs: seekTimeNs + 1n,
    state: state.clone(),
    lastMessage,
    pinned: pinCheckpoints,
  }, getAccessCount(), MAX_STATE_CHECKPOINTS_PER_TOPIC)
  return [{
    ...lastMessage,
    logTime: seekTimeNs,
    publishTime: seekTimeNs,
    dataLength: 0,
    payload: state.toFullUpdate(seekTimeNs),
    sceneSnapshot: true,
  }]
}
