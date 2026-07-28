import { describe, expect, it } from 'vitest'
import { MessagePipeline } from './message-pipeline'

function message(topic: string, sequence: number) {
  return {
    topic,
    channelId: 1,
    logTime: BigInt(sequence),
    publishTime: BigInt(sequence),
    sequence,
    dataLength: 0,
    payload: {},
  }
}

describe('messagePipeline', () => {
  it('routes messages only to the panel instance that declared the topic', () => {
    const pipeline = new MessagePipeline()
    const imageMessages: string[] = []
    const rawMessages: string[] = []

    pipeline.subscribe({
      panelId: 'image-front',
      subscriptionId: 'frame',
      topics: [{ topic: '/camera/front', mode: 'all' }],
    }, event => imageMessages.push(event.topic))

    pipeline.subscribe({
      panelId: 'raw-imu',
      subscriptionId: 'message',
      topics: [{ topic: '/imu', mode: 'all' }],
    }, event => rawMessages.push(event.topic))

    pipeline.dispatch([message('/camera/front', 1), message('/imu', 2)])

    expect(imageMessages).toEqual(['/camera/front'])
    expect(rawMessages).toEqual(['/imu'])
  })

  it('requests the strongest delivery policy for a shared topic', () => {
    const pipeline = new MessagePipeline()
    pipeline.subscribe({
      panelId: 'image-front',
      subscriptionId: 'frame',
      topics: [{ topic: '/camera/front', mode: 'latest' }],
    }, () => {})
    pipeline.subscribe({
      panelId: 'raw-camera',
      subscriptionId: 'message',
      topics: [{ topic: '/camera/front', mode: 'all' }],
    }, () => {})

    expect(pipeline.getQueryPlan()).toEqual({
      topics: ['/camera/front'],
      modeByTopic: { '/camera/front': 'all' },
    })
  })

  it('removes all subscriptions when a panel closes', () => {
    const pipeline = new MessagePipeline()
    pipeline.subscribe({
      panelId: 'three-d',
      subscriptionId: 'points',
      topics: [{ topic: '/points', mode: 'latest' }],
    }, () => {})
    pipeline.subscribe({
      panelId: 'three-d',
      subscriptionId: 'tf',
      topics: [{ topic: '/tf', mode: 'all' }],
    }, () => {})

    pipeline.clearPanel('three-d')

    expect(pipeline.getQueryPlan()).toEqual({ topics: [], modeByTopic: {} })
  })
})
