import type { DockviewApi, DockviewReadyEvent } from 'dockview-react'
import { DockviewReact, themeDark, themeLight } from 'dockview-react'
import { useTheme } from 'next-themes'
import { useCallback, useEffect, useState } from 'react'
import { registerBuiltInPanels } from '@/panels/builtins/register-builtins'
import { computeGridPosition, planInitialPanels } from '@/panels/core/default-layout'
import { getPanelDefinition } from '@/panels/core/panel-registry'
import { globalMessagePipeline } from '@/panels/runtime/message-pipeline'
import { usePanelStore } from '@/stores/use-panel-store'
import { usePlayerStore } from '@/stores/use-player-store'
import PanelGroupActions from './panel-group-actions'
import PanelHost from './panel-host'
import PanelTab from './panel-tab'

import 'dockview-react/dist/styles/dockview.css'

registerBuiltInPanels()

const dockviewComponents = { panel: PanelHost }

export default function PanelWorkspace() {
  const { resolvedTheme } = useTheme()
  const panelOrder = usePanelStore(state => state.panelOrder)
  const addPanels = usePanelStore(state => state.addPanels)
  const removePanel = usePanelStore(state => state.removePanel)
  const setActivePanel = usePanelStore(state => state.setActivePanel)
  const setSelectedPanel = usePanelStore(state => state.setSelectedPanel)
  const setDockviewApi = usePanelStore(state => state.setDockviewApi)
  const [api, setApi] = useState<DockviewApi | null>(null)

  useEffect(() => {
    if (!api) {
      return
    }
    if (panelOrder.length === 0) {
      const channels = usePlayerStore.getState().fileSummary?.channels ?? []
      const initialPanels = planInitialPanels(channels)
      const panelIds = addPanels(initialPanels)

      for (let i = 0; i < panelIds.length; i++) {
        const panelId = panelIds[i]
        const spec = initialPanels[i]
        const definition = getPanelDefinition(spec.type)
        if (!definition) {
          continue
        }

        const position = computeGridPosition(i, panelIds.length, panelIds)
        api.addPanel({
          id: panelId,
          component: 'panel',
          title: definition.title,
          params: { panelId },
          ...(position ? { position } : {}),
        })
      }
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
  }, [addPanels, api, panelOrder])

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

  const onReady = useCallback((event: DockviewReadyEvent) => {
    setApi(event.api)
    setDockviewApi(event.api)
  }, [setDockviewApi])

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
