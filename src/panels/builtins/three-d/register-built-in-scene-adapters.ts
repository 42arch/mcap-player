import { extractSceneMessageFrameId, registerSceneMessageAdapter } from './scene-message-adapter-registry'
import { getThreeDTopicKind } from './three-d-topic'

let registered = false

export function registerBuiltInSceneAdapters() {
  if (registered) {
    return
  }
  registered = true

  registerSceneMessageAdapter({
    id: 'foxglove-ros-point-cloud',
    title: 'Foxglove / ROS Point Cloud',
    rendererId: 'point-cloud',
    matchChannel: channel => getThreeDTopicKind(channel.schemaName, channel.topic) === 'point-cloud' ? 100 : 0,
    adaptMessage: payload => ({ payload, frameId: extractSceneMessageFrameId(payload) }),
  })

  registerSceneMessageAdapter({
    id: 'foxglove-grid',
    title: 'Foxglove Grid',
    rendererId: 'grid',
    matchChannel: channel => getThreeDTopicKind(channel.schemaName, channel.topic) === 'grid' ? 100 : 0,
    adaptMessage: payload => ({ payload, frameId: extractSceneMessageFrameId(payload) }),
  })

  registerSceneMessageAdapter({
    id: 'foxglove-ros-scene-update',
    title: 'Foxglove / ROS Scene Update',
    rendererId: 'scene-update',
    matchChannel: channel => getThreeDTopicKind(channel.schemaName, channel.topic) === 'scene-update' ? 100 : 0,
    adaptMessage: payload => ({ payload, frameId: extractSceneMessageFrameId(payload) }),
  })

  registerSceneMessageAdapter({
    id: 'ros-robot-description',
    title: 'ROS Robot Description',
    rendererId: 'robot-model',
    matchChannel: channel => getThreeDTopicKind(channel.schemaName, channel.topic) === 'robot-model' ? 100 : 0,
    adaptMessage: (payload) => {
      const message = payload as { data?: unknown } | undefined
      return { payload: message?.data ?? payload }
    },
  })
}
