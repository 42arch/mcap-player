import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

interface PanelContentHeaderProps {
  icon?: LucideIcon
  title?: string
  actions?: ReactNode
}

export function PanelContentHeader({
  actions,
}: PanelContentHeaderProps) {
  if (!actions) {
    return null
  }

  return (
    <div className="@container flex min-h-7 shrink-0 items-center justify-end gap-2 px-2 py-0.5 border-b border-border bg-header select-none">
      <div className="flex min-w-0 w-full flex-1 items-center justify-end overflow-x-auto scrollbar-none [&::-webkit-scrollbar]:hidden">
        {actions}
      </div>
    </div>
  )
}
