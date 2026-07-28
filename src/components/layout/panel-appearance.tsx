import type { LucideIcon, LucideProps } from 'lucide-react'
import {
  Box,
  Braces,
  ChartNoAxesCombined,
  Image,
  LayoutDashboard,
  PanelsTopLeft,
} from 'lucide-react'

interface PanelAppearance {
  Icon: LucideIcon
  shortTitle: string
  description: string
}

const panelAppearances: Record<string, PanelAppearance> = {
  'overview': {
    Icon: LayoutDashboard,
    shortTitle: 'Overview',
    description: 'File summary and schemas',
  },
  'messages': {
    Icon: Braces,
    shortTitle: 'Messages',
    description: 'Inspect decoded topic data',
  },
  'image': {
    Icon: Image,
    shortTitle: 'Image',
    description: 'View camera and image topics',
  },
  'plot': {
    Icon: ChartNoAxesCombined,
    shortTitle: 'Plot',
    description: 'Chart numeric message fields',
  },
  '3d': {
    Icon: Box,
    shortTitle: '3D',
    description: 'Explore spatial topic data',
  },
}

export function getPanelAppearance(type: string, fallbackTitle?: string): PanelAppearance {
  return panelAppearances[type] ?? {
    Icon: PanelsTopLeft,
    shortTitle: fallbackTitle ?? type,
    description: 'Open this panel in the workspace',
  }
}

export function PanelTypeIcon({
  type,
  fallbackTitle,
  ...props
}: LucideProps & { type: string, fallbackTitle?: string }) {
  const { Icon } = getPanelAppearance(type, fallbackTitle)
  return <Icon {...props} />
}
