import type { ReactNode } from 'react'
import { HelpCircle } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

export interface HelpTooltipProps {
  content: ReactNode
  className?: string
  iconClassName?: string
  side?: 'top' | 'right' | 'bottom' | 'left'
}

export function HelpTooltip({
  content,
  className,
  iconClassName = 'inline-block size-3 text-muted-foreground/70 hover:text-foreground cursor-help transition-colors ml-1',
  side = 'top',
}: HelpTooltipProps) {
  if (!content) {
    return null
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <HelpCircle className={iconClassName} />
        </TooltipTrigger>
        <TooltipContent side={side} className={`text-xs max-w-60 ${className || ''}`}>
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
