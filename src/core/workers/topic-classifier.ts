import type { McapIndexedReader } from '@mcap/core'

export type BackfillClass = 'fast' | 'spatial' | 'media'

export function isTransformBackfillChannel(topic: string, schemaName: string): boolean {
  const normalizedTopic = topic.toLowerCase()
  const normalizedSchema = schemaName.toLowerCase()
  return normalizedTopic === '/tf'
    || normalizedTopic === '/tf_static'
    || normalizedSchema.includes('frametransform')
    || normalizedSchema.includes('frame_transform')
    || normalizedSchema.includes('tfmessage')
    || normalizedSchema.includes('tf_message')
}

export function isSlowBackfillChannel(topic: string, schemaName: string): boolean {
  return getBackfillClass(topic, schemaName) !== 'fast'
}

export function getBackfillClass(topic: string, schemaName: string): BackfillClass {
  const normalizedSchema = schemaName.toLowerCase()
  if (
    isTransformBackfillChannel(topic, schemaName)
    || normalizedSchema.includes('sceneupdate')
    || normalizedSchema.includes('scene_update')
  ) {
    return 'spatial'
  }
  if (
    normalizedSchema.includes('compressedimage')
    || normalizedSchema.includes('compressed_image')
    || normalizedSchema.includes('compressedvideo')
    || normalizedSchema.includes('compressed_video')
  ) {
    return 'media'
  }
  return 'fast'
}

export function isSceneUpdateTopic(reader: McapIndexedReader | null, topic: string): boolean {
  if (!reader) {
    return false
  }
  return Array.from(reader.channelsById.values()).some((channel) => {
    if (channel.topic !== topic) {
      return false
    }
    const schemaName = reader.schemasById.get(channel.schemaId)?.name?.toLowerCase() || ''
    return schemaName.includes('sceneupdate') || schemaName.includes('scene_update')
  })
}

export function isTransformTopic(reader: McapIndexedReader | null, topic: string): boolean {
  if (!reader) {
    return false
  }
  const normalizedTopic = topic.toLowerCase()
  if (normalizedTopic === '/tf' || normalizedTopic === '/tf_static') {
    return true
  }
  return Array.from(reader.channelsById.values()).some((channel) => {
    if (channel.topic !== topic) {
      return false
    }
    const schemaName = reader.schemasById.get(channel.schemaId)?.name?.toLowerCase() || ''
    return schemaName.includes('frametransform')
      || schemaName.includes('frame_transform')
      || schemaName.includes('tfmessage')
      || schemaName.includes('tf_message')
  })
}
