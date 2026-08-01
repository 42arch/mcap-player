import { Settings2 } from 'lucide-react'
import { Suspense } from 'react'
import { getPanelDefinition } from '@/panels/core/panel-registry'
import { usePanelStore } from '@/stores/use-panel-store'

export default function PanelSettingsHost() {
  const panelId = usePanelStore(state => state.selectedPanelId)
  const instance = usePanelStore(state => panelId ? state.panelsById[panelId] : undefined)
  const updateConfig = usePanelStore(state => state.updatePanelConfig)
  const definition = instance ? getPanelDefinition(instance.type) : undefined

  if (!panelId || !instance || !definition) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center text-muted-foreground gap-2">
        <Settings2 className="size-6 opacity-40" />
        <span className="text-xs font-semibold">No panel selected</span>
        <span className="text-[10px] max-w-48">Select a panel tab to edit its independent settings.</span>
      </div>
    )
  }

  if (!definition.Settings) {
    return (
      <div className="p-4 flex flex-col items-center justify-center text-center text-muted-foreground h-48 gap-2">
        <span className="text-xs font-semibold">No Settings Available</span>
        <span className="text-[10px] max-w-48">This panel does not expose runtime configuration.</span>
      </div>
    )
  }

  const Settings = definition.Settings
  return (
    <Suspense fallback={<div className="p-4 text-[10px] text-muted-foreground">Loading settings…</div>}>
      <Settings
        panelId={panelId}
        config={instance.config}
        updateConfig={patch => updateConfig(panelId, patch)}
      />
    </Suspense>
  )
}
