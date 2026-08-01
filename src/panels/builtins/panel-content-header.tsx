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
    <div className="mcap-panel-content-header">
      <div className="mcap-panel-content-header__actions">
        {actions}
      </div>
    </div>
  )
}

export const PanelToolbar = PanelContentHeader
