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

  it('delivers high-priority consumers before normal consumers', () => {
    const pipeline = new MessagePipeline()
    const deliveryOrder: string[] = []
    pipeline.subscribe({
      panelId: 'raw-camera',
      subscriptionId: 'message',
      topics: [{ topic: '/camera', mode: 'all' }],
    }, () => deliveryOrder.push('normal'))
    pipeline.subscribe({
      panelId: 'image-camera',
      subscriptionId: 'frame',
      topics: [{ topic: '/camera', mode: 'all', priority: 'high' }],
    }, () => deliveryOrder.push('high'))

    pipeline.dispatch([message('/camera', 1)])

    expect(deliveryOrder).toEqual(['high', 'normal'])
  })

  it('shares one animation frame across latest subscriptions', () => {
    let scheduledFrame: FrameRequestCallback | undefined
    const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      scheduledFrame = callback
      return 1
    })
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrame)
    vi.stubGlobal('cancelAnimationFrame', vi.fn())

    const pipeline = new MessagePipeline()
    const received: string[] = []
    pipeline.subscribe({
      panelId: 'one',
      subscriptionId: 'latest',
      topics: [{ topic: '/camera', mode: 'latest' }],
    }, () => received.push('one'))
    pipeline.subscribe({
      panelId: 'two',
      subscriptionId: 'latest',
      topics: [{ topic: '/camera', mode: 'latest' }],
    }, () => received.push('two'))

    pipeline.dispatch([message('/camera', 1)])

    expect(requestAnimationFrame).toHaveBeenCalledTimes(1)
    scheduledFrame?.(0)
    expect(received).toEqual(['one', 'two'])
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

  it('merges duplicate topic interests without delivering twice', () => {
    const pipeline = new MessagePipeline()
    const received: number[] = []
    pipeline.subscribe({
      panelId: 'combined',
      subscriptionId: 'camera',
      topics: [
        {
          topic: '/camera',
          mode: 'latest',
          priority: 'high',
          processor: { type: 'point-cloud', maxPoints: 100 },
        },
        { topic: '/camera', mode: 'all' },
      ],
    }, event => received.push(event.sequence))

    pipeline.dispatch([message('/camera', 1)])

    expect(received).toEqual([1])
    expect(pipeline.getQueryPlan()).toEqual({
      topics: ['/camera'],
      modeByTopic: { '/camera': 'all' },
    })
  })

  it('uses the largest compatible point-cloud processor requested by subscribers', () => {
    const pipeline = new MessagePipeline()
    pipeline.subscribe({
      panelId: 'three-d-small',
      subscriptionId: 'points',
      topics: [{
        topic: '/points',
        mode: 'latest',
        processor: { type: 'point-cloud', maxPoints: 100000 },
      }],
    }, () => {})
    pipeline.subscribe({
      panelId: 'three-d-large',
      subscriptionId: 'points',
      topics: [{
        topic: '/points',
        mode: 'latest',
        processor: { type: 'point-cloud', maxPoints: 300000 },
      }],
    }, () => {})

    expect(pipeline.getQueryPlan().processorsByTopic).toEqual({
      '/points': { type: 'point-cloud', maxPoints: 300000 },
    })
  })

  it('disables worker preprocessing when a raw subscriber needs the same topic', () => {
    const pipeline = new MessagePipeline()
    pipeline.subscribe({
      panelId: 'three-d',
      subscriptionId: 'points',
      topics: [{
        topic: '/points',
        mode: 'latest',
        processor: { type: 'point-cloud', maxPoints: 200000 },
      }],
    }, () => {})
    pipeline.subscribe({
      panelId: 'raw',
      subscriptionId: 'points',
      topics: [{ topic: '/points', mode: 'all' }],
    }, () => {})

    expect(pipeline.getQueryPlan().processorsByTopic).toBeUndefined()
  })

  it('omits a retained static topic only from eligible seek plans', () => {
    const pipeline = new MessagePipeline()
    pipeline.subscribe({
      panelId: 'three-d',
      subscriptionId: 'map',
      topics: [{
        topic: '/map',
        mode: 'latest',
        retainOnSeek: timeNs => timeNs >= 5n,
      }],
    }, () => {})
    pipeline.subscribe({
      panelId: 'three-d',
      subscriptionId: 'points',
      topics: [{ topic: '/points', mode: 'latest' }],
    }, () => {})

    expect(pipeline.getQueryPlan().topics).toEqual(['/map', '/points'])
    expect(pipeline.getSeekQueryPlan(4n).topics).toEqual(['/map', '/points'])
    expect(pipeline.getSeekQueryPlan(5n).topics).toEqual(['/points'])
  })

  it('keeps a retained topic in seek plans when another subscriber needs it', () => {
    const pipeline = new MessagePipeline()
    pipeline.subscribe({
      panelId: 'three-d',
      subscriptionId: 'map',
      topics: [{ topic: '/map', mode: 'latest', retainOnSeek: () => true }],
    }, () => {})
    pipeline.subscribe({
      panelId: 'raw-map',
      subscriptionId: 'message',
      topics: [{ topic: '/map', mode: 'all' }],
    }, () => {})

    expect(pipeline.getSeekQueryPlan(10n)).toEqual({
      topics: ['/map'],
      modeByTopic: { '/map': 'all' },
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
