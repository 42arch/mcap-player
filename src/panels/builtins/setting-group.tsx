import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

export interface SettingGroupProps {
  /** 分组标题 */
  title: string
  /** 描述说明文字 */
  description?: string
  /** 右侧辅助操作/按钮 */
  action?: ReactNode
  /** 默认展开状态 */
  defaultOpen?: boolean
  /** 受控展开状态 */
  open?: boolean
  /** 展开状态改变事件 */
  onOpenChange?: (open: boolean) => void
  /** 扩展 class 类名 */
  className?: string
  /** 设置项子元素 */
  children: ReactNode
}

export function SettingGroup({
  title,
  description,
  action,
  defaultOpen = true,
  open: controlledOpen,
  onOpenChange,
  className,
  children,
}: SettingGroupProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen)
  const isControlled = controlledOpen !== undefined
  const isOpen = isControlled ? controlledOpen : internalOpen

  const toggleOpen = () => {
    const next = !isOpen
    if (!isControlled) {
      setInternalOpen(next)
    }
    onOpenChange?.(next)
  }

  return (
    <div className={cn('border-b border-border/60 last:border-b-0', className)}>
      {/* Group Header */}
      <div
        onClick={toggleOpen}
        className="flex items-center justify-between py-1.5 px-2 bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer select-none group"
      >
        <div className="flex items-center gap-2 min-w-0">
          <ChevronDown
            className={cn(
              'size-3.5 shrink-0 text-muted-foreground transition-transform duration-200',
              !isOpen && '-rotate-90',
            )}
          />
          <div className="flex flex-col min-w-0">
            <span className="text-[11px] font-bold tracking-normal text-foreground truncate">
              {title}
            </span>
            {description && (
              <span className="text-[9px] text-muted-foreground/70 truncate">
                {description}
              </span>
            )}
          </div>
        </div>

        {action && (
          <div
            onClick={e => e.stopPropagation()}
            className="flex items-center gap-1.5 shrink-0"
          >
            {action}
          </div>
        )}
      </div>

      {/* Group Body */}
      {isOpen && (
        <div className="px-3 py-1.5 bg-background">
          {children}
        </div>
      )}
    </div>
  )
}
