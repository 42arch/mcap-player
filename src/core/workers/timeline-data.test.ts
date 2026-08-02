import { describe, expect, it } from 'vitest'
import {
  collectTimelineData,
  findNearestTimelineTimestamp,
  findVisibleTimelineBucketRange,
  lowerBoundTimestamp,
  upperBoundTimestamp,
} from './timeline-data'

async function* messages(values: Array<{ channelId: number, logTime: bigint }>) {
  yield* values
}

describe('collectTimelineData', () => {
  it('groups channels by topic, normalizes timestamps, and preserves empty topics', async () => {
    const result = await collectTimelineData({
      channels: [
        { id: 1, topic: '/camera' },
        { id: 2, topic: '/imu' },
        { id: 3, topic: '/camera' },
        { id: 4, topic: '/empty' },
      ],
      messages: messages([
        { channelId: 1, logTime: 100n },
        { channelId: 2, logTime: 110n },
        { channelId: 3, logTime: 120n },
        { channelId: 1, logTime: 130n },
      ]),
      startTimeNs: 100n,
      endTimeNs: 140n,
      bucketCount: 4,
    })

    expect(result.map(topic => topic.topic)).toEqual(['/camera', '/empty', '/imu'])
    expect(result.map(topic => topic.messageCount)).toEqual([3, 0, 1])
    expect(Array.from(result[0].bucketStartTimes)).toEqual([0n, 20n, 30n])
    expect(Array.from(result[0].bucketCounts)).toEqual([1, 1, 1])
    expect(Array.from(result[1].bucketStartTimes)).toEqual([])
    expect(Array.from(result[2].bucketStartTimes)).toEqual([10n])
  })

  it('keeps storage bounded when a topic contains many messages', async () => {
    const result = await collectTimelineData({
      channels: [{ id: 1, topic: '/topic' }],
      messages: messages(Array.from({ length: 1000 }, (_, index) => ({
        channelId: 1,
        logTime: BigInt(index),
      }))),
      startTimeNs: 0n,
      endTimeNs: 999n,
      bucketCount: 16,
    })

    expect(result[0].messageCount).toBe(1000)
    expect(result[0].bucketStartTimes.length).toBeLessThanOrEqual(16)
    expect(Array.from(result[0].bucketCounts).reduce((sum, count) => sum + count, 0)).toBe(1000)
  })

  it('ignores messages whose channel is not present in the summary', async () => {
    const result = await collectTimelineData({
      channels: [{ id: 1, topic: '/known' }],
      messages: messages([
        { channelId: 99, logTime: 5n },
        { channelId: 1, logTime: 7n },
      ]),
      startTimeNs: 5n,
      endTimeNs: 10n,
    })

    expect(Array.from(result[0].bucketStartTimes)).toEqual([2n])
  })
})

describe('timestamp binary search', () => {
  const times = BigUint64Array.from([10n, 20n, 20n, 40n])

  it('finds inclusive lower and upper bounds', () => {
    expect(lowerBoundTimestamp(times, 20n)).toBe(1)
    expect(upperBoundTimestamp(times, 20n)).toBe(3)
  })
})

describe('timeline bucket lookup', () => {
  const topic = {
    topic: '/camera',
    messageCount: 5,
    bucketStartTimes: BigUint64Array.from([10n, 30n]),
    bucketEndTimes: BigUint64Array.from([20n, 40n]),
    bucketCounts: Uint32Array.from([2, 3]),
  }

  it('finds buckets intersecting a visible range', () => {
    expect(findVisibleTimelineBucketRange(topic, 15n, 35n)).toEqual([0, 2])
    expect(findVisibleTimelineBucketRange(topic, 21n, 29n)).toEqual([1, 1])
  })

  it('finds the nearest retained bucket boundary', () => {
    expect(findNearestTimelineTimestamp(topic, 27n)).toEqual({ bucketIndex: 1, timeNs: 30n })
    expect(findNearestTimelineTimestamp(topic, 18n)).toEqual({ bucketIndex: 0, timeNs: 20n })
  })
})
