import { describe, expect, it } from 'vitest'
import { getThreeDTopicKind } from './three-d-topic'

describe('getThreeDTopicKind', () => {
  it('recognizes conventional transform topics when schema metadata is unavailable', () => {
    expect(getThreeDTopicKind(undefined, '/tf')).toBe('transform')
    expect(getThreeDTopicKind(undefined, '/tf_static')).toBe('transform')
  })

  it('classifies supported schemas before topic-name heuristics', () => {
    expect(getThreeDTopicKind('foxglove.Grid', '/map')).toBe('grid')
    expect(getThreeDTopicKind('foxglove.SceneUpdate', '/semantic_map')).toBe('scene-update')
    expect(getThreeDTopicKind('foxglove.PointCloud', '/lidar')).toBe('point-cloud')
  })

  it('keeps marker and point-cloud topic fallbacks', () => {
    expect(getThreeDTopicKind(undefined, '/markers/car')).toBe('scene-update')
    expect(getThreeDTopicKind(undefined, '/points_raw')).toBe('point-cloud')
    expect(getThreeDTopicKind(undefined, '/camera')).toBeNull()
  })

  it('recognizes transform and embedded robot-model channels', () => {
    expect(getThreeDTopicKind('tf2_msgs/TFMessage', '/tf')).toBe('transform')
    expect(getThreeDTopicKind('std_msgs/String', 'robot_description')).toBe('robot-model')
  })
})
