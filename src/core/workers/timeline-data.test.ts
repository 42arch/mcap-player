import { describe, expect, it } from 'vitest'
import {
  collectTimelineData,
  findVisibleTimestampRange,
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
      channelMessageCounts: new Map([
        [1, 2n],
        [2, 1n],
        [3, 1n],
        [4, 0n],
      ]),
      messages: messages([
        { channelId: 1, logTime: 100n },
        { channelId: 2, logTime: 110n },
        { channelId: 3, logTime: 120n },
        { channelId: 1, logTime: 130n },
      ]),
      startTimeNs: 100n,
    })

    expect(result.map(topic => topic.topic)).toEqual(['/camera', '/empty', '/imu'])
    expect(result.map(topic => topic.messageCount)).toEqual([3, 0, 1])
    expect(Array.from(result[0].times)).toEqual([0n, 20n, 30n])
    expect(Array.from(result[1].times)).toEqual([])
    expect(Array.from(result[2].times)).toEqual([10n])
  })

  it('falls back to growable storage when statistics undercount messages', async () => {
    const result = await collectTimelineData({
      channels: [{ id: 1, topic: '/topic' }],
      channelMessageCounts: new Map([[1, 1n]]),
      messages: messages([
        { channelId: 1, logTime: 5n },
        { channelId: 1, logTime: 6n },
      ]),
      startTimeNs: 5n,
    })

    expect(result[0].messageCount).toBe(2)
    expect(Array.from(result[0].times)).toEqual([0n, 1n])
  })

  it('ignores messages whose channel is not present in the summary', async () => {
    const result = await collectTimelineData({
      channels: [{ id: 1, topic: '/known' }],
      messages: messages([
        { channelId: 99, logTime: 5n },
        { channelId: 1, logTime: 7n },
      ]),
      startTimeNs: 5n,
    })

    expect(Array.from(result[0].times)).toEqual([2n])
  })
})

describe('timestamp range lookup', () => {
  const times = BigUint64Array.from([10n, 20n, 20n, 40n])

  it('finds inclusive lower and upper bounds', () => {
    expect(lowerBoundTimestamp(times, 20n)).toBe(1)
    expect(upperBoundTimestamp(times, 20n)).toBe(3)
    expect(findVisibleTimestampRange(times, 20n, 40n)).toEqual([1, 4])
  })

  it('returns an empty range outside the data', () => {
    expect(findVisibleTimestampRange(times, 21n, 39n)).toEqual([3, 3])
    expect(findVisibleTimestampRange(times, 50n, 60n)).toEqual([4, 4])
  })
})
