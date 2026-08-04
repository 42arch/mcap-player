import { registerSceneRenderer } from './scene-renderer-registry'
import { getThreeDTopicKind } from './three-d-topic'

let registered = false

export function registerBuiltInSceneRenderers() {
  if (registered) {
    return
  }
  registered = true

  registerSceneRenderer({
    id: 'point-cloud',
    title: 'Point Cloud',
    supportsFrameOverride: true,
    matchChannel: channel => getThreeDTopicKind(channel.schemaName, channel.topic) === 'point-cloud' ? 100 : 0,
    createDefaultSettings: panelConfig => ({
      pointSize: panelConfig.pointSize ?? 2,
      colorMode: panelConfig.colorMode ?? 'height',
      solidColor: panelConfig.solidColor || '#00ffcc',
      maxPoints: panelConfig.maxPoints ?? 200000,
    }),
    loadRenderer: () => import('./point-cloud-layer').then(module => ({ default: module.PointCloudLayer })),
    loadSettings: () => import('./point-cloud-setting'),
  })

  registerSceneRenderer({
    id: 'grid',
    title: 'Grid',
    supportsFrameOverride: true,
    matchChannel: channel => getThreeDTopicKind(channel.schemaName, channel.topic) === 'grid' ? 100 : 0,
    loadRenderer: () => import('./grid-layer').then(module => ({ default: module.GridLayer })),
  })

  registerSceneRenderer({
    id: 'scene-update',
    title: 'Scene Update',
    supportsFrameOverride: true,
    matchChannel: channel => getThreeDTopicKind(channel.schemaName, channel.topic) === 'scene-update' ? 100 : 0,
    loadRenderer: () => import('./scene-update-layer').then(module => ({ default: module.SceneUpdateLayer })),
  })

  registerSceneRenderer({
    id: 'robot-model',
    title: 'Robot Model',
    matchChannel: channel => getThreeDTopicKind(channel.schemaName, channel.topic) === 'robot-model' ? 100 : 0,
    loadRenderer: () => import('./robot-layer').then(module => ({ default: module.RobotLayer })),
  })
}
