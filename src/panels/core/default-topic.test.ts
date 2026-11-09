import type { McapChannel } from '@/stores/use-player-store'
import { describe, expect, it } from 'vitest'
import { isSelectableImageChannel, planDefaultTopics } from './default-topic'

function channel(topic: string, schemaName?: string): McapChannel {
  return {
    id: topic.length,
    topic,
    schemaId: 1,
    schemaName,
    messageCount: 1,
  }
}

describe('planDefaultTopics', () => {
  const topics = ['/cam/front', '/cam/left', '/cam/right']

  it('selects the first channel when nothing is open', () => {
    expect(planDefaultTopics([{ id: 'image-1', topic: null }], topics)).toEqual([
      { id: 'image-1', topic: '/cam/front' },
    ])
  })

  it('skips a channel that another open panel is still showing', () => {
    expect(planDefaultTopics([
      { id: 'image-1', topic: '/cam/front' },
      { id: 'image-2', topic: null },
    ], topics)).toEqual([
      { id: 'image-2', topic: '/cam/left' },
    ])
  })

  it('reuses the first channel when the earlier panel no longer shows it', () => {
    expect(planDefaultTopics([
      { id: 'image-1', topic: '/cam/right' },
      { id: 'image-2', topic: null },
    ], topics)).toEqual([
      { id: 'image-2', topic: '/cam/front' },
    ])
  })

  it('fills several empty panels in order without repeating a shown channel', () => {
    expect(planDefaultTopics([
      { id: 'image-1', topic: null },
      { id: 'image-2', topic: null },
      { id: 'image-3', topic: null },
    ], topics)).toEqual([
      { id: 'image-1', topic: '/cam/front' },
      { id: 'image-2', topic: '/cam/left' },
      { id: 'image-3', topic: '/cam/right' },
    ])
  })

  it('falls back to the first channel when every channel is already shown', () => {
    expect(planDefaultTopics([
      { id: 'image-1', topic: '/cam/front' },
      { id: 'image-2', topic: '/cam/left' },
      { id: 'image-3', topic: null },
    ], ['/cam/front', '/cam/left'])).toEqual([
      { id: 'image-3', topic: '/cam/front' },
    ])
  })

  it('leaves a chosen topic unchanged and ignores duplicate channel names', () => {
    expect(planDefaultTopics([
      { id: 'image-1', topic: '/cam/left' },
    ], ['/cam/front', '/cam/front', '/cam/left'])).toEqual([])
  })

  it('replaces a topic that is not in the current channel list', () => {
    expect(planDefaultTopics([
      { id: 'image-1', topic: '/old/cam' },
      { id: 'image-2', topic: null },
    ], topics)).toEqual([
      { id: 'image-1', topic: '/cam/front' },
      { id: 'image-2', topic: '/cam/left' },
    ])
  })
})

describe('isSelectableImageChannel', () => {
  it('matches the image panel channel list', () => {
    expect(isSelectableImageChannel(channel('/cam', 'sensor_msgs/CompressedImage'))).toBe(true)
    expect(isSelectableImageChannel(channel('/video', 'foxglove.CompressedVideo'))).toBe(true)
    expect(isSelectableImageChannel(channel('/anno', 'foxglove.ImageAnnotations'))).toBe(false)
    expect(isSelectableImageChannel(channel('/info', 'foxglove.CameraCalibration'))).toBe(false)
    expect(isSelectableImageChannel(channel('/scan', 'sensor_msgs/LaserScan'))).toBe(false)
    expect(isSelectableImageChannel(channel('/raw', undefined))).toBe(false)
  })
})
