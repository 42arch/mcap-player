export interface LayoutTab {
  id: string
  type: string // references panel registry key
  title: string
  config?: Record<string, any>
}

export interface LayoutPanelNode {
  id: string
  type: 'panel'
  tabs: LayoutTab[]
  activeTabId: string | null
}

export type LayoutDirection = 'horizontal' | 'vertical'

export interface LayoutGroupNode {
  id: string
  type: 'group'
  direction: LayoutDirection
  children: LayoutNode[]
  sizes?: number[] // percentage sizes for panels
}

export type LayoutNode = LayoutPanelNode | LayoutGroupNode
