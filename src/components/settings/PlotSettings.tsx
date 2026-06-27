interface PanelSettingsProps {
  config: Record<string, any>
  onChange: (key: string, value: any) => void
}

export default function PlotSettings({ config, onChange }: PanelSettingsProps) {
  const enableAntialiasing = config.enableAntialiasing ?? true
  const syncXScale = config.syncXScale ?? true
  const showLegend = config.showLegend ?? true
  const lineStyle = config.lineStyle ?? 'Smooth Spline'

  return (
    <div className="space-y-2.5 font-sans">
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] text-text-secondary">Enable Anti-aliasing</span>
        <input
          type="checkbox"
          checked={enableAntialiasing}
          onChange={() => onChange('enableAntialiasing', !enableAntialiasing)}
          className="rounded-[2px] border-layout-border text-layout-primary focus:ring-layout-primary bg-panel cursor-pointer"
        />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] text-text-secondary">Sync X-Axis Scale</span>
        <input
          type="checkbox"
          checked={syncXScale}
          onChange={() => onChange('syncXScale', !syncXScale)}
          className="rounded-[2px] border-layout-border text-layout-primary focus:ring-layout-primary bg-panel cursor-pointer"
        />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] text-text-secondary">Show Legend Overlay</span>
        <input
          type="checkbox"
          checked={showLegend}
          onChange={() => onChange('showLegend', !showLegend)}
          className="rounded-[2px] border-layout-border text-layout-primary focus:ring-layout-primary bg-panel cursor-pointer"
        />
      </div>
      <div className="space-y-1">
        <span className="text-[9.5px] text-text-secondary block">Line Rendering Style</span>
        <select
          value={lineStyle}
          onChange={e => onChange('lineStyle', e.target.value)}
          className="w-full bg-panel text-[10.5px] border border-layout-border rounded-[2px] px-2 py-0.5 outline-none text-text-main cursor-pointer"
        >
          <option>Smooth Spline</option>
          <option>Linear Segment</option>
          <option>Step Function</option>
        </select>
      </div>
    </div>
  )
}
