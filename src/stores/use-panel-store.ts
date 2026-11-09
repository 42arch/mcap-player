import type { DockviewApi } from 'dockview-react'
import type { PanelConfig, PanelId, PanelInstance, PanelType } from '@/panels/core/types'
import { nanoid } from 'nanoid'
import { create } from 'zustand'

import { assignDefaultPanelTopics } from '@/panels/core/assign-default-topics'
import { getPanelDefinition } from '@/panels/core/panel-registry'

interface PanelState {
  panelsById: Record<PanelId, PanelInstance>
  panelOrder: PanelId[]
  activePanelId: PanelId | null
  selectedPanelId: PanelId | null
  sidebarTab: 'topics' | 'settings'
  dockviewApi: DockviewApi | null

  addPanel: (type: PanelType, initialConfig?: Partial<PanelConfig>) => PanelId
  addPanels: (specs: Array<{ type: PanelType, initialConfig?: Partial<PanelConfig> }>) => PanelId[]
  removePanel: (panelId: PanelId) => void
  updatePanelConfig: (panelId: PanelId, patch: Partial<PanelConfig>) => void
  setActivePanel: (panelId: PanelId | null) => void
  setSelectedPanel: (panelId: PanelId | null) => void
  setSidebarTab: (tab: 'topics' | 'settings') => void
  setDockviewApi: (api: DockviewApi | null) => void
  resetPanels: () => void
  loadPanelsState: (panelsById: Record<PanelId, PanelInstance>, panelOrder: PanelId[]) => void
}

export const usePanelStore = create<PanelState>((set, get) => ({
  panelsById: {},
  panelOrder: [],
  activePanelId: null,
  selectedPanelId: null,
  sidebarTab: 'topics',
  dockviewApi: null,

  addPanel: (type, initialConfig = {}) => {
    const definition = getPanelDefinition(type)
    if (!definition) {
      throw new Error(`Panel type "${type}" is not registered`)
    }

    const id = `${type}-${nanoid(8)}`
    const instance: PanelInstance = {
      id,
      type,
      configVersion: definition.configVersion,
      config: { ...definition.createDefaultConfig(), ...initialConfig },
    }

    set(state => ({
      panelsById: { ...state.panelsById, [id]: instance },
      panelOrder: [...state.panelOrder, id],
      activePanelId: id,
      selectedPanelId: id,
    }))
    assignDefaultPanelTopics()
    return id
  },

  addPanels: (specs) => {
    const newPanels: Record<PanelId, PanelInstance> = {}
    const newIds: PanelId[] = []

    for (const spec of specs) {
      const definition = getPanelDefinition(spec.type)
      if (!definition) {
        continue
      }
      const id = `${spec.type}-${nanoid(8)}`
      newPanels[id] = {
        id,
        type: spec.type,
        configVersion: definition.configVersion,
        config: { ...definition.createDefaultConfig(), ...spec.initialConfig },
      }
      newIds.push(id)
    }

    if (newIds.length === 0) {
      return []
    }

    set(state => ({
      panelsById: { ...state.panelsById, ...newPanels },
      panelOrder: [...state.panelOrder, ...newIds],
      activePanelId: state.activePanelId ?? newIds[0],
      selectedPanelId: state.selectedPanelId ?? newIds[0],
    }))
    assignDefaultPanelTopics()
    return newIds
  },

  removePanel: (panelId) => {
    const { panelsById, panelOrder, activePanelId, selectedPanelId } = get()
    if (!panelsById[panelId]) {
      return
    }

    const nextPanels = { ...panelsById }
    delete nextPanels[panelId]
    const nextOrder = panelOrder.filter(id => id !== panelId)
    const fallback = nextOrder.at(-1) ?? null

    set({
      panelsById: nextPanels,
      panelOrder: nextOrder,
      activePanelId: activePanelId === panelId ? fallback : activePanelId,
      selectedPanelId: selectedPanelId === panelId ? fallback : selectedPanelId,
    })
  },

  updatePanelConfig: (panelId, patch) => {
    set((state) => {
      const instance = state.panelsById[panelId]
      if (!instance) {
        return state
      }
      return {
        panelsById: {
          ...state.panelsById,
          [panelId]: {
            ...instance,
            config: { ...instance.config, ...patch },
          },
        },
      }
    })
  },

  setActivePanel: panelId => set({ activePanelId: panelId }),
  setSelectedPanel: panelId => set({ selectedPanelId: panelId }),
  setSidebarTab: sidebarTab => set({ sidebarTab }),
  setDockviewApi: dockviewApi => set({ dockviewApi }),
  resetPanels: () =>
    set({
      panelsById: {},
      panelOrder: [],
      activePanelId: null,
      selectedPanelId: null,
      sidebarTab: 'topics',
    }),
  loadPanelsState: (panelsById, panelOrder) => {
    const firstId = panelOrder[0] ?? null
    set({
      panelsById,
      panelOrder,
      activePanelId: firstId,
      selectedPanelId: firstId,
    })
    assignDefaultPanelTopics()
  },
}))
