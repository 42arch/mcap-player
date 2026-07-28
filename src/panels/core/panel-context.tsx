'use client'

import type { PanelConfig, PanelId } from './types'
import { createContext, useCallback, useContext } from 'react'
import { usePanelStore } from '@/stores/use-panel-store'

const PanelIdContext = createContext<PanelId | null>(null)

export function PanelScope({ panelId, children }: { panelId: PanelId, children: React.ReactNode }) {
  return <PanelIdContext.Provider value={panelId}>{children}</PanelIdContext.Provider>
}

export function usePanelId(): PanelId {
  const panelId = useContext(PanelIdContext)
  if (!panelId) {
    throw new Error('Panel hooks must be used inside PanelScope')
  }
  return panelId
}

export function usePanelConfig<C extends PanelConfig>(): [C, (patch: Partial<C>) => void] {
  return usePanelConfigForId<C>(usePanelId())
}

/**
 * Use this from a secondary React root such as @react-three/fiber's Canvas,
 * where React context from the DOM panel root is not guaranteed to cross.
 */
export function usePanelConfigForId<C extends PanelConfig>(panelId: PanelId): [C, (patch: Partial<C>) => void] {
  const config = usePanelStore(state => state.panelsById[panelId]?.config as C)
  const update = usePanelStore(state => state.updatePanelConfig)
  const updateConfig = useCallback((patch: Partial<C>) => update(panelId, patch), [panelId, update])

  if (!config) {
    throw new Error(`Panel "${panelId}" no longer exists`)
  }
  return [config, updateConfig]
}
