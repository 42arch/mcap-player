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
  times: BigUint64Array
}

interface TopicAccumulator {
  topic: string
  length: number
  storage: BigUint64Array | bigint[]
}

interface CollectTimelineDataOptions {
  channels: Iterable<TimelineChannel>
  channelMessageCounts?: ReadonlyMap<number, bigint>
  messages: AsyncIterable<TimelineMessage>
  startTimeNs: bigint
}

function createTopicAccumulators(
  channels: readonly TimelineChannel[],
  channelMessageCounts?: ReadonlyMap<number, bigint>,
) {
  const expectedCounts = new Map<string, number>()
  for (const channel of channels) {
    const expected = Number(channelMessageCounts?.get(channel.id) ?? 0n)
    expectedCounts.set(channel.topic, (expectedCounts.get(channel.topic) ?? 0) + expected)
  }

  return new Map(
    Array.from(expectedCounts.entries(), ([topic, expectedCount]) => [
      topic,
      {
        topic,
        length: 0,
        storage: expectedCount > 0 ? new BigUint64Array(expectedCount) : [],
      } satisfies TopicAccumulator,
    ]),
  )
}

function appendTimestamp(accumulator: TopicAccumulator, timestampNs: bigint) {
  if (Array.isArray(accumulator.storage)) {
    accumulator.storage.push(timestampNs)
    accumulator.length++
    return
  }

  if (accumulator.length < accumulator.storage.length) {
    accumulator.storage[accumulator.length] = timestampNs
    accumulator.length++
    return
  }

  // Statistics are optional and may be incomplete. Fall back to a growable
  // array if the actual message count exceeds the advertised count.
  const values = Array.from(accumulator.storage)
  values.push(timestampNs)
  accumulator.storage = values
  accumulator.length++
}

function finalizeAccumulator(accumulator: TopicAccumulator): TimelineTopicData {
  const times = Array.isArray(accumulator.storage)
    ? BigUint64Array.from(accumulator.storage)
    : accumulator.length === accumulator.storage.length
      ? accumulator.storage
      : accumulator.storage.slice(0, accumulator.length)

  return {
    topic: accumulator.topic,
    messageCount: accumulator.length,
    times,
  }
}

export async function collectTimelineData({
  channels,
  channelMessageCounts,
  messages,
  startTimeNs,
}: CollectTimelineDataOptions): Promise<TimelineTopicData[]> {
  const channelList = Array.from(channels)
  const topicByChannelId = new Map(channelList.map(channel => [channel.id, channel.topic]))
  const accumulators = createTopicAccumulators(channelList, channelMessageCounts)

  for await (const message of messages) {
    const topic = topicByChannelId.get(message.channelId)
    if (!topic) {
      continue
    }

    const accumulator = accumulators.get(topic)
    if (!accumulator) {
      continue
    }

    const relativeTimeNs = message.logTime >= startTimeNs
      ? message.logTime - startTimeNs
      : 0n
    appendTimestamp(accumulator, relativeTimeNs)
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

export function findVisibleTimestampRange(
  times: BigUint64Array,
  minTimeNs: bigint,
  maxTimeNs: bigint,
): [startIndex: number, endIndex: number] {
  return [
    lowerBoundTimestamp(times, minTimeNs),
    upperBoundTimestamp(times, maxTimeNs),
  ]
}
