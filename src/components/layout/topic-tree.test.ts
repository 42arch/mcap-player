import type { McapChannel } from '@/stores/use-player-store'
import { describe, expect, it } from 'vitest'
import { buildTopicTree } from './topic-tree'

function makeChannel(id: number, topic: string, messageCount = 10, schemaName?: string): McapChannel {
  return {
    id,
    topic,
    schemaId: id,
    schemaName,
    messageCount,
  }
}

describe('buildTopicTree', () => {
  it('returns empty array when given no channels', () => {
    expect(buildTopicTree([])).toEqual([])
  })

  it('builds flat root topics correctly', () => {
    const channels = [
      makeChannel(1, '/odom', 5),
      makeChannel(2, '/imu', 10),
    ]
    const tree = buildTopicTree(channels)

    expect(tree).toHaveLength(2)
    // Sorted alphabetically
    expect(tree[0]?.name).toBe('imu')
    expect(tree[0]?.channel?.topic).toBe('/imu')
    expect(tree[0]?.totalMessageCount).toBe(10)

    expect(tree[1]?.name).toBe('odom')
    expect(tree[1]?.channel?.topic).toBe('/odom')
    expect(tree[1]?.totalMessageCount).toBe(5)
  })

  it('creates nested folders for slash-separated topics', () => {
    const channels = [
      makeChannel(1, '/cam/front/image_raw', 20),
      makeChannel(2, '/cam/front/camera_info', 10),
      makeChannel(3, '/cam/rear/image_raw', 15),
    ]
    const tree = buildTopicTree(channels)

    expect(tree).toHaveLength(1)
    const cam = tree[0]
    expect(cam?.name).toBe('cam')
    expect(cam?.channel).toBeUndefined()
    expect(cam?.totalMessageCount).toBe(45)
    expect(cam?.totalChannelsCount).toBe(3)
    expect(cam?.children).toHaveLength(2)

    const front = cam?.children[0]
    expect(front?.name).toBe('front')
    expect(front?.children).toHaveLength(2)
    expect(front?.totalMessageCount).toBe(30)
    expect(front?.totalChannelsCount).toBe(2)

    const rear = cam?.children[1]
    expect(rear?.name).toBe('rear')
    expect(rear?.children).toHaveLength(1)
    expect(rear?.totalMessageCount).toBe(15)
  })

  it('supports nodes that are simultaneously a topic and a folder', () => {
    const channels = [
      makeChannel(1, '/robot', 10),
      makeChannel(2, '/robot/arm', 5),
    ]
    const tree = buildTopicTree(channels)

    expect(tree).toHaveLength(1)
    const robot = tree[0]
    expect(robot?.name).toBe('robot')
    expect(robot?.channel?.topic).toBe('/robot')
    expect(robot?.children).toHaveLength(1)
    expect(robot?.totalMessageCount).toBe(15)
    expect(robot?.totalChannelsCount).toBe(2)
  })

  it('sorts folders before leaf channels', () => {
    const channels = [
      makeChannel(1, '/system_status', 1),
      makeChannel(2, '/system/diagnostics', 2),
    ]
    const tree = buildTopicTree(channels)

    expect(tree).toHaveLength(2)
    // /system is a folder (has children), so it sorts before leaf /system_status
    expect(tree[0]?.name).toBe('system')
    expect(tree[0]?.children.length).toBeGreaterThan(0)
    expect(tree[1]?.name).toBe('system_status')
  })
})

