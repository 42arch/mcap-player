import type { LayoutDirection, LayoutNode, LayoutTab } from './types'
import { create } from 'zustand'
import {
  addTabToPanel,
  cloneTree,
  closeTab,
  findNodeById,
  generateId,
  splitPanel,
  moveTab,
  splitPanelWithExistingTab,
} from './engine'

interface LayoutState {
  layoutTree: LayoutNode | null
  activeActivityId: string
  bottomPanelOpen: boolean
  bottomPanelSize: number // percentage (e.g. 25)
  bottomPanelActiveTab: string
  draggedTab: { panelId: string, tabId: string } | null

  selectTab: (panelId: string, tabId: string) => void
  closeTab: (panelId: string, tabId: string) => void
  addTab: (panelId: string, tabType: string, tabTitle: string) => void
  replaceActiveTab: (panelId: string, tabType: string, tabTitle: string) => void
  splitPanel: (panelId: string, direction: LayoutDirection, tabType: string, tabTitle: string, before?: boolean) => void
  updateSizes: (groupId: string, sizes: number[]) => void
  toggleBottomPanel: (open?: boolean) => void
  setBottomPanelSize: (size: number) => void
  setBottomPanelTab: (tabId: string) => void
  setActiveActivityId: (id: string) => void
  resetLayout: () => void
  setDraggedTab: (draggedTab: { panelId: string, tabId: string } | null) => void
  moveTab: (sourcePanelId: string, tabId: string, targetPanelId: string, targetIndex?: number) => void
  splitPanelWithExistingTab: (sourcePanelId: string, tabId: string, targetPanelId: string, direction: LayoutDirection, before?: boolean) => void
}

const defaultLayout: LayoutNode = {
  id: 'root-group',
  type: 'group',
  direction: 'horizontal',
  children: [
    {
      id: 'left-group',
      type: 'group',
      direction: 'vertical',
      children: [
        {
          id: 'map-panel',
          type: 'panel',
          tabs: [
            { id: 'tab-map', type: 'Map', title: 'Map' },
          ],
          activeTabId: 'tab-map',
        },
        {
          id: 'plot-panel',
          type: 'panel',
          tabs: [
            { id: 'tab-plot', type: 'Plot', title: 'Plot' },
          ],
          activeTabId: 'tab-plot',
        },
      ],
      sizes: [50, 50],
    },
    {
      id: 'right-panel',
      type: 'panel',
      tabs: [
        { id: 'tab-scene', type: 'Scene', title: 'Scene' },
      ],
      activeTabId: 'tab-scene',
    },
  ],
  sizes: [65, 35],
}

export const useLayoutStore = create<LayoutState>(set => ({
  layoutTree: defaultLayout,
  activeActivityId: 'explorer',
  bottomPanelOpen: true,
  bottomPanelSize: 25,
  bottomPanelActiveTab: 'terminal',

  selectTab: (panelId, tabId) => set((state) => {
    if (!state.layoutTree)
      return state
    const cloned = cloneTree(state.layoutTree)
    const node = findNodeById(cloned, panelId)
    if (node && node.type === 'panel') {
      node.activeTabId = tabId
    }
    return { layoutTree: cloned }
  }),

  closeTab: (panelId, tabId) => set((state) => {
    if (!state.layoutTree)
      return state
    const newTree = closeTab(state.layoutTree, panelId, tabId)
    return { layoutTree: newTree }
  }),

  addTab: (panelId, tabType, tabTitle) => set((state) => {
    if (!state.layoutTree)
      return state
    const newTab: LayoutTab = {
      id: `tab-${generateId()}`,
      type: tabType,
      title: tabTitle,
    }
    const newTree = addTabToPanel(state.layoutTree, panelId, newTab)
    return { layoutTree: newTree }
  }),

  replaceActiveTab: (panelId, tabType, tabTitle) => set((state) => {
    if (!state.layoutTree)
      return state
    const cloned = cloneTree(state.layoutTree)
    const node = findNodeById(cloned, panelId)
    if (node && node.type === 'panel') {
      const activeTab = node.tabs.find(t => t.id === node.activeTabId) || node.tabs[0]
      if (activeTab) {
        activeTab.type = tabType
        activeTab.title = tabTitle
      }
    }
    return { layoutTree: cloned }
  }),

  splitPanel: (panelId, direction, tabType, tabTitle, before) => set((state) => {
    if (!state.layoutTree)
      return state
    const newTab: LayoutTab = {
      id: `tab-${generateId()}`,
      type: tabType,
      title: tabTitle,
    }
    const newTree = splitPanel(state.layoutTree, panelId, direction, newTab, before)
    return { layoutTree: newTree }
  }),

  updateSizes: (groupId, sizes) => set((state) => {
    if (!state.layoutTree)
      return state
    const cloned = cloneTree(state.layoutTree)
    const node = findNodeById(cloned, groupId)
    if (node && node.type === 'group') {
      node.sizes = sizes
    }
    return { layoutTree: cloned }
  }),

  toggleBottomPanel: open => set(state => ({
    bottomPanelOpen: open !== undefined ? open : !state.bottomPanelOpen,
  })),

  setBottomPanelSize: size => set({ bottomPanelSize: size }),

  setBottomPanelTab: tabId => set({ bottomPanelActiveTab: tabId }),

  setActiveActivityId: id => set({ activeActivityId: id }),

  resetLayout: () => set({ layoutTree: defaultLayout }),

  draggedTab: null,
  setDraggedTab: draggedTab => set({ draggedTab }),

  moveTab: (sourcePanelId, tabId, targetPanelId, targetIndex) => set((state) => {
    if (!state.layoutTree)
      return state
    const newTree = moveTab(state.layoutTree, sourcePanelId, tabId, targetPanelId, targetIndex)
    return { layoutTree: newTree, draggedTab: null }
  }),

  splitPanelWithExistingTab: (sourcePanelId, tabId, targetPanelId, direction, before) => set((state) => {
    if (!state.layoutTree)
      return state
    const newTree = splitPanelWithExistingTab(state.layoutTree, sourcePanelId, tabId, targetPanelId, direction, before)
    return { layoutTree: newTree, draggedTab: null }
  }),
}))
