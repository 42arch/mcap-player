import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { useMcapStore } from '@/stores/mcap'
import BottomArea from './BottomArea'
import DockArea from './DockArea'
import NavBar from './NavBar'
import OverviewArea from './OverviewArea'

export default function AppShell() {
  const loading = useMcapStore(state => state.loading)
  const loadingProgress = useMcapStore(state => state.loadingProgress)

  const loadingPercent = loadingProgress
    ? Math.min(100, Math.round((loadingProgress.loaded / loadingProgress.total) * 100))
    : 0

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-workbench text-text-main font-sans select-none relative">
      {/* Loading Progress Indicator Overlay */}
      {loading && (
        <div className="absolute inset-0 bg-[#000000]/60 backdrop-blur-md z-50 flex flex-col items-center justify-center gap-4 px-12">
          <div className="w-10 h-10 rounded-full border-2 border-layout-primary border-t-transparent animate-spin"></div>
          <div className="text-center w-64 max-w-xs space-y-3 font-mono">
            <p className="text-[11px] font-bold tracking-wider text-layout-primary uppercase">Parsing MCAP Datastream</p>
            <div className="w-full bg-layout-border h-1 rounded-full overflow-hidden">
              <div
                className="bg-layout-primary h-full transition-all duration-300"
                style={{ width: `${loadingPercent}%` }}
              />
            </div>
            {loadingProgress && (
              <p className="text-[9px] text-text-secondary">
                Parsed:
                {' '}
                {loadingProgress.loaded.toLocaleString()}
                {' '}
                /
                {' '}
                {loadingProgress.total.toLocaleString()}
                {' '}
                messages (
                {loadingPercent}
                %)
              </p>
            )}
          </div>
        </div>
      )}

      {/* Nav Bar */}
      <NavBar />

      {/* Main Body */}
      <div className="flex-1 flex min-h-0 relative overflow-hidden">
        {/* Main Side: Workspace (Dock + Bottom Panel) */}
        <main className="flex-1 h-full min-w-0 relative overflow-hidden flex flex-col">
          <ResizablePanelGroup orientation="vertical">
            <ResizablePanel minSize="20%" id="main-content">
              <ResizablePanelGroup orientation="horizontal">
                <ResizablePanel defaultSize="25%" minSize="10%" maxSize="33%" id="sidebar-panel">
                  <OverviewArea />
                </ResizablePanel>
                <ResizableHandle />
                <ResizablePanel minSize="67%" id="dock-panel">
                  <DockArea />
                </ResizablePanel>
              </ResizablePanelGroup>
            </ResizablePanel>

            <ResizableHandle />
            <ResizablePanel defaultSize="25%" minSize="5%" maxSize="25%" id="bottom-panel">
              <BottomArea />
            </ResizablePanel>
          </ResizablePanelGroup>
        </main>
      </div>
    </div>
  )
}
