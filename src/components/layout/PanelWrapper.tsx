'use client'

import type { LayoutPanelNode } from '@/lib/layout/types'
import { panelRegistry } from '@/lib/layout/registry'
import TabBar from './TabBar'
import { useLayoutStore } from '@/lib/layout/store'
import React from 'react'

interface PanelWrapperProps {
  node: LayoutPanelNode
}

export default function PanelWrapper({ node }: PanelWrapperProps) {
  const activeTab = node.tabs.find(t => t.id === node.activeTabId) || node.tabs[0] || null
  const PanelComponent = activeTab ? panelRegistry.get(activeTab.type)?.component : null

  const draggedTab = useLayoutStore(state => state.draggedTab)
  const setDraggedTab = useLayoutStore(state => state.setDraggedTab)
  const moveTab = useLayoutStore(state => state.moveTab)
  const splitPanelWithExistingTab = useLayoutStore(state => state.splitPanelWithExistingTab)

  const [activeZone, setActiveZone] = React.useState<'center' | 'left' | 'right' | 'top' | 'bottom' | null>(null)

  // Listen to global dragend to reset dragged state in case element unmounts or drag cancels
  React.useEffect(() => {
    const handleGlobalDragEnd = () => {
      setDraggedTab(null)
      setActiveZone(null)
    }
    window.addEventListener('dragend', handleGlobalDragEnd)
    return () => {
      window.removeEventListener('dragend', handleGlobalDragEnd)
    }
  }, [setDraggedTab])

  const handleDragOver = (e: React.DragEvent, zone: 'center' | 'left' | 'right' | 'top' | 'bottom') => {
    e.preventDefault()
    e.stopPropagation()
    setActiveZone(zone)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    // Only clear if the cursor actually leaves to prevent flickering
    setActiveZone(null)
  }

  const handleDrop = (e: React.DragEvent, zone: 'center' | 'left' | 'right' | 'top' | 'bottom') => {
    e.preventDefault()
    e.stopPropagation()
    setActiveZone(null)
    if (!draggedTab) return

    // Don't split or move to itself if it's the only tab in this panel
    if (draggedTab.panelId === node.id && node.tabs.length === 1) {
      return
    }

    if (zone === 'center') {
      moveTab(draggedTab.panelId, draggedTab.tabId, node.id)
    }
    else if (zone === 'left') {
      splitPanelWithExistingTab(draggedTab.panelId, draggedTab.tabId, node.id, 'horizontal', true)
    }
    else if (zone === 'right') {
      splitPanelWithExistingTab(draggedTab.panelId, draggedTab.tabId, node.id, 'horizontal', false)
    }
    else if (zone === 'top') {
      splitPanelWithExistingTab(draggedTab.panelId, draggedTab.tabId, node.id, 'vertical', true)
    }
    else if (zone === 'bottom') {
      splitPanelWithExistingTab(draggedTab.panelId, draggedTab.tabId, node.id, 'vertical', false)
    }
  }

  return (
    <div className="w-full h-full flex flex-col bg-panel overflow-hidden relative">
      {/* Tab Bar */}
      <TabBar panelId={node.id} tabs={node.tabs} activeTabId={node.activeTabId} />

      {/* Panel Content */}
      <div className="flex-1 min-h-0 relative overflow-hidden bg-panel">
        {PanelComponent
          ? (
              <PanelComponent />
            )
          : (
              <div className="w-full h-full flex items-center justify-center text-text-secondary text-xs select-none">
                No active panel tab
              </div>
            )}
      </div>

      {/* Drag & Drop Split Zones Overlay */}
      {draggedTab && draggedTab.panelId !== node.id && (
        <div className="absolute inset-0 z-50 bg-transparent">
          {/* Visual feedback highlight overlay */}
          {activeZone === 'left' && (
            <div className="absolute left-0 top-0 w-1/2 h-full bg-layout-primary/15 border-r-2 border-layout-primary pointer-events-none z-0 transition-all duration-150" />
          )}
          {activeZone === 'right' && (
            <div className="absolute right-0 top-0 w-1/2 h-full bg-layout-primary/15 border-l-2 border-layout-primary pointer-events-none z-0 transition-all duration-150" />
          )}
          {activeZone === 'top' && (
            <div className="absolute left-0 top-0 w-full h-1/2 bg-layout-primary/15 border-b-2 border-layout-primary pointer-events-none z-0 transition-all duration-150" />
          )}
          {activeZone === 'bottom' && (
            <div className="absolute left-0 bottom-0 w-full h-1/2 bg-layout-primary/15 border-t-2 border-layout-primary pointer-events-none z-0 transition-all duration-150" />
          )}
          {activeZone === 'center' && (
            <div className="absolute inset-0 bg-layout-primary/15 border-2 border-dashed border-layout-primary pointer-events-none z-0 flex items-center justify-center transition-all duration-150">
              <span className="text-[10px] bg-layout-primary text-white px-2 py-0.5 rounded-[2px] font-semibold shadow-sm">
                Add Tab
              </span>
            </div>
          )}

          {/* Interactive target zones (Invisible layout for perfect drop detection) */}
          {/* Left Target (left 25%) */}
          <div
            onDragOver={e => handleDragOver(e, 'left')}
            onDragLeave={handleDragLeave}
            onDrop={e => handleDrop(e, 'left')}
            className="absolute left-0 top-0 w-1/4 h-full z-10 bg-transparent"
          />

          {/* Right Target (right 25%) */}
          <div
            onDragOver={e => handleDragOver(e, 'right')}
            onDragLeave={handleDragLeave}
            onDrop={e => handleDrop(e, 'right')}
            className="absolute right-0 top-0 w-1/4 h-full z-10 bg-transparent"
          />

          {/* Top Target (middle-top 25%) */}
          <div
            onDragOver={e => handleDragOver(e, 'top')}
            onDragLeave={handleDragLeave}
            onDrop={e => handleDrop(e, 'top')}
            className="absolute left-1/4 top-0 w-1/2 h-1/4 z-10 bg-transparent"
          />

          {/* Bottom Target (middle-bottom 25%) */}
          <div
            onDragOver={e => handleDragOver(e, 'bottom')}
            onDragLeave={handleDragLeave}
            onDrop={e => handleDrop(e, 'bottom')}
            className="absolute left-1/4 bottom-0 w-1/2 h-1/4 z-10 bg-transparent"
          />

          {/* Center Target (middle-center 50%) */}
          <div
            onDragOver={e => handleDragOver(e, 'center')}
            onDragLeave={handleDragLeave}
            onDrop={e => handleDrop(e, 'center')}
            className="absolute left-1/4 top-1/4 w-1/2 h-1/2 z-10 bg-transparent"
          />
        </div>
      )}
    </div>
  )
}
