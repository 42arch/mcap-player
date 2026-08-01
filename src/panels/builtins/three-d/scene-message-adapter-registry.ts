import type { McapChannel } from '@/stores/use-player-store'
import { useSyncExternalStore } from 'react'

export interface AdaptedSceneMessage {
  /** Payload normalized to the target renderer's canonical message shape. */
  payload: unknown
  /** Optional frame supplied by the protocol adapter. */
  frameId?: string
}

export interface SceneMessageAdapterDefinition {
  id: string
  title: string
  /** Renderer that accepts the normalized payload. */
  rendererId: string
  /** Higher scores win when multiple adapters support the same channel. */
  matchChannel: (channel: McapChannel) => number
  adaptMessage: (payload: unknown, channel: McapChannel) => AdaptedSceneMessage
}

const adapters = new Map<string, SceneMessageAdapterDefinition>()
const listeners = new Set<() => void>()
let adapterSnapshot: readonly SceneMessageAdapterDefinition[] = []

function notify() {
  adapterSnapshot = Array.from(adapters.values())
  listeners.forEach(listener => listener())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function registerSceneMessageAdapter(definition: SceneMessageAdapterDefinition): () => void {
  if (adapters.has(definition.id)) {
    throw new Error(`Scene message adapter "${definition.id}" is already registered`)
  }

  adapters.set(definition.id, definition)
  notify()

  return () => {
    if (adapters.get(definition.id) === definition) {
      adapters.delete(definition.id)
      notify()
    }
  }
}

export function getSceneMessageAdapterDefinitions(): readonly SceneMessageAdapterDefinition[] {
  return adapterSnapshot
}

export function useRegisteredSceneMessageAdapters(): readonly SceneMessageAdapterDefinition[] {
  return useSyncExternalStore(
    subscribe,
    getSceneMessageAdapterDefinitions,
    getSceneMessageAdapterDefinitions,
  )
}

export function findSceneMessageAdapter(
  channel: McapChannel,
  candidates: readonly SceneMessageAdapterDefinition[] = adapterSnapshot,
): SceneMessageAdapterDefinition | null {
  let bestMatch: SceneMessageAdapterDefinition | null = null
  let bestScore = 0

  for (const adapter of candidates) {
    const score = adapter.matchChannel(channel)
    if (Number.isFinite(score) && score > bestScore) {
      bestMatch = adapter
      bestScore = score
    }
  }
  return bestMatch
}

export function adaptSceneMessage(
  adapter: SceneMessageAdapterDefinition | null,
  payload: unknown,
  channel: McapChannel,
): AdaptedSceneMessage {
  return adapter
    ? adapter.adaptMessage(payload, channel)
    : { payload, frameId: extractSceneMessageFrameId(payload) }
}

export function extractSceneMessageFrameId(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined
  }

  const message = payload as {
    frame_id?: unknown
    frameId?: unknown
    header?: { frame_id?: unknown, frameId?: unknown }
  }
  const value = message.frame_id
    ?? message.frameId
    ?? message.header?.frame_id
    ?? message.header?.frameId
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
