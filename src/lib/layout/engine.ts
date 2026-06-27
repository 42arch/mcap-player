import type { LayoutDirection, LayoutGroupNode, LayoutNode, LayoutPanelNode, LayoutTab } from './types'
import { generateId } from '@/lib/id'

export function findNodeById(root: LayoutNode, id: string): LayoutNode | null {
  if (root.id === id)
    return root
  if (root.type === 'group') {
    for (const child of root.children) {
      const found = findNodeById(child, id)
      if (found)
        return found
    }
  }
  return null
}

export function findParentNode(root: LayoutNode, targetId: string): LayoutGroupNode | null {
  if (root.type !== 'group')
    return null
  for (const child of root.children) {
    if (child.id === targetId)
      return root
    if (child.type === 'group') {
      const parent = findParentNode(child, targetId)
      if (parent)
        return parent
    }
  }
  return null
}

export function cloneTree(root: LayoutNode): LayoutNode {
  if (root.type === 'panel') {
    return {
      ...root,
      tabs: root.tabs.map(t => ({ ...t })),
    }
  }
  else {
    return {
      ...root,
      children: root.children.map(cloneTree),
      sizes: root.sizes ? [...root.sizes] : undefined,
    }
  }
}

export function balanceSizes(count: number): number[] {
  const size = 100 / count
  return Array.from({ length: count }).fill(size) as number[]
}

export function closeTab(root: LayoutNode, panelId: string, tabId: string): LayoutNode | null {
  const cloned = cloneTree(root)
  const node = findNodeById(cloned, panelId)
  if (!node || node.type !== 'panel')
    return cloned

  node.tabs = node.tabs.filter(t => t.id !== tabId)

  if (node.tabs.length > 0) {
    if (node.activeTabId === tabId) {
      node.activeTabId = node.tabs[0].id
    }
    return cloned
  }

  // If panel is empty, we must remove it from the tree
  return removeNode(cloned, panelId)
}

export function removeNode(root: LayoutNode, nodeId: string): LayoutNode | null {
  if (root.id === nodeId) {
    return null
  }

  const parent = findParentNode(root, nodeId)
  if (!parent)
    return root

  const index = parent.children.findIndex(c => c.id === nodeId)
  if (index !== -1) {
    parent.children.splice(index, 1)
    if (parent.sizes) {
      parent.sizes.splice(index, 1)
      const sum = parent.sizes.reduce((a, b) => a + b, 0)
      if (sum > 0) {
        parent.sizes = parent.sizes.map(s => (s / sum) * 100)
      }
      else {
        parent.sizes = balanceSizes(parent.children.length)
      }
    }
  }

  return cleanTree(root)
}

export function cleanTree(root: LayoutNode): LayoutNode | null {
  if (root.type === 'panel') {
    return root
  }

  const cleanedChildren: LayoutNode[] = []
  const cleanedSizes: number[] = []

  for (let i = 0; i < root.children.length; i++) {
    const child = cleanTree(root.children[i])
    if (child) {
      cleanedChildren.push(child)
      if (root.sizes && root.sizes[i] !== undefined) {
        cleanedSizes.push(root.sizes[i])
      }
    }
  }

  if (cleanedChildren.length === 0) {
    return null
  }

  if (cleanedChildren.length === 1) {
    return cleanedChildren[0]
  }

  root.children = cleanedChildren
  if (root.sizes) {
    const sum = cleanedSizes.reduce((a, b) => a + b, 0)
    root.sizes = sum > 0 ? cleanedSizes.map(s => (s / sum) * 100) : balanceSizes(cleanedChildren.length)
  }
  return {
    ...root,
    children: cleanedChildren,
  }
}

export function splitPanel(
  root: LayoutNode,
  targetId: string,
  direction: LayoutDirection,
  newTab: LayoutTab,
  before = false,
): LayoutNode {
  const cloned = cloneTree(root)
  const targetNode = findNodeById(cloned, targetId)
  if (!targetNode)
    return cloned

  const newPanel: LayoutPanelNode = {
    id: generateId(),
    type: 'panel',
    tabs: [newTab],
    activeTabId: newTab.id,
  }

  if (cloned.id === targetId) {
    const children = before ? [newPanel, cloned] : [cloned, newPanel]
    const newRoot: LayoutGroupNode = {
      id: generateId(),
      type: 'group',
      direction,
      children,
      sizes: [50, 50],
    }
    return newRoot
  }

  const parent = findParentNode(cloned, targetId)
  if (!parent)
    return cloned

  const index = parent.children.findIndex(c => c.id === targetId)

  if (parent.direction === direction) {
    const insertIndex = before ? index : index + 1
    parent.children.splice(insertIndex, 0, newPanel)
    if (parent.sizes) {
      const targetSize = parent.sizes[index]
      const halfSize = targetSize / 2
      parent.sizes[index] = halfSize
      parent.sizes.splice(insertIndex, 0, halfSize)
    }
    else {
      parent.sizes = balanceSizes(parent.children.length)
    }
  }
  else {
    const children = before ? [newPanel, targetNode] : [targetNode, newPanel]
    const wrappedGroup: LayoutGroupNode = {
      id: generateId(),
      type: 'group',
      direction,
      children,
      sizes: [50, 50],
    }
    parent.children[index] = wrappedGroup
  }

  return cloned
}

export function addTabToPanel(root: LayoutNode, panelId: string, tab: LayoutTab): LayoutNode {
  const cloned = cloneTree(root)
  const node = findNodeById(cloned, panelId)
  if (node && node.type === 'panel') {
    if (!node.tabs.some(t => t.id === tab.id)) {
      node.tabs.push(tab)
    }
    node.activeTabId = tab.id
  }
  return cloned
}

export function moveTab(
  root: LayoutNode,
  sourcePanelId: string,
  tabId: string,
  targetPanelId: string,
  targetIndex?: number,
): LayoutNode {
  const cloned = cloneTree(root)
  const sourceNode = findNodeById(cloned, sourcePanelId)
  if (!sourceNode || sourceNode.type !== 'panel')
    return cloned

  const tabIndex = sourceNode.tabs.findIndex(t => t.id === tabId)
  if (tabIndex === -1)
    return cloned
  const [tab] = sourceNode.tabs.splice(tabIndex, 1)

  if (sourceNode.activeTabId === tabId) {
    sourceNode.activeTabId = sourceNode.tabs.length > 0 ? sourceNode.tabs[0].id : null
  }

  const targetNode = findNodeById(cloned, targetPanelId)
  if (!targetNode || targetNode.type !== 'panel') {
    sourceNode.tabs.splice(tabIndex, 0, tab)
    if (!sourceNode.activeTabId)
      sourceNode.activeTabId = tab.id
    return cloned
  }

  if (targetIndex !== undefined && targetIndex >= 0 && targetIndex <= targetNode.tabs.length) {
    targetNode.tabs.splice(targetIndex, 0, tab)
  }
  else {
    targetNode.tabs.push(tab)
  }
  targetNode.activeTabId = tab.id

  if (sourceNode.tabs.length === 0) {
    return removeNode(cloned, sourcePanelId) || cloned
  }

  return cloned
}

export function splitPanelWithExistingTab(
  root: LayoutNode,
  sourcePanelId: string,
  tabId: string,
  targetPanelId: string,
  direction: LayoutDirection,
  before = false,
): LayoutNode {
  let cloned = cloneTree(root)
  const sourceNode = findNodeById(cloned, sourcePanelId)
  if (!sourceNode || sourceNode.type !== 'panel')
    return cloned

  const tabIndex = sourceNode.tabs.findIndex(t => t.id === tabId)
  if (tabIndex === -1)
    return cloned
  const [tab] = sourceNode.tabs.splice(tabIndex, 1)

  if (sourceNode.activeTabId === tabId) {
    sourceNode.activeTabId = sourceNode.tabs.length > 0 ? sourceNode.tabs[0].id : null
  }

  if (sourceNode.tabs.length === 0) {
    cloned = removeNode(cloned, sourcePanelId) || cloned
  }

  cloned = splitPanel(cloned, targetPanelId, direction, tab, before)
  return cloned
}
