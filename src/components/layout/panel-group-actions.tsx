import type { IDockviewHeaderActionsProps } from 'dockview-react'
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowRight,
  Layers,
  Plus,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { useCallback } from 'react'
import { FormattedMessage } from 'react-intl'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  getPanelDefinition,
  useRegisteredPanels,
} from '@/panels/core/panel-registry'
import { usePanelStore } from '@/stores/use-panel-store'
import { PanelTypeIcon } from './panel-appearance'

type PanelPlacement = 'replace' | 'right' | 'below' | 'within'

const placementOptions = [
  {
    placement: 'replace',
    id: 'panel.placementReplace',
    defaultMessage: 'Replace current panel',
    Icon: ArrowLeftRight,
  },
  {
    placement: 'right',
    id: 'panel.placementRight',
    defaultMessage: 'Add to the right',
    Icon: ArrowRight,
  },
  {
    placement: 'below',
    id: 'panel.placementBelow',
    defaultMessage: 'Add below',
    Icon: ArrowDown,
  },
  {
    placement: 'within',
    id: 'panel.placementWithin',
    defaultMessage: 'Add to this group',
    Icon: Layers,
  },
] as const

export default function PanelGroupActions({
  activePanel,
  containerApi,
}: IDockviewHeaderActionsProps) {
  const panels = useRegisteredPanels()
  const addPanel = usePanelStore(state => state.addPanel)
  const setSelectedPanel = usePanelStore(state => state.setSelectedPanel)
  const setSidebarTab = usePanelStore(state => state.setSidebarTab)

  const addPanelAt = useCallback((type: string, placement: PanelPlacement) => {
    const definition = getPanelDefinition(type)
    if (!definition) {
      return
    }

    const referencePanel = activePanel
    const panelId = addPanel(type)
    containerApi.addPanel({
      id: panelId,
      component: 'panel',
      title: definition.title,
      params: { panelId },
      ...(referencePanel
        ? {
            position: {
              referencePanel,
              direction: placement === 'replace' ? 'within' : placement,
            },
          }
        : {}),
    })

    if (placement === 'replace' && referencePanel) {
      referencePanel.api.close()
    }
  }, [activePanel, addPanel, containerApi])

  const openSettings = useCallback(() => {
    if (!activePanel) {
      return
    }
    activePanel.api.setActive()
    setSelectedPanel(activePanel.id)
    setSidebarTab('settings')
  }, [activePanel, setSelectedPanel, setSidebarTab])

  const closePanel = useCallback(() => {
    activePanel?.api.close()
  }, [activePanel])

  return (
    <div className="flex h-full shrink-0 items-center gap-0.5 px-1 border-l border-border bg-header">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={!activePanel}
            aria-label="Panel settings"
            onClick={openSettings}
          >
            <SlidersHorizontal data-icon="inline-start" className="w-3.5 h-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <FormattedMessage id="panel.settings" defaultMessage="Panel settings" />
        </TooltipContent>
      </Tooltip>

      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Add panel"
              >
                <Plus data-icon="inline-start" className="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <FormattedMessage id="panel.addPanel" defaultMessage="Add panel" />
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel>
            <FormattedMessage id="panel.addPanel" defaultMessage="Add panel" />
          </DropdownMenuLabel>
          <DropdownMenuGroup>
            {panels.map((panel) => {
              return (
                <DropdownMenuSub key={panel.type}>
                  <DropdownMenuSubTrigger>
                    <PanelTypeIcon
                      type={panel.type}
                      fallbackTitle={panel.title}
                      className="w-3.5 h-3.5"
                    />
                    <span className="truncate">
                      <FormattedMessage id={`panel.${panel.type}.title`} defaultMessage={panel.title} />
                    </span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-52">
                    <DropdownMenuGroup>
                      {placementOptions.map(({ placement, id, defaultMessage, Icon }) => (
                        <DropdownMenuItem
                          key={placement}
                          onSelect={() => addPanelAt(panel.type, placement)}
                        >
                          <Icon className="w-3.5 h-3.5" />
                          <FormattedMessage id={id} defaultMessage={defaultMessage} />
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )
            })}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={!activePanel}
            aria-label="Close panel"
            onClick={closePanel}
          >
            <X data-icon="inline-start" className="w-3.5 h-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <FormattedMessage id="panel.closePanel" defaultMessage="Close panel" />
        </TooltipContent>
      </Tooltip>
    </div>
  )
}
