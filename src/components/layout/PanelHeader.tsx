'use client'

import type { LayoutTab } from '@/lib/layout/types'
import { ArrowsClockwise, DotsThree } from '@phosphor-icons/react'
import { panelRegistry } from '@/lib/layout/registry'

interface PanelHeaderProps {
  activeTab: LayoutTab | null
}

export default function PanelHeader({ activeTab }: PanelHeaderProps) {
  if (!activeTab)
    return null

  const reg = panelRegistry.get(activeTab.type)
  const HeaderIcon = reg?.icon

  return (
    <div className="h-[34px] bg-panel border-b border-layout-border px-3 flex items-center justify-between text-xs select-none shrink-0 font-sans w-full">
      {/* Left: Icon & Title */}
      <div className="flex items-center gap-2 text-text-main font-medium">
        {HeaderIcon && <HeaderIcon size={13} className="text-text-secondary" />}
        <span className="text-[11px] font-semibold">{activeTab.title}</span>
      </div>

      {/* Right: Toolbar */}
      <div className="flex items-center gap-1.5 text-text-secondary">
        <button className="p-1 hover:bg-layout-hover hover:text-text-main rounded-[2px] transition-colors cursor-pointer" title="Refresh">
          <ArrowsClockwise size={13} />
        </button>
        <button className="p-1 hover:bg-layout-hover hover:text-text-main rounded-[2px] transition-colors cursor-pointer" title="More Actions">
          <DotsThree size={13} weight="bold" />
        </button>
      </div>
    </div>
  )
}
