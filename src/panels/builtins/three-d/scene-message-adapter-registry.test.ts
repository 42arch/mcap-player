import type { McapChannel } from '@/stores/use-player-store'
import { describe, expect, it } from 'vitest'
import { registerBuiltInSceneAdapters } from './register-built-in-scene-adapters'
import { registerBuiltInSceneRenderers } from './register-built-in-scene-renderers'
import {
  adaptSceneMessage,
  extractSceneMessageFrameId,
  findSceneMessageAdapter,
  getSceneMessageAdapterDefinitions,
  registerSceneMessageAdapter,
} from './scene-message-adapter-registry'
import { discoverSceneLayers, getSceneRendererDefinitions, registerSceneRenderer } from './scene-renderer-registry'

function channel(id: number, topic: string, schemaName?: string): McapChannel {
  return {
    id,
    topic,
    schemaId: id,
    schemaName,
    messageCount: 1,
  }
}

describe('sceneMessageAdapterRegistry', () => {
  registerBuiltInSceneRenderers()
  registerBuiltInSceneAdapters()

  it('routes built-in protocols to renderers while excluding transform channels', () => {
    const layers = discoverSceneLayers([
      channel(1, '/points', 'foxglove.PointCloud'),
      channel(2, '/map', 'foxglove.Grid'),
      channel(3, '/tf', 'tf2_msgs/TFMessage'),
    ], getSceneRendererDefinitions(), getSceneMessageAdapterDefinitions())

    expect(layers.map(layer => [layer.adapter?.id, layer.renderer.id])).toEqual([
      ['foxglove-ros-point-cloud', 'point-cloud'],
      ['foxglove-grid', 'grid'],
    ])
  })

  it('allows a custom protocol to normalize data for an existing renderer', () => {
    const customChannel = channel(10, '/vendor/obstacles', 'vendor.ObstacleArray')
    const unregister = registerSceneMessageAdapter({
      id: 'vendor-obstacles',
      title: 'Vendor Obstacles',
      rendererId: 'scene-update',
      matchChannel: candidate => candidate.schemaName === 'vendor.ObstacleArray' ? 250 : 0,
      adaptMessage: payload => ({
        frameId: 'vendor_origin',
        payload: { entities: (payload as { objects: unknown[] }).objects },
      }),
    })

    const adapter = findSceneMessageAdapter(customChannel)
    expect(adapter?.id).toBe('vendor-obstacles')
    expect(adaptSceneMessage(adapter, { objects: [{ id: 1 }] }, customChannel)).toEqual({
      frameId: 'vendor_origin',
      payload: { entities: [{ id: 1 }] },
    })
    expect(discoverSceneLayers(
      [customChannel],
      getSceneRendererDefinitions(),
      getSceneMessageAdapterDefinitions(),
    )[0]?.renderer.id).toBe('scene-update')

    unregister()
    expect(findSceneMessageAdapter(customChannel)).toBeNull()
  })

  it('allows a higher-scoring direct renderer to override an adapter route', () => {
    const unregister = registerSceneRenderer({
      id: 'specialized-points',
      title: 'Specialized Points',
      matchChannel: candidate => candidate.topic === '/points' ? 300 : 0,
      loadRenderer: async () => ({ default: () => null }),
    })

    const [layer] = discoverSceneLayers(
      [channel(1, '/points', 'foxglove.PointCloud')],
      getSceneRendererDefinitions(),
      getSceneMessageAdapterDefinitions(),
    )
    expect(layer?.renderer.id).toBe('specialized-points')
    expect(layer?.adapter).toBeNull()
    unregister()
  })

  it('extracts common frame fields and rejects duplicate adapter IDs', () => {
    expect(extractSceneMessageFrameId({ header: { frame_id: 'map' } })).toBe('map')
    expect(extractSceneMessageFrameId({ frameId: 'odom' })).toBe('odom')

    const definition = {
      id: 'duplicate-test-adapter',
      title: 'Duplicate Test',
      rendererId: 'grid',
      matchChannel: () => 0,
      adaptMessage: (payload: unknown) => ({ payload }),
    }
    const unregister = registerSceneMessageAdapter(definition)
    expect(() => registerSceneMessageAdapter(definition)).toThrow('already registered')
    unregister()
  })
})
