import { afterEach, describe, expect, it, vi } from 'vitest'
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
  afterEach(() => {
    vi.unstubAllGlobals()
  })

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

  it('drops a pending latest message when seeking before its frame flush', () => {
    let scheduledFrame: FrameRequestCallback | undefined
    const cancelAnimationFrame = vi.fn()
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      scheduledFrame = callback
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame)

    const pipeline = new MessagePipeline()
    const received: number[] = []
    pipeline.subscribe({
      panelId: 'three-d',
      subscriptionId: 'points',
      topics: [{ topic: '/points', mode: 'latest' }],
    }, event => received.push(event.sequence))

    pipeline.dispatch([message('/points', 1)])
    pipeline.emitSeek(10n)
    scheduledFrame?.(0)

    expect(cancelAnimationFrame).toHaveBeenCalledWith(1)
    expect(received).toEqual([])
  })

  it('flushes latest seek results before notifying seek completion', () => {
    vi.stubGlobal('requestAnimationFrame', () => 1)
    vi.stubGlobal('cancelAnimationFrame', vi.fn())

    const pipeline = new MessagePipeline()
    const events: string[] = []
    pipeline.subscribe({
      panelId: 'three-d',
      subscriptionId: 'points',
      topics: [{ topic: '/points', mode: 'latest' }],
    }, event => events.push(`message:${event.sequence}`))
    pipeline.subscribeSeekComplete('three-d', () => events.push('complete'))

    pipeline.dispatchSeekResult([message('/points', 2)])
    pipeline.emitSeekComplete(20n)

    expect(events).toEqual(['message:2', 'complete'])
  })
})
