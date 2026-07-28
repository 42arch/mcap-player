import { describe, expect, it } from 'vitest'
import { inferSceneProfile } from './scene-profile'

describe('inferSceneProfile', () => {
  it('prefers the embodied profile when an in-bag robot description exists', () => {
    const profile = inferSceneProfile([
      { id: 1, topic: '/tf', schemaId: 1, schemaName: 'tf2_msgs/TFMessage', messageCount: 10 },
      { id: 2, topic: 'robot_description', schemaId: 2, schemaName: 'std_msgs/String', messageCount: 1 },
    ])

    expect(profile.kind).toBe('embodied')
    expect(profile.transformTopics).toEqual(['/tf'])
  })

  it('recognizes NuScenes-style map and lidar channels as autonomous driving', () => {
    const profile = inferSceneProfile([
      { id: 1, topic: '/map', schemaId: 1, schemaName: 'foxglove.Grid', messageCount: 10 },
      { id: 2, topic: '/LIDAR_TOP', schemaId: 2, schemaName: 'foxglove.PointCloud', messageCount: 10 },
    ])

    expect(profile.kind).toBe('autonomous-driving')
  })
})
