import type { LayoutDirection, LayoutNode, LayoutTab } from '@/lib/layout/types'
import { create } from 'zustand'
import { generateId } from '@/lib/id'
import {
  addTabToPanel,
  cloneTree,
  closeTab,
  findNodeById,
  moveTab,
  splitPanel,
  splitPanelWithExistingTab,
} from '@/lib/layout/engine'

interface LayoutState {
  layoutTree: LayoutNode | null
  draggedTab: { panelId: string, tabId: string } | null
  activePanelId: string | null
  activePanelType: string | null
  activeTabId: string | null

  addPanelToEmptyLayout: (tabType: string, tabTitle: string) => void
  selectTab: (panelId: string, tabId: string) => void
  closeTab: (panelId: string, tabId: string) => void
  addTab: (panelId: string, tabType: string, tabTitle: string) => void
  replaceActiveTab: (panelId: string, tabType: string, tabTitle: string) => void
  splitPanel: (panelId: string, direction: LayoutDirection, tabType: string, tabTitle: string, before?: boolean) => void
  updateSizes: (groupId: string, sizes: number[]) => void
  resetLayout: () => void
  setDraggedTab: (draggedTab: { panelId: string, tabId: string } | null) => void
  moveTab: (sourcePanelId: string, tabId: string, targetPanelId: string, targetIndex?: number) => void
  splitPanelWithExistingTab: (sourcePanelId: string, tabId: string, targetPanelId: string, direction: LayoutDirection, before?: boolean) => void
  setActivePanel: (panelId: string | null, panelType: string | null) => void
  updateTabConfig: (panelId: string, tabId: string, config: Record<string, any>) => void
}

export const useLayoutStore = create<LayoutState>(set => ({
  layoutTree: null,
  activePanelId: null,
  activePanelType: null,
  activeTabId: null,

  addPanelToEmptyLayout: (tabType, tabTitle) => set(() => {
    const tabId = `tab-${generateId()}`
    const panelId = `panel-${generateId()}`
    const newNode: LayoutNode = {
      id: panelId,
      type: 'panel',
      tabs: [
        { id: tabId, type: tabType, title: tabTitle },
      ],
      activeTabId: tabId,
    }
    return {
      layoutTree: newNode,
      activePanelId: panelId,
      activePanelType: tabType,
      activeTabId: tabId,
    }
  }),

  selectTab: (panelId, tabId) => set((state) => {
    if (!state.layoutTree)
      return state
    const cloned = cloneTree(state.layoutTree)
    const node = findNodeById(cloned, panelId)
    let panelType: string | null = null
    if (node && node.type === 'panel') {
      node.activeTabId = tabId
      const activeTabObj = node.tabs.find(t => t.id === tabId)
      panelType = activeTabObj ? activeTabObj.type : null
    }
    return {
      layoutTree: cloned,
      activePanelId: panelId,
      activePanelType: panelType,
      activeTabId: tabId,
    }
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
    return {
      layoutTree: newTree,
      activePanelId: panelId,
      activePanelType: tabType,
      activeTabId: newTab.id,
    }
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

  resetLayout: () => set({ layoutTree: null }),

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
  setActivePanel: (panelId, panelType) => set((state) => {
    // If the panel type or activeTabId changed, sync activeTabId too
    const node = state.layoutTree ? findNodeById(state.layoutTree, panelId || '') : null
    const activeTabId = node && node.type === 'panel' ? node.activeTabId : null
    return {
      activePanelId: panelId,
      activePanelType: panelType,
      activeTabId,
    }
  }),
  updateTabConfig: (panelId, tabId, config) => set((state) => {
    if (!state.layoutTree)
      return state
    const cloned = cloneTree(state.layoutTree)
    const node = findNodeById(cloned, panelId)
    if (node && node.type === 'panel') {
      const tab = node.tabs.find(t => t.id === tabId)
      if (tab) {
        tab.config = { ...tab.config, ...config }
      }
    }
    return { layoutTree: cloned }
  }),
}))
