import type { McapIndexedReader } from '@mcap/core'
import type { BackfillCheckpoint } from './backfill-checkpoint-cache'
import type { DecodedMessage } from './message-cursor'
import { findCheckpoint, storeCheckpoint } from './backfill-checkpoint-cache'
import { TransformUpdateState } from './transform-state-accumulator'

const MIN_TRANSFORM_CHECKPOINT_INTERVAL_NS = 10_000_000_000n
const MAX_TRANSFORM_CHECKPOINTS_PER_TOPIC = 4096
const PINNED_TRANSFORM_CHECKPOINT_TARGET = 400n
const PINNED_TRANSFORM_MESSAGE_TARGET = 2048n
const MAX_TRANSFORM_MESSAGES_PER_CHECKPOINT = 128n

function getRecordingDurationNs(reader: McapIndexedReader): bigint {
  const statistics = reader.statistics
  if (statistics && statistics.messageEndTime >= statistics.messageStartTime) {
    return statistics.messageEndTime - statistics.messageStartTime
  }
  const firstChunk = reader.chunkIndexes?.[0]
  const lastChunk = reader.chunkIndexes?.at(-1)
  if (!firstChunk || !lastChunk || lastChunk.messageEndTime < firstChunk.messageStartTime) {
    return 0n
  }
  return lastChunk.messageEndTime - firstChunk.messageStartTime
}

function getTransformCheckpointIntervalNs(reader: McapIndexedReader): bigint {
  const durationNs = getRecordingDurationNs(reader)
  const coveringInterval = durationNs > 0n
    ? (durationNs + PINNED_TRANSFORM_CHECKPOINT_TARGET - 1n) / PINNED_TRANSFORM_CHECKPOINT_TARGET
    : 0n
  return coveringInterval > MIN_TRANSFORM_CHECKPOINT_INTERVAL_NS
    ? coveringInterval
    : MIN_TRANSFORM_CHECKPOINT_INTERVAL_NS
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

function getTransformCheckpointMessageInterval(reader: McapIndexedReader, topic: string): bigint {
  const messageCount = getTopicMessageCount(reader, topic)
  const coveringInterval = messageCount > 0n
    ? (messageCount + PINNED_TRANSFORM_MESSAGE_TARGET - 1n) / PINNED_TRANSFORM_MESSAGE_TARGET
    : 0n
  return coveringInterval > MAX_TRANSFORM_MESSAGES_PER_CHECKPOINT
    ? coveringInterval
    : MAX_TRANSFORM_MESSAGES_PER_CHECKPOINT
}

function isStaticTransformTopic(topic: string): boolean {
  const normalized = topic.trim().toLowerCase().replace(/\/+$/, '')
  return normalized === '/tf_static' || normalized.endsWith('/tf_static')
}

export interface TransformBackfillOptions {
  reader: McapIndexedReader | null
  topics: readonly string[]
  seekTimeNs: bigint
  transformCheckpoints: Map<string, BackfillCheckpoint<TransformUpdateState>[]>
  getAccessCount: () => number
  decodeMessage: (rawMessage: any) => DecodedMessage | null
  isCanceled: () => boolean
  pinCheckpoints?: boolean
}

export async function getTransformBackfillSnapshots({
  decodeMessage,
  getAccessCount,
  isCanceled,
  reader,
  seekTimeNs,
  topics,
  transformCheckpoints,
  pinCheckpoints = false,
}: TransformBackfillOptions): Promise<DecodedMessage[]> {
  if (!reader || topics.length === 0) {
    return []
  }

  const uniqueTopics = Array.from(new Set(topics))
  const checkpointIntervalNs = getTransformCheckpointIntervalNs(reader)
  const staticTopics = new Set(uniqueTopics.filter(isStaticTransformTopic))
  const topicStates = new Map(uniqueTopics.map((topic) => {
    const checkpoint = findCheckpoint(transformCheckpoints, topic, seekTimeNs, getAccessCount)
    return [topic, {
      checkpoint,
      state: checkpoint?.state.clone() || new TransformUpdateState(),
      lastMessage: checkpoint?.lastMessage,
      lastCheckpointTimeNs: checkpoint?.timeNs,
      messagesSinceCheckpoint: 0n,
      checkpointMessageInterval: getTransformCheckpointMessageInterval(reader, topic),
    }]
  }))
  const topicsWithCheckpoint = uniqueTopics.filter(topic => topicStates.get(topic)?.checkpoint)
  const topicsWithoutCheckpoint = uniqueTopics.filter(topic => !topicStates.get(topic)?.checkpoint)
  const scanGroups: Array<{ startTime?: bigint, topics: string[] }> = []
  if (topicsWithoutCheckpoint.length > 0) {
    scanGroups.push({ topics: topicsWithoutCheckpoint })
  }
  const appendCheckpointScanGroup = (groupTopics: string[]) => {
    if (groupTopics.length === 0) {
      return
    }
    const sharedStartTimeNs = groupTopics.reduce((earliest, topic) => {
      const resumeTimeNs = topicStates.get(topic)!.checkpoint!.resumeTimeNs
      return resumeTimeNs < earliest ? resumeTimeNs : earliest
    }, topicStates.get(groupTopics[0])!.checkpoint!.resumeTimeNs)
    scanGroups.push({ startTime: sharedStartTimeNs, topics: groupTopics })
  }
  // A latched static checkpoint may be hours older than the nearest dynamic
  // checkpoint. Keep static and dynamic scans separate so the former never
  // expands the high-rate TF decompression window.
  appendCheckpointScanGroup(topicsWithCheckpoint.filter(topic => !staticTopics.has(topic)))
  appendCheckpointScanGroup(topicsWithCheckpoint.filter(topic => staticTopics.has(topic)))

  // TF topics are generally interleaved in the same MCAP chunks. Topics that
  // share checkpoint coverage use one iterator. A sparse topic without a
  // checkpoint (most often /tf_static before its first sample) gets a separate
  // scan so it cannot drag all dynamic TF back to the beginning of the file.
  const effectiveEndTimeNs = seekTimeNs <= 0n ? 3_000_000_000n : seekTimeNs + 1n
  for (const scanGroup of scanGroups) {
    const iterator = reader.readMessages({
      ...(scanGroup.startTime !== undefined ? { startTime: scanGroup.startTime } : {}),
      endTime: effectiveEndTimeNs,
      topics: scanGroup.topics,
    })

    for await (const rawMessage of iterator) {
      if (isCanceled()) {
        return []
      }
      const topic = reader.channelsById.get(rawMessage.channelId)?.topic
      const topicState = topic ? topicStates.get(topic) : undefined
      if (!topic || !topicState) {
        continue
      }
      if (topicState.checkpoint && rawMessage.logTime < topicState.checkpoint.resumeTimeNs) {
        continue
      }
      const decoded = decodeMessage(rawMessage)
      if (!decoded) {
        continue
      }
      if (
        topicState.lastMessage
        && topicState.lastCheckpointTimeNs !== undefined
        && decoded.logTime > topicState.lastMessage.logTime
        && (
          decoded.logTime - topicState.lastCheckpointTimeNs >= checkpointIntervalNs
          || topicState.messagesSinceCheckpoint >= topicState.checkpointMessageInterval
        )
      ) {
        const boundaryTimeNs = decoded.logTime > 0n ? decoded.logTime - 1n : 0n
        storeCheckpoint(transformCheckpoints, topic, {
          timeNs: boundaryTimeNs,
          resumeTimeNs: decoded.logTime,
          state: topicState.state.clone(),
          lastMessage: topicState.lastMessage,
          pinned: pinCheckpoints,
        }, getAccessCount(), MAX_TRANSFORM_CHECKPOINTS_PER_TOPIC)
        topicState.lastCheckpointTimeNs = boundaryTimeNs
        topicState.messagesSinceCheckpoint = 0n
      }
      topicState.state.apply(decoded.payload)
      topicState.lastMessage = decoded
      topicState.messagesSinceCheckpoint++
      // Store a baseline after the first message so backward seeks near the start
      // never force unrelated TF topics back to the beginning. Static TF is
      // latched and sparse, so every update is a useful permanent boundary.
      if (topicState.lastCheckpointTimeNs === undefined || staticTopics.has(topic)) {
        storeCheckpoint(transformCheckpoints, topic, {
          timeNs: decoded.logTime,
          resumeTimeNs: decoded.logTime + 1n,
          state: topicState.state.clone(),
          lastMessage: decoded,
          pinned: pinCheckpoints,
        }, getAccessCount(), MAX_TRANSFORM_CHECKPOINTS_PER_TOPIC)
        topicState.lastCheckpointTimeNs = decoded.logTime
        topicState.messagesSinceCheckpoint = 0n
      }
    }
  }

  if (isCanceled()) {
    return []
  }

  const messages: DecodedMessage[] = []
  for (const topic of uniqueTopics) {
    const topicState = topicStates.get(topic)!
    if (!topicState.lastMessage) {
      continue
    }
    storeCheckpoint(transformCheckpoints, topic, {
      timeNs: seekTimeNs,
      resumeTimeNs: seekTimeNs + 1n,
      state: topicState.state.clone(),
      lastMessage: topicState.lastMessage,
      pinned: pinCheckpoints,
    }, getAccessCount(), MAX_TRANSFORM_CHECKPOINTS_PER_TOPIC)
    messages.push(...topicState.state.toSnapshotMessages(topicState.lastMessage, seekTimeNs))
  }
  return messages
}
