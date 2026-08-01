import type { ComponentType, LazyExoticComponent, RefObject } from 'react'
import type * as THREE from 'three'
import type { AssetLoadTracker } from './asset-load-tracker'
import type { SceneMessageAdapterDefinition } from './scene-message-adapter-registry'
import type { FrameTransformCoordinator } from './tf-coordinator'
import type { ThreeDPanelConfig } from '@/panels/core/types'
import type { McapChannel } from '@/stores/use-player-store'
import { lazy, useSyncExternalStore } from 'react'

export type SceneLayerSettings = Record<string, unknown>

export interface SceneLayerProps {
  adapter: SceneMessageAdapterDefinition | null
  assetLoadTracker: AssetLoadTracker
  channel: McapChannel
  layerId: string
  panelId: string
  settings: SceneLayerSettings
  tfCoordinator: FrameTransformCoordinator
  /** Optional object that represents the preferred camera focus for this scene. */
  focusRef?: RefObject<THREE.Object3D | null>
}

export interface SceneRendererModule {
  default: ComponentType<SceneLayerProps>
}

export interface SceneLayerSettingsProps {
  adapter: SceneMessageAdapterDefinition | null
  channel: McapChannel
  layerId: string
  settings: SceneLayerSettings
  updateSettings: (patch: SceneLayerSettings) => void
}

export interface SceneRendererSettingsModule {
  default: ComponentType<SceneLayerSettingsProps>
}

export interface SceneRendererDefinition {
  id: string
  title: string
  /** Higher scores win when multiple renderers support the same channel. */
  matchChannel: (channel: McapChannel) => number
  /** Enables the shared per-layer frame override setting. */
  supportsFrameOverride?: boolean
  createDefaultSettings?: (panelConfig: ThreeDPanelConfig, channel: McapChannel) => SceneLayerSettings
  loadRenderer: () => Promise<SceneRendererModule>
  loadSettings?: () => Promise<SceneRendererSettingsModule>
}

export interface RegisteredSceneRendererDefinition extends SceneRendererDefinition {
  Renderer: LazyExoticComponent<ComponentType<SceneLayerProps>>
  Settings?: LazyExoticComponent<ComponentType<SceneLayerSettingsProps>>
}

export interface DiscoveredSceneLayer {
  adapter: SceneMessageAdapterDefinition | null
  channel: McapChannel
  renderer: RegisteredSceneRendererDefinition
}

const renderers = new Map<string, RegisteredSceneRendererDefinition>()
const listeners = new Set<() => void>()
let rendererSnapshot: readonly RegisteredSceneRendererDefinition[] = []

function notify() {
  rendererSnapshot = Array.from(renderers.values())
  listeners.forEach(listener => listener())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function registerSceneRenderer(definition: SceneRendererDefinition): () => void {
  if (renderers.has(definition.id)) {
    throw new Error(`Scene renderer "${definition.id}" is already registered`)
  }

  const registered: RegisteredSceneRendererDefinition = {
    ...definition,
    Renderer: lazy(definition.loadRenderer),
    Settings: definition.loadSettings ? lazy(definition.loadSettings) : undefined,
  }
  renderers.set(definition.id, registered)
  notify()

  return () => {
    if (renderers.get(definition.id) === registered) {
      renderers.delete(definition.id)
      notify()
    }
  }
}

export function getSceneLayerId(channel: McapChannel, rendererId: string): string {
  return `${rendererId}|${channel.topic}|${channel.schemaName || ''}`
}

export function resolveSceneLayerSettings(
  renderer: RegisteredSceneRendererDefinition,
  channel: McapChannel,
  panelConfig: ThreeDPanelConfig,
): SceneLayerSettings {
  const layerId = getSceneLayerId(channel, renderer.id)
  return {
    ...(renderer.createDefaultSettings?.(panelConfig, channel) || {}),
    ...(panelConfig.layerSettings?.[layerId] || {}),
  }
}

export function getSceneLayerFrameOverride(settings: SceneLayerSettings): string | null {
  return typeof settings.frameOverride === 'string' && settings.frameOverride.trim()
    ? settings.frameOverride.trim()
    : null
}

/**
 * Topics that conventionally carry the ego/primary vehicle marker. Renderers
 * can opt into this semantic hint without coupling the generic 3D panel to a
 * particular business domain.
 */
export function isPreferredSceneFocusTopic(topic: string): boolean {
  return /(?:^|\/)(?:car|vehicle|ego(?:[_-]?vehicle)?)(?:\/|$)/i.test(topic)
}

export function getSceneRendererDefinitions(): readonly RegisteredSceneRendererDefinition[] {
  return rendererSnapshot
}

export function useRegisteredSceneRenderers(): readonly RegisteredSceneRendererDefinition[] {
  return useSyncExternalStore(
    subscribe,
    getSceneRendererDefinitions,
    getSceneRendererDefinitions,
  )
}

export function findSceneRenderer(
  channel: McapChannel,
  candidates: readonly RegisteredSceneRendererDefinition[] = rendererSnapshot,
): RegisteredSceneRendererDefinition | null {
  let bestMatch: RegisteredSceneRendererDefinition | null = null
  let bestScore = 0

  for (const renderer of candidates) {
    const score = renderer.matchChannel(channel)
    if (Number.isFinite(score) && score > bestScore) {
      bestMatch = renderer
      bestScore = score
    }
  }
  return bestMatch
}

export function discoverSceneLayers(
  channels: readonly McapChannel[],
  rendererCandidates: readonly RegisteredSceneRendererDefinition[] = rendererSnapshot,
  adapterCandidates: readonly SceneMessageAdapterDefinition[] = [],
): DiscoveredSceneLayer[] {
  const renderersById = new Map(rendererCandidates.map(renderer => [renderer.id, renderer]))
  const layers: DiscoveredSceneLayer[] = []
  for (const channel of channels) {
    let adapter: SceneMessageAdapterDefinition | null = null
    let renderer: RegisteredSceneRendererDefinition | null = null
    let bestAdapterScore = 0

    for (const candidate of adapterCandidates) {
      const candidateRenderer = renderersById.get(candidate.rendererId)
      if (!candidateRenderer) {
        continue
      }
      const score = candidate.matchChannel(channel)
      if (Number.isFinite(score) && score > bestAdapterScore) {
        adapter = candidate
        renderer = candidateRenderer
        bestAdapterScore = score
      }
    }

    const directRenderer = findSceneRenderer(channel, rendererCandidates)
    const directRendererScore = directRenderer?.matchChannel(channel) || 0
    if (directRenderer && directRendererScore > bestAdapterScore) {
      adapter = null
      renderer = directRenderer
    }
    if (renderer) {
      layers.push({ adapter, channel, renderer })
    }
  }
  return layers
}
