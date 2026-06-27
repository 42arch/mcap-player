import { PlusIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { panelRegistry } from '@/lib/layout/registry'
import { useLayoutStore } from '@/stores/layout'
import LayoutRenderer from './LayoutRenderer'

export default function DockArea() {
  const layoutTree = useLayoutStore(state => state.layoutTree)
  const addPanelToEmptyLayout = useLayoutStore(state => state.addPanelToEmptyLayout)

  const availableViews = panelRegistry.getAll()

  const descriptions: Record<string, string> = {
    Scene: '3D simulation viewport. Displays point clouds, TF frames, robots, sensor telemetry, and obstacle vectors in coordinate axes.',
    Plot: 'Diagnostics charting tool. Plot numeric messages, velocity changes, motor currents, and hardware topics over time.',
    Map: 'Path planner telemetry. Renders GPS trajectories, waypoints, obstacles, and localized robot markers on a 2D grid.',
    RawData: 'Raw message payload inspector. Decodes and displays serialized ROS CDR, JSON, or ROS1msg byte buffers at the current timeline playhead.',
  }

  return (
    <div className="w-full h-full min-h-0 relative overflow-hidden bg-workbench">
      {layoutTree
        ? (
            <LayoutRenderer node={layoutTree} />
          )
        : (
            <div className="w-full h-full flex flex-col items-center justify-center p-8 overflow-y-auto bg-workbench text-text-main select-none font-sans">
              <div className="max-w-2xl w-full text-center space-y-6 animate-fade-in">
                <div className="space-y-2">
                  <h2 className="text-base font-bold tracking-tight bg-linear-to-r from-layout-primary to-blue-400 bg-clip-text text-transparent">
                    Layout Workspace is Empty
                  </h2>
                  <p className="text-xs text-text-secondary max-w-md mx-auto">
                    No active panels are currently displayed. Add a view below to start visualising your telemetry.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
                  {availableViews.map((panel) => {
                    const Icon = panel.icon
                    return (
                      <div
                        key={panel.type}
                        className="p-4 rounded-none bg-panel border border-layout-border hover:border-layout-primary/30 hover:bg-layout-hover transition-all duration-300 flex flex-col justify-between group relative overflow-hidden shadow-xs"
                      >
                        {/* Subtle glass glow on hover */}
                        <div className="absolute inset-0 bg-linear-to-r from-layout-primary/5 to-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

                        <div className="space-y-2 relative z-10">
                          <div className="flex items-center gap-2.5">
                            <div className="p-2 rounded-none bg-layout-hover text-layout-primary border border-layout-border group-hover:scale-105 transition-transform duration-300">
                              {Icon && <Icon size={16} />}
                            </div>
                            <span className="font-semibold text-[11px] tracking-wide">
                              {panel.title}
                            </span>
                          </div>
                          <p className="text-[10px] text-text-secondary leading-relaxed">
                            {descriptions[panel.type] || 'Visualize workspace telemetry.'}
                          </p>
                        </div>

                        <div className="mt-4 pt-3 border-t border-layout-border/40 flex justify-end relative z-10">
                          <Button
                            variant="secondary"
                            size="xs"
                            onClick={() => addPanelToEmptyLayout(panel.type, panel.title)}
                            className="cursor-pointer text-[10px] gap-1 px-2.5 py-1 bg-layout-hover hover:bg-layout-active border border-layout-border group-hover:border-layout-primary/30 group-hover:text-layout-primary transition-all duration-300"
                          >
                            <PlusIcon size={10} />
                            Add Panel
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
    </div>
  )
}
