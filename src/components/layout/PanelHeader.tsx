import type { LayoutTab } from '@/lib/layout/types'
import { PlusIcon, XIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { panelRegistry } from '@/lib/layout/registry'
import { useLayoutStore } from '@/stores/layout'

interface PanelHeaderProps {
  panelId: string
  tabs: LayoutTab[]
  activeTabId: string | null
}

export default function PanelHeader({ panelId, tabs, activeTabId }: PanelHeaderProps) {
  const closeTab = useLayoutStore(state => state.closeTab)
  const splitPanel = useLayoutStore(state => state.splitPanel)
  const addTab = useLayoutStore(state => state.addTab)
  const replaceActiveTab = useLayoutStore(state => state.replaceActiveTab)
  const draggedTab = useLayoutStore(state => state.draggedTab)
  const setDraggedTab = useLayoutStore(state => state.setDraggedTab)
  const moveTab = useLayoutStore(state => state.moveTab)
  const selectTab = useLayoutStore(state => state.selectTab)

  const [showAddMenu, setShowAddMenu] = useState(false)

  const handleAction = (action: 'replace' | 'add_right' | 'add_left' | 'add_bottom' | 'add_group', viewType: string) => {
    const title = viewType
    if (action === 'replace') {
      replaceActiveTab(panelId, viewType, title)
    }
    else if (action === 'add_group') {
      addTab(panelId, viewType, title)
    }
    else if (action === 'add_right') {
      splitPanel(panelId, 'horizontal', viewType, title, false)
    }
    else if (action === 'add_left') {
      splitPanel(panelId, 'horizontal', viewType, title, true)
    }
    else if (action === 'add_bottom') {
      splitPanel(panelId, 'vertical', viewType, title, false)
    }
    setShowAddMenu(false)
  }

  const availableViews = panelRegistry.getAll()
    .filter(p => p.type !== 'Terminal' && p.type !== 'Inspector')

  return (
    <div className="h-[34px] bg-titlebar border-b border-layout-border flex items-center justify-between select-none relative font-sans w-full text-xs shrink-0">
      {/* Tabs Container */}
      <div
        className="flex items-end h-full overflow-x-auto overflow-y-hidden scrollbar-none flex-1"
        onDragOver={e => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          if (draggedTab && draggedTab.panelId !== panelId) {
            moveTab(draggedTab.panelId, draggedTab.tabId, panelId)
          }
        }}
      >
        {tabs.map((tab, idx) => {
          const isActive = tab.id === activeTabId
          const reg = panelRegistry.get(tab.type)
          const TabIcon = reg?.icon

          return (
            <div
              key={tab.id}
              onClick={() => selectTab(panelId, tab.id)}
              draggable
              onDragStart={(e) => {
                setDraggedTab({ panelId, tabId: tab.id })
                e.dataTransfer.effectAllowed = 'move'
              }}
              onDragEnd={() => setDraggedTab(null)}
              onDragOver={e => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                e.stopPropagation()
                if (draggedTab) {
                  moveTab(draggedTab.panelId, draggedTab.tabId, panelId, idx)
                }
              }}
              className={`h-[34px] px-3.5 flex items-center gap-2 border-r border-layout-border cursor-pointer relative group transition-colors select-none ${
                isActive
                  ? 'bg-panel text-text-main font-semibold border-b border-b-transparent'
                  : 'text-text-secondary hover:text-text-main hover:bg-layout-hover'
              }`}
            >
              {/* Left active line indicator or bottom indicator (reference vs-code active tab bottom highlight) */}
              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-layout-primary"></div>
              )}

              {TabIcon && (
                <TabIcon size={12} className={isActive ? 'text-layout-primary' : 'text-text-secondary'} />
              )}
              <span className="truncate max-w-[100px] text-[11px]">{tab.title}</span>
            </div>
          )
        })}
      </div>

      {/* Plus & Toolbar Action buttons */}
      <div className="relative h-full flex items-center px-1 border-l border-layout-border gap-0.5 shrink-0">

        <DropdownMenu open={showAddMenu} onOpenChange={setShowAddMenu}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-text-secondary hover:text-text-main hover:bg-layout-hover cursor-pointer transition-colors"
              title="Add or split views"
            >
              <PlusIcon className="size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuLabel className="text-[10px] font-bold text-text-secondary px-2.5 py-1.5 uppercase tracking-wider">
              Select View
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {availableViews.map(p => (
              <DropdownMenuSub key={p.type}>
                <DropdownMenuSubTrigger className="flex items-center gap-2 w-full">
                  {p.icon && <p.icon size={13} className="text-text-secondary" />}
                  <span className="font-medium">{p.type}</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent className="w-36">
                    <DropdownMenuItem onClick={() => handleAction('replace', p.type)}>
                      替换当前面板
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleAction('add_right', p.type)}>
                      添加到右侧
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleAction('add_left', p.type)}>
                      添加到左侧
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleAction('add_bottom', p.type)}>
                      添加到下侧
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleAction('add_group', p.type)}>
                      添加到分组
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {activeTabId && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => closeTab(panelId, activeTabId)}
            className="text-text-secondary hover:text-text-main hover:bg-layout-hover cursor-pointer transition-colors"
            title="Close active tab"
          >
            <XIcon className="size-3" />
          </Button>
        )}
      </div>
    </div>
  )
}
