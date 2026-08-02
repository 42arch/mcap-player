export interface TimelineChannel {
  id: number
  topic: string
}

export interface TimelineMessage {
  channelId: number
  logTime: bigint
}

export interface TimelineTopicData {
  topic: string
  messageCount: number
  bucketStartTimes: BigUint64Array
  bucketEndTimes: BigUint64Array
  bucketCounts: Uint32Array
}

interface TopicAccumulator {
  topic: string
  messageCount: number
  buckets: Map<number, {
    count: number
    firstTimeNs: bigint
    lastTimeNs: bigint
  }>
}

interface CollectTimelineDataOptions {
  channels: Iterable<TimelineChannel>
  messages: AsyncIterable<TimelineMessage>
  startTimeNs: bigint
  endTimeNs: bigint
  bucketCount?: number
  isCanceled?: () => boolean
}

export const DEFAULT_TIMELINE_BUCKET_COUNT = 4096

function yieldToEventLoop(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}

function createTopicAccumulators(channels: readonly TimelineChannel[]) {
  const topics = new Set<string>()
  for (const channel of channels) {
    topics.add(channel.topic)
  }

  return new Map(
    Array.from(topics, topic => [
      topic,
      {
        topic,
        messageCount: 0,
        buckets: new Map(),
      } satisfies TopicAccumulator,
    ]),
  )
}

function appendTimestamp(
  accumulator: TopicAccumulator,
  timestampNs: bigint,
  durationNs: bigint,
  bucketCount: number,
) {
  const bucketIndex = Math.min(
    bucketCount - 1,
    Number(timestampNs * BigInt(bucketCount) / (durationNs + 1n)),
  )
  const bucket = accumulator.buckets.get(bucketIndex)
  accumulator.messageCount++
  if (!bucket) {
    accumulator.buckets.set(bucketIndex, {
      count: 1,
      firstTimeNs: timestampNs,
      lastTimeNs: timestampNs,
    })
    return
  }
  bucket.count++
  bucket.lastTimeNs = timestampNs
}

function finalizeAccumulator(accumulator: TopicAccumulator): TimelineTopicData {
  const bucketIndexes = Array.from(accumulator.buckets.keys()).sort((a, b) => a - b)
  const bucketStartTimes = new BigUint64Array(bucketIndexes.length)
  const bucketEndTimes = new BigUint64Array(bucketIndexes.length)
  const bucketCounts = new Uint32Array(bucketIndexes.length)
  bucketIndexes.forEach((bucketIndex, index) => {
    const bucket = accumulator.buckets.get(bucketIndex)!
    bucketStartTimes[index] = bucket.firstTimeNs
    bucketEndTimes[index] = bucket.lastTimeNs
    bucketCounts[index] = Math.min(bucket.count, 0xFFFF_FFFF)
  })

  return {
    topic: accumulator.topic,
    messageCount: accumulator.messageCount,
    bucketStartTimes,
    bucketEndTimes,
    bucketCounts,
  }
}

export async function collectTimelineData({
  channels,
  messages,
  startTimeNs,
  endTimeNs,
  bucketCount = DEFAULT_TIMELINE_BUCKET_COUNT,
  isCanceled = () => false,
}: CollectTimelineDataOptions): Promise<TimelineTopicData[]> {
  const channelList = Array.from(channels)
  const topicByChannelId = new Map(channelList.map(channel => [channel.id, channel.topic]))
  const accumulators = createTopicAccumulators(channelList)
  const normalizedBucketCount = Math.max(1, Math.trunc(bucketCount))
  const durationNs = endTimeNs > startTimeNs ? endTimeNs - startTimeNs : 1n
  let sliceStart = performance.now()
  let sliceMessages = 0

  for await (const message of messages) {
    if (isCanceled()) {
      return []
    }
    const topic = topicByChannelId.get(message.channelId)
    if (!topic) {
      continue
    }

    const accumulator = accumulators.get(topic)
    if (!accumulator) {
      continue
    }

    let relativeTimeNs = message.logTime >= startTimeNs ? message.logTime - startTimeNs : 0n
    if (relativeTimeNs > durationNs) {
      relativeTimeNs = durationNs
    }
    appendTimestamp(accumulator, relativeTimeNs, durationNs, normalizedBucketCount)

    sliceMessages++
    if (sliceMessages >= 2048 || performance.now() - sliceStart >= 8) {
      await yieldToEventLoop()
      if (isCanceled()) {
        return []
      }
      sliceStart = performance.now()
      sliceMessages = 0
    }
  }

  return Array.from(accumulators.values())
    .sort((a, b) => a.topic.localeCompare(b.topic))
    .map(finalizeAccumulator)
}

export function lowerBoundTimestamp(times: BigUint64Array, target: bigint): number {
  let low = 0
  let high = times.length

  while (low < high) {
    const middle = low + Math.floor((high - low) / 2)
    if (times[middle] < target) {
      low = middle + 1
    }
    else {
      high = middle
    }
  }

  return low
}

export function upperBoundTimestamp(times: BigUint64Array, target: bigint): number {
  let low = 0
  let high = times.length

  while (low < high) {
    const middle = low + Math.floor((high - low) / 2)
    if (times[middle] <= target) {
      low = middle + 1
    }
    else {
      high = middle
    }
  }

  return low
}

export function findVisibleTimelineBucketRange(
  topic: TimelineTopicData,
  minTimeNs: bigint,
  maxTimeNs: bigint,
): [startIndex: number, endIndex: number] {
  return [
    lowerBoundTimestamp(topic.bucketEndTimes, minTimeNs),
    upperBoundTimestamp(topic.bucketStartTimes, maxTimeNs),
  ]
}

export function findNearestTimelineTimestamp(
  topic: TimelineTopicData,
  targetTimeNs: bigint,
): { bucketIndex: number, timeNs: bigint } | null {
  if (topic.bucketStartTimes.length === 0) {
    return null
  }
  const insertionIndex = lowerBoundTimestamp(topic.bucketStartTimes, targetTimeNs)
  const candidateIndexes = new Set([
    Math.max(0, insertionIndex - 1),
    Math.min(topic.bucketStartTimes.length - 1, insertionIndex),
  ])
  let nearest: { bucketIndex: number, timeNs: bigint, distance: bigint } | null = null
  for (const bucketIndex of candidateIndexes) {
    for (const timeNs of [topic.bucketStartTimes[bucketIndex], topic.bucketEndTimes[bucketIndex]]) {
      const distance = timeNs >= targetTimeNs ? timeNs - targetTimeNs : targetTimeNs - timeNs
      if (!nearest || distance < nearest.distance) {
        nearest = { bucketIndex, timeNs, distance }
      }
    }
  }
  return nearest && { bucketIndex: nearest.bucketIndex, timeNs: nearest.timeNs }
}
