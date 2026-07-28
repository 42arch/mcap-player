export type ThreeDTopicKind = 'point-cloud' | 'scene-update' | 'grid' | 'robot-model' | 'transform'

interface ThreeDChannelLike {
  topic: string
  schemaName?: string
}

export function getThreeDTopicKind(schemaName: string | undefined, topic: string): ThreeDTopicKind | null {
  const schema = (schemaName || '').toLowerCase()
  const topicName = topic.toLowerCase()

  if (schema.includes('frametransform') || schema.includes('tfmessage')) {
    return 'transform'
  }
  if (topicName.includes('robot_description') || schema.includes('urdf')) {
    return 'robot-model'
  }
  if (schema === 'foxglove.grid' || schema.endsWith('.grid')) {
    return 'grid'
  }
  if (schema.includes('sceneupdate') || schema.includes('scene_update') || topicName.includes('marker') || topicName.includes('annotation')) {
    return 'scene-update'
  }
  if (
    schema.includes('pointcloud')
    || schema.includes('point_cloud')
    || topicName.includes('pointcloud')
    || topicName.includes('points')
    || topicName.includes('lidar')
  ) {
    return 'point-cloud'
  }
  return null
}

export function isThreeDChannel(channel: ThreeDChannelLike): boolean {
  const kind = getThreeDTopicKind(channel.schemaName, channel.topic)
  return kind !== null && kind !== 'transform'
}

export function isTransformChannel(channel: ThreeDChannelLike): boolean {
  return getThreeDTopicKind(channel.schemaName, channel.topic) === 'transform'
}
