interface PanelSettingsProps {
  config: Record<string, any>
  onChange: (key: string, value: any) => void
}

export default function InspectorSettings({ config, onChange }: PanelSettingsProps) {
  const hexView = config.hexView ?? false
  const autoRefresh = config.autoRefresh ?? true
  const filterEmpty = config.filterEmpty ?? false

  return (
    <div className="space-y-2.5 font-sans">
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] text-text-secondary">Hexadecimal View</span>
        <input
          type="checkbox"
          checked={hexView}
          onChange={() => onChange('hexView', !hexView)}
          className="rounded-[2px] border-layout-border text-layout-primary focus:ring-layout-primary bg-panel cursor-pointer"
        />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] text-text-secondary">Auto-refresh Values</span>
        <input
          type="checkbox"
          checked={autoRefresh}
          onChange={() => onChange('autoRefresh', !autoRefresh)}
          className="rounded-[2px] border-layout-border text-layout-primary focus:ring-layout-primary bg-panel cursor-pointer"
        />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] text-text-secondary">Filter Empty Fields</span>
        <input
          type="checkbox"
          checked={filterEmpty}
          onChange={() => onChange('filterEmpty', !filterEmpty)}
          className="rounded-[2px] border-layout-border text-layout-primary focus:ring-layout-primary bg-panel cursor-pointer"
        />
      </div>
    </div>
  )
}
