interface PanelSettingsProps {
  config: Record<string, any>
  onChange: (key: string, value: any) => void
}

export default function MapSettings({ config, onChange }: PanelSettingsProps) {
  const followVehicle = config.followVehicle ?? true
  const showWaypoints = config.showWaypoints ?? true
  const mapSource = config.mapSource ?? 'OpenStreetMap (Default)'

  return (
    <div className="space-y-2.5 font-sans">
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] text-text-secondary">Follow Vehicle Position</span>
        <input
          type="checkbox"
          checked={followVehicle}
          onChange={() => onChange('followVehicle', !followVehicle)}
          className="rounded-[2px] border-layout-border text-layout-primary focus:ring-layout-primary bg-panel cursor-pointer"
        />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] text-text-secondary">Show Waypoints Path</span>
        <input
          type="checkbox"
          checked={showWaypoints}
          onChange={() => onChange('showWaypoints', !showWaypoints)}
          className="rounded-[2px] border-layout-border text-layout-primary focus:ring-layout-primary bg-panel cursor-pointer"
        />
      </div>
      <div className="space-y-1">
        <span className="text-[9.5px] text-text-secondary block">Map Source</span>
        <select
          value={mapSource}
          onChange={e => onChange('mapSource', e.target.value)}
          className="w-full bg-panel text-[10.5px] border border-layout-border rounded-[2px] px-2 py-0.5 outline-none text-text-main cursor-pointer"
        >
          <option>OpenStreetMap (Default)</option>
          <option>Mapbox Satellite</option>
          <option>Offline Grid Layout</option>
        </select>
      </div>
    </div>
  )
}
