import type { DockviewApi, DockviewReadyEvent } from 'dockview-react'
import { DockviewReact, themeDark, themeLight } from 'dockview-react'
import { useTheme } from 'next-themes'
import { useCallback, useEffect, useState } from 'react'
import { registerBuiltInPanels } from '@/panels/builtins/register-builtins'
import { getPanelDefinition } from '@/panels/core/panel-registry'
import { globalMessagePipeline } from '@/panels/runtime/message-pipeline'
import { usePanelStore } from '@/stores/use-panel-store'
import PanelGroupActions from './panel-group-actions'
import PanelHost from './panel-host'
import PanelTab from './panel-tab'

import 'dockview-react/dist/styles/dockview.css'

registerBuiltInPanels()

const dockviewComponents = { panel: PanelHost }

export default function PanelWorkspace() {
  const { resolvedTheme } = useTheme()
  const panelOrder = usePanelStore(state => state.panelOrder)
  const addPanel = usePanelStore(state => state.addPanel)
  const removePanel = usePanelStore(state => state.removePanel)
  const setActivePanel = usePanelStore(state => state.setActivePanel)
  const setSelectedPanel = usePanelStore(state => state.setSelectedPanel)
  const [api, setApi] = useState<DockviewApi | null>(null)

  const addPanelToWorkspace = useCallback((type: string) => {
    if (!api) {
      return
    }
    const definition = getPanelDefinition(type)
    if (!definition) {
      return
    }
    const panelId = addPanel(type)
    api.addPanel({
      id: panelId,
      component: 'panel',
      title: definition.title,
      params: { panelId },
    })
  }, [addPanel, api])

  useEffect(() => {
    if (!api) {
      return
    }
    if (panelOrder.length === 0) {
      addPanelToWorkspace('overview')
      return
    }

    for (const panelId of panelOrder) {
      if (api.getPanel(panelId)) {
        continue
      }
      const instance = usePanelStore.getState().panelsById[panelId]
      const definition = instance && getPanelDefinition(instance.type)
      if (instance && definition) {
        api.addPanel({
          id: panelId,
          component: 'panel',
          title: instance.title || definition.title,
          params: { panelId },
          inactive: true,
        })
      }
    }
  }, [addPanelToWorkspace, api, panelOrder])

  useEffect(() => {
    if (!api) {
      return
    }
    const activeDisposable = api.onDidActivePanelChange((event) => {
      const panelId = event.panel?.id ?? null
      setActivePanel(panelId)
      setSelectedPanel(panelId)
    })
    const removeDisposable = api.onDidRemovePanel((panel) => {
      globalMessagePipeline.clearPanel(panel.id)
      removePanel(panel.id)
    })
    return () => {
      activeDisposable.dispose()
      removeDisposable.dispose()
    }
  }, [api, removePanel, setActivePanel, setSelectedPanel])

  const onReady = useCallback((event: DockviewReadyEvent) => setApi(event.api), [])

  return (
    <div className="mcap-dockview h-full min-h-0 bg-background">
      <DockviewReact
        components={dockviewComponents}
        defaultTabComponent={PanelTab}
        rightHeaderActionsComponent={PanelGroupActions}
        onReady={onReady}
        theme={resolvedTheme === 'dark' ? themeDark : themeLight}
      />
    </div>
  )
}
