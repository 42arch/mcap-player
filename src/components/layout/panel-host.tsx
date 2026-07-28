'use client'

import type { IDockviewPanelProps } from 'dockview-react'
import { AlertCircle, Loader2 } from 'lucide-react'
import { Component, Suspense } from 'react'
import { PanelScope } from '@/panels/core/panel-context'
import { getPanelDefinition } from '@/panels/core/panel-registry'
import { usePanelStore } from '@/stores/use-panel-store'

class PanelErrorBoundary extends Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="h-full flex flex-col items-center justify-center gap-2 p-6 text-center text-destructive">
          <AlertCircle className="size-5" />
          <span className="text-xs font-semibold">Panel failed to load</span>
          <span className="text-[10px] text-muted-foreground">{this.state.error.message}</span>
        </div>
      )
    }
    return this.props.children
  }
}

function PanelLoading() {
  return (
    <div className="h-full flex items-center justify-center text-muted-foreground">
      <Loader2 className="size-5 animate-spin" />
    </div>
  )
}

export default function PanelHost({ params }: IDockviewPanelProps<{ panelId: string }>) {
  const panelId = params.panelId
  const instance = usePanelStore(state => state.panelsById[panelId])
  const definition = instance ? getPanelDefinition(instance.type) : undefined

  if (!instance || !definition) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
        <AlertCircle className="size-5" />
        <span className="text-xs font-semibold">Panel is unavailable</span>
        <span className="text-[10px]">The panel plugin may no longer be registered.</span>
      </div>
    )
  }

  const Panel = definition.Panel
  return (
    <PanelErrorBoundary>
      <Suspense fallback={<PanelLoading />}>
        <PanelScope panelId={panelId}>
          <Panel panelId={panelId} config={instance.config} />
        </PanelScope>
      </Suspense>
    </PanelErrorBoundary>
  )
}
