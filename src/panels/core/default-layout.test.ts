import type { McapChannel } from '@/stores/use-player-store'
import { describe, expect, it } from 'vitest'
import { computeGridPosition, planInitialPanels } from './default-layout'

function mockChannel(topic: string, schemaName?: string): McapChannel {
  return {
    id: 1,
    topic,
    schemaId: 1,
    schemaName,
    messageCount: 10,
  }
}

describe('planInitialPanels', () => {
  it('falls back to a single messages panel when channel list is empty', () => {
    const panels = planInitialPanels([])
    expect(panels).toEqual([{ type: 'messages' }])
  })

  it('falls back to a messages panel when no image channels exist', () => {
    const channels = [
      mockChannel('/scan', 'sensor_msgs/LaserScan'),
      mockChannel('/imu', 'sensor_msgs/Imu'),
      mockChannel('/cam/info', 'sensor_msgs/CameraInfo'),
    ]
    const panels = planInitialPanels(channels)
    expect(panels).toEqual([{ type: 'messages' }])
  })

  it('creates image panels for detected image channels', () => {
    const channels = [
      mockChannel('/scan', 'sensor_msgs/LaserScan'),
      mockChannel('/cam/front', 'sensor_msgs/Image'),
      mockChannel('/cam/rear', 'sensor_msgs/CompressedImage'),
    ]
    const panels = planInitialPanels(channels)
    expect(panels).toEqual([
      { type: 'image', initialConfig: { topic: '/cam/front' } },
      { type: 'image', initialConfig: { topic: '/cam/rear' } },
    ])
  })

  it('deduplicates image channels with the same topic', () => {
    const channels = [
      mockChannel('/cam/front', 'sensor_msgs/Image'),
      mockChannel('/cam/front', 'sensor_msgs/Image'),
      mockChannel('/cam/rear', 'foxglove.CompressedVideo'),
    ]
    const panels = planInitialPanels(channels)
    expect(panels).toHaveLength(2)
    expect(panels[0]?.initialConfig?.topic).toBe('/cam/front')
    expect(panels[1]?.initialConfig?.topic).toBe('/cam/rear')
  })

  it('limits image panels to a maximum of 6', () => {
    const channels = Array.from({ length: 10 }, (_, i) =>
      mockChannel(`/cam/${i}`, 'sensor_msgs/Image'))
    const panels = planInitialPanels(channels)

    expect(panels).toHaveLength(6)
    expect(panels.map(p => p.initialConfig?.topic)).toEqual([
      '/cam/0',
      '/cam/1',
      '/cam/2',
      '/cam/3',
      '/cam/4',
      '/cam/5',
    ])
  })
})

describe('computeGridPosition', () => {
  it('returns undefined for the first panel or single-panel layouts', () => {
    expect(computeGridPosition(0, 1, ['p0'])).toBeUndefined()
    expect(computeGridPosition(0, 4, ['p0'])).toBeUndefined()
  })

  it('places second panel to the right for 2-panel layout', () => {
    const ids = ['p0', 'p1']
    expect(computeGridPosition(1, 2, ids)).toEqual({
      referencePanel: 'p0',
      direction: 'right',
    })
  })

  it('creates a 2x2 grid structure for 4 panels', () => {
    const ids = ['p0', 'p1', 'p2', 'p3']
    // row 0: p0, p1
    expect(computeGridPosition(1, 4, ids)).toEqual({
      referencePanel: 'p0',
      direction: 'right',
    })
    // row 1: p2 below p0, p3 below p1
    expect(computeGridPosition(2, 4, ids)).toEqual({
      referencePanel: 'p0',
      direction: 'below',
    })
    expect(computeGridPosition(3, 4, ids)).toEqual({
      referencePanel: 'p1',
      direction: 'below',
    })
  })

  it('creates a 3-column grid structure for 6 panels', () => {
    const ids = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5']
    // row 0: p0, p1, p2
    expect(computeGridPosition(1, 6, ids)).toEqual({
      referencePanel: 'p0',
      direction: 'right',
    })
    expect(computeGridPosition(2, 6, ids)).toEqual({
      referencePanel: 'p1',
      direction: 'right',
    })
    // row 1: p3 below p0, p4 below p1, p5 below p2
    expect(computeGridPosition(3, 6, ids)).toEqual({
      referencePanel: 'p0',
      direction: 'below',
    })
    expect(computeGridPosition(4, 6, ids)).toEqual({
      referencePanel: 'p1',
      direction: 'below',
    })
    expect(computeGridPosition(5, 6, ids)).toEqual({
      referencePanel: 'p2',
      direction: 'below',
    })
  })
})

