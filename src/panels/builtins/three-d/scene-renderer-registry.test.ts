import type { ThreeDPanelConfig } from '@/panels/core/types'
import type { McapChannel } from '@/stores/use-player-store'
import { describe, expect, it } from 'vitest'
import { registerBuiltInSceneRenderers } from './register-built-in-scene-renderers'
import {
  discoverSceneLayers,
  findSceneRenderer,
  getSceneLayerFrameOverride,
  getSceneLayerId,
  getSceneRendererDefinitions,
  isPreferredSceneFocusTopic,
  registerSceneRenderer,
  resolveSceneLayerSettings,
} from './scene-renderer-registry'

function channel(id: number, topic: string, schemaName?: string): McapChannel {
  return {
    id,
    topic,
    schemaId: id,
    schemaName,
    messageCount: 1,
  }
}

describe('sceneRendererRegistry', () => {
  registerBuiltInSceneRenderers()

  it('discovers supported layers without exposing transforms as render layers', () => {
    const layers = discoverSceneLayers([
      channel(1, '/points', 'foxglove.PointCloud'),
      channel(2, '/map', 'foxglove.Grid'),
      channel(3, '/tf', 'tf2_msgs/TFMessage'),
      channel(4, '/camera', 'sensor_msgs/Image'),
    ])

    expect(layers.map(layer => layer.renderer.id)).toEqual(['point-cloud', 'grid'])
    expect(getSceneRendererDefinitions().map(renderer => renderer.id)).toEqual([
      'point-cloud',
      'grid',
      'scene-update',
      'robot-model',
    ])
  })

  it('selects the highest-scoring renderer and supports unregistering extensions', () => {
    let settingsLoadCount = 0
    const unregister = registerSceneRenderer({
      id: 'custom-point-cloud',
      title: 'Custom Point Cloud',
      matchChannel: candidate => candidate.topic === '/points' ? 200 : 0,
      createDefaultSettings: () => ({ quality: 'normal', enabled: true }),
      loadRenderer: async () => ({ default: () => null }),
      loadSettings: async () => {
        settingsLoadCount++
        return { default: () => null }
      },
    })
    const points = channel(1, '/points', 'foxglove.PointCloud')
    const renderer = findSceneRenderer(points)!
    const layerId = getSceneLayerId(points, renderer.id)

    expect(renderer.id).toBe('custom-point-cloud')
    expect(renderer.Settings).toBeDefined()
    expect(settingsLoadCount).toBe(0)
    expect(resolveSceneLayerSettings(renderer, points, {
      layerSettings: { [layerId]: { quality: 'high' } },
    } as unknown as ThreeDPanelConfig)).toEqual({ quality: 'high', enabled: true })
    unregister()
    expect(findSceneRenderer(points)?.id).toBe('point-cloud')
  })

  it('rejects duplicate renderer IDs', () => {
    let loadCount = 0
    const definition = {
      id: 'test-renderer',
      title: 'Test Renderer',
      matchChannel: () => 0,
      loadRenderer: async () => {
        loadCount++
        return { default: () => null }
      },
    }
    const unregister = registerSceneRenderer(definition)

    expect(loadCount).toBe(0)
    expect(() => registerSceneRenderer(definition)).toThrow('already registered')
    unregister()
  })

  it('normalizes an optional per-layer frame override', () => {
    expect(getSceneLayerFrameOverride({ frameOverride: '  map  ' })).toBe('map')
    expect(getSceneLayerFrameOverride({ frameOverride: '   ' })).toBeNull()
    expect(getSceneLayerFrameOverride({})).toBeNull()
  })

  it('recognizes conventional ego-vehicle scene topics without coupling to a business domain', () => {
    expect(isPreferredSceneFocusTopic('/markers/car')).toBe(true)
    expect(isPreferredSceneFocusTopic('/ego_vehicle/model')).toBe(true)
    expect(isPreferredSceneFocusTopic('/semantic_map')).toBe(false)
  })
})
