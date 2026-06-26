'use client'

import React from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import InspectorPanel from '@/components/panels/InspectorPanel'
import { useLayoutStore } from '@/lib/layout/store'
import BottomPanel from './BottomPanel'
import DockArea from './DockArea'
import TitleBar from './TitleBar'

export default function AppShell() {
  const bottomPanelOpen = useLayoutStore(state => state.bottomPanelOpen)
  const bottomPanelSize = useLayoutStore(state => state.bottomPanelSize)
  const setBottomPanelSize = useLayoutStore(state => state.setBottomPanelSize)

  const handleVerticalLayout = (sizes: number[]) => {
    if (sizes.length > 1) {
      setBottomPanelSize(sizes[1])
    }
  }

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-workbench text-text-main font-sans select-none">
      {/* Title Bar */}
      <TitleBar />

      {/* Main Body */}
      <div className="flex-1 flex min-h-0 relative overflow-hidden">
        {/* Main Side: Workspace (Dock + Bottom Panel) */}
        <main className="flex-1 h-full min-w-0 relative overflow-hidden flex flex-col">
          <PanelGroup direction="vertical" onLayout={handleVerticalLayout}>
            <Panel minSize={20}>
              <PanelGroup direction="horizontal">
                <Panel defaultSize={25} minSize={10} maxSize={33}>
                  <div className="w-full h-full flex flex-col bg-panel border-r border-layout-border">
                    <div className="h-[34px] bg-titlebar border-b border-layout-border px-3 flex items-center justify-between text-xs select-none shrink-0 font-sans">
                      <span className="font-semibold text-[11px]">Overview</span>
                    </div>
                    <div className="flex-1 min-h-0 overflow-hidden">
                      <InspectorPanel />
                    </div>
                  </div>
                </Panel>
                <PanelResizeHandle />
                <Panel minSize={67}>
                  <DockArea />
                </Panel>
              </PanelGroup>
            </Panel>

            {bottomPanelOpen && (
              <>
                <PanelResizeHandle />
                <Panel defaultSize={bottomPanelSize} minSize={5} maxSize={25}>
                  <BottomPanel />
                </Panel>
              </>
            )}
          </PanelGroup>
        </main>
      </div>
    </div>
  )
}
