import type { IDockviewPanelHeaderProps } from 'dockview-react'
import { useEffect, useState } from 'react'
import { getPanelDefinition } from '@/panels/core/panel-registry'
import { usePanelStore } from '@/stores/use-panel-store'
import { getPanelAppearance, PanelTypeIcon } from './panel-appearance'

export default function PanelTab({
  api,
  params,
}: IDockviewPanelHeaderProps<{ panelId: string }>) {
  const instance = usePanelStore(state => state.panelsById[params.panelId])
  const [apiTitle, setApiTitle] = useState(api.title)
  const definition = instance && getPanelDefinition(instance.type)
  const appearance = getPanelAppearance(instance?.type ?? '', definition?.title)
  const title = instance?.title || appearance.shortTitle || apiTitle || 'Panel'

  useEffect(() => {
    const disposable = api.onDidTitleChange(event => setApiTitle(event.title))
    setApiTitle(api.title)
    return () => disposable.dispose()
  }, [api])

  return (
    <div className="group flex w-full h-full min-w-0 items-center gap-1.5 px-2 py-0.5" title={title}>
      <PanelTypeIcon
        type={instance?.type ?? ''}
        fallbackTitle={definition?.title}
        className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground [.dv-active-tab_&]:text-foreground"
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-xs font-medium leading-none">{title}</span>
    </div>
  )
}
