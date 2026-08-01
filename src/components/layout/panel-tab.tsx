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
    <div className="mcap-panel-tab" title={title}>
      <PanelTypeIcon
        type={instance?.type ?? ''}
        fallbackTitle={definition?.title}
        className="mcap-panel-tab__icon"
        aria-hidden="true"
      />
      <span className="mcap-panel-tab__title">{title}</span>
    </div>
  )
}
