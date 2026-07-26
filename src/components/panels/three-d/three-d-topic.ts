export type ThreeDTopicKind = 'point-cloud' | 'scene-update' | 'grid'

interface ThreeDChannelLike {
  topic: string
  schemaName?: string
}

export function getThreeDTopicKind(schemaName: string | undefined, topic: string): ThreeDTopicKind | null {
  const schema = (schemaName || '').toLowerCase()
  const topicName = topic.toLowerCase()

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
  return getThreeDTopicKind(channel.schemaName, channel.topic) !== null
}
