import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

interface PanelContentHeaderProps {
  icon: LucideIcon
  title: string
  actions?: ReactNode
}

export function PanelContentHeader({
  icon: Icon,
  title,
  actions,
}: PanelContentHeaderProps) {
  return (
    <div className="mcap-panel-content-header">
      <div className="mcap-panel-content-header__identity">
        <span className="mcap-panel-content-header__icon">
          <Icon aria-hidden="true" />
        </span>
        <span className="mcap-panel-content-header__title">{title}</span>
      </div>
      {actions && (
        <div className="mcap-panel-content-header__actions">
          {actions}
        </div>
      )}
    </div>
  )
}
