import {
  ChartLineIcon,
  CubeIcon,
  InfoIcon,
  MapTrifoldIcon,
} from '@phosphor-icons/react'
import InspectorSettings from '@/components/settings/InspectorSettings'
import MapSettings from '@/components/settings/MapSettings'
import PlotSettings from '@/components/settings/PlotSettings'
import SceneSettings from '@/components/settings/SceneSettings'
import { findNodeById } from '@/lib/layout/engine'
import { useLayoutStore } from '@/stores/layout'

export default function SettingsTab() {
  const layoutTree = useLayoutStore(state => state.layoutTree)
  const activePanelId = useLayoutStore(state => state.activePanelId)
  const activePanelType = useLayoutStore(state => state.activePanelType)
  const updateTabConfig = useLayoutStore(state => state.updateTabConfig)

  // Find the active panel and active tab node in the layout tree
  const activePanelNode = layoutTree && activePanelId ? findNodeById(layoutTree, activePanelId) : null
  const activeTab = activePanelNode && activePanelNode.type === 'panel'
    ? activePanelNode.tabs.find(t => t.id === activePanelNode.activeTabId) || activePanelNode.tabs[0]
    : null

  const tabConfig = activeTab?.config || {}

  const handleSettingChange = (key: string, value: any) => {
    if (activePanelId && activeTab) {
      updateTabConfig(activePanelId, activeTab.id, { [key]: value })
    }
  }

  return (
    <div className="p-3 space-y-4">
      {/* Workspace Preferences Section */}
      <div className="space-y-3">
        <div className="text-[10px] text-text-secondary font-medium tracking-wide uppercase border-b border-layout-border/40 pb-1 font-sans">
          Workspace Preferences:
        </div>
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-text-main font-sans">Timeline Auto-scroll</span>
            <input type="checkbox" defaultChecked className="rounded-[2px] border-layout-border text-layout-primary focus:ring-layout-primary bg-panel" />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-text-main font-sans">Show Grid Helpers</span>
            <input type="checkbox" defaultChecked className="rounded-[2px] border-layout-border text-layout-primary focus:ring-layout-primary bg-panel" />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-text-main font-sans">Performance Mode</span>
            <input type="checkbox" className="rounded-[2px] border-layout-border text-layout-primary focus:ring-layout-primary bg-panel" />
          </div>
          <div className="space-y-1">
            <span className="text-[10px] text-text-secondary block font-sans">Frame Rate Cap</span>
            <select className="w-full bg-panel text-[11px] border border-layout-border rounded-[2px] px-2 py-1 outline-none text-text-main font-sans">
              <option>60 FPS</option>
              <option>30 FPS</option>
              <option>15 FPS</option>
            </select>
          </div>
        </div>
      </div>

      {/* Active Panel Settings Section */}
      <div className="space-y-3 pt-2">
        <div className="text-[10px] text-text-secondary font-medium tracking-wide uppercase border-b border-layout-border/40 pb-1 font-sans">
          Active Panel Settings:
        </div>

        {!activePanelId || !activeTab
          ? (
              <div className="text-[10.5px] text-text-secondary italic text-center py-4 bg-layout-hover/20 border border-dashed border-layout-border/60 rounded-[2px] font-sans">
                Click a panel in the workspace to customize its settings.
              </div>
            )
          : (
              <div className="p-2.5 bg-panel border border-layout-border rounded-[2px] space-y-3">
                {/* Header info */}
                <div className="flex items-center gap-1.5 border-b border-layout-border/40 pb-2">
                  <div className="text-layout-primary">
                    {activePanelType === 'Scene' && <CubeIcon size={13} />}
                    {activePanelType === 'Plot' && <ChartLineIcon size={13} />}
                    {activePanelType === 'Map' && <MapTrifoldIcon size={13} />}
                    {activePanelType === 'Inspector' && <InfoIcon size={13} />}
                  </div>
                  <span className="text-[11px] font-bold text-text-main font-sans">
                    {activePanelType}
                    {' '}
                    Panel Options
                  </span>
                </div>

                {/* Custom panel configurations */}
                {activePanelType === 'Scene' && (
                  <SceneSettings config={tabConfig} onChange={handleSettingChange} />
                )}

                {activePanelType === 'Plot' && (
                  <PlotSettings config={tabConfig} onChange={handleSettingChange} />
                )}

                {activePanelType === 'Map' && (
                  <MapSettings config={tabConfig} onChange={handleSettingChange} />
                )}

                {activePanelType === 'Inspector' && (
                  <InspectorSettings config={tabConfig} onChange={handleSettingChange} />
                )}
              </div>
            )}
      </div>
    </div>
  )
}
