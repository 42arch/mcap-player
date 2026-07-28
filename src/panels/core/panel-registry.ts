import type { ComponentType, LazyExoticComponent } from 'react'
import type { PanelComponentProps, PanelConfig, PanelDefinition, PanelSettingsProps, PanelType } from './types'
import { lazy, useSyncExternalStore } from 'react'

export interface RegisteredPanelDefinition<C extends PanelConfig = PanelConfig> extends PanelDefinition<C> {
  Panel: LazyExoticComponent<ComponentType<PanelComponentProps<C>>>
  Settings?: LazyExoticComponent<ComponentType<PanelSettingsProps<C>>>
}

const definitions = new Map<PanelType, RegisteredPanelDefinition>()
const listeners = new Set<() => void>()
let version = 0

function notify() {
  version++
  listeners.forEach(listener => listener())
}

export function registerPanel<C extends PanelConfig>(definition: PanelDefinition<C>): () => void {
  if (definitions.has(definition.type)) {
    throw new Error(`Panel type "${definition.type}" is already registered`)
  }

  const registered: RegisteredPanelDefinition<C> = {
    ...definition,
    Panel: lazy(definition.loadPanel),
    Settings: definition.loadSettings ? lazy(definition.loadSettings) : undefined,
  }
  definitions.set(definition.type, registered as RegisteredPanelDefinition)
  notify()

  return () => {
    if (definitions.get(definition.type) === registered) {
      definitions.delete(definition.type)
      notify()
    }
  }
}

export function getPanelDefinition(type: PanelType): RegisteredPanelDefinition | undefined {
  return definitions.get(type)
}

export function getPanelDefinitions(): RegisteredPanelDefinition[] {
  return Array.from(definitions.values())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getVersion() {
  return version
}

/** Re-renders menus when a plugin registers a panel after initial application load. */
export function useRegisteredPanels(): RegisteredPanelDefinition[] {
  useSyncExternalStore(subscribe, getVersion, getVersion)
  return getPanelDefinitions()
}
