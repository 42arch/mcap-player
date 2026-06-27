interface PanelSettingsProps {
  config: Record<string, any>
  onChange: (key: string, value: any) => void
}

export default function SceneSettings({ config, onChange }: PanelSettingsProps) {
  const showTf = config.showTf ?? true
  const showGrid = config.showGrid ?? true
  const enableShadows = config.enableShadows ?? false
  const cameraMode = config.cameraMode ?? 'Perspective'

  return (
    <div className="space-y-2.5 font-sans">
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] text-text-secondary">Show TF Frames</span>
        <input
          type="checkbox"
          checked={showTf}
          onChange={() => onChange('showTf', !showTf)}
          className="rounded-[2px] border-layout-border text-layout-primary focus:ring-layout-primary bg-panel cursor-pointer"
        />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] text-text-secondary">Point Cloud Grid</span>
        <input
          type="checkbox"
          checked={showGrid}
          onChange={() => onChange('showGrid', !showGrid)}
          className="rounded-[2px] border-layout-border text-layout-primary focus:ring-layout-primary bg-panel cursor-pointer"
        />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] text-text-secondary">Enable Shadows</span>
        <input
          type="checkbox"
          checked={enableShadows}
          onChange={() => onChange('enableShadows', !enableShadows)}
          className="rounded-[2px] border-layout-border text-layout-primary focus:ring-layout-primary bg-panel cursor-pointer"
        />
      </div>
      <div className="space-y-1">
        <span className="text-[9.5px] text-text-secondary block">Camera Mode</span>
        <select
          value={cameraMode}
          onChange={e => onChange('cameraMode', e.target.value)}
          className="w-full bg-panel text-[10.5px] border border-layout-border rounded-[2px] px-2 py-0.5 outline-none text-text-main cursor-pointer"
        >
          <option>Perspective</option>
          <option>Orthographic</option>
          <option>Orbit</option>
        </select>
      </div>
    </div>
  )
}
