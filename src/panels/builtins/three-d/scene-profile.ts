import type { McapChannel } from '@/stores/use-player-store'
import { getThreeDTopicKind } from './three-d-topic'

export type SceneProfileKind = 'autonomous-driving' | 'embodied' | 'generic'

export interface SceneProfile {
  kind: SceneProfileKind
  label: string
  rootFrame: string
  transformTopics: string[]
}

/**
 * Profiles influence defaults only. Rendering remains topic/schema driven, so a
 * user can later override this inference without moving data through another
 * panel implementation.
 */
export function inferSceneProfile(channels: readonly McapChannel[]): SceneProfile {
  const transformTopics: string[] = []
  let hasRobotDescription = false
  let hasDrivingSignals = false

  for (const channel of channels) {
    const kind = getThreeDTopicKind(channel.schemaName, channel.topic)
    if (kind === 'transform') {
      transformTopics.push(channel.topic)
    }
    if (kind === 'robot-model') {
      hasRobotDescription = true
    }
    if (kind === 'grid' || channel.topic.toLowerCase().includes('lidar') || channel.topic.toLowerCase().includes('radar')) {
      hasDrivingSignals = true
    }
  }

  if (hasRobotDescription) {
    return { kind: 'embodied', label: 'Embodied Robot', rootFrame: 'base_link', transformTopics }
  }
  if (hasDrivingSignals) {
    return { kind: 'autonomous-driving', label: 'Autonomous Driving', rootFrame: 'base_link', transformTopics }
  }
  return { kind: 'generic', label: 'Spatial Scene', rootFrame: 'base_link', transformTopics }
}
