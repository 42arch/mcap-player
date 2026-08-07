import type { MapPanelConfig, PanelSettingsProps } from '@/panels/core/types'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { usePlayerStore } from '@/stores/use-player-store'
import { HelpTooltip } from '../help-tooltip'
import { SettingGroup } from '../setting-group'
import { DEFAULT_OSM_STYLE_URL } from './map-style'

export default function MapSetting({ config, updateConfig }: PanelSettingsProps<MapPanelConfig>) {
  const channels = usePlayerStore(state => state.fileSummary?.channels || [])
  const geoJsonTopics = channels
    .filter((channel) => {
      const schema = (channel.schemaName || '').toLowerCase()
      return schema === 'foxglove.geojson'
        || schema === 'foxglove_msgs/geojson'
        || schema === 'foxglove_msgs/msg/geojson'
    })

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background text-foreground">
      <div className="flex-1 overflow-y-auto">
        <SettingGroup title="Map Style" defaultOpen>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center">
              Style source
              <HelpTooltip content="Use osm://default for OpenStreetMap XYZ tiles, or enter a custom MapLibre Style JSON URL." />
            </label>
            <input
              value={config.styleUrl}
              onChange={event => updateConfig({ styleUrl: event.target.value })}
              className="h-8 w-full rounded border border-border bg-background px-2 text-[10px] font-mono outline-none focus:border-primary"
              placeholder={DEFAULT_OSM_STYLE_URL}
            />
          </div>
        </SettingGroup>

        <SettingGroup title="History" defaultOpen>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Time Range</label>
            <Select
              value={config.historyMode}
              onValueChange={value => updateConfig({ historyMode: value as MapPanelConfig['historyMode'] })}
            >
              <SelectTrigger className="h-8 w-full bg-background text-[11px]">
                <span>{config.historyMode === 'all-previous' ? 'All previous' : config.historyMode === 'last-n-seconds' ? 'Last N seconds' : config.historyMode === 'latest' ? 'Latest' : 'All'}</span>
              </SelectTrigger>
              <SelectContent position="popper" className="bg-popover text-popover-foreground">
                <SelectItem value="latest" className="text-[11px]">Latest</SelectItem>
                <SelectItem value="all-previous" className="text-[11px]">All previous</SelectItem>
                <SelectItem value="last-n-seconds" className="text-[11px]">Last N seconds</SelectItem>
                <SelectItem value="all" className="text-[11px]">All</SelectItem>
              </SelectContent>
            </Select>
            {config.historyMode === 'last-n-seconds' && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>Seconds</span>
                  <span className="font-mono text-primary">
                    {config.historySeconds}
                    s
                  </span>
                </div>
                <Slider
                  value={[config.historySeconds]}
                  min={1}
                  max={300}
                  step={1}
                  onValueChange={value => updateConfig({ historySeconds: value[0] })}
                />
              </div>
            )}
          </div>
        </SettingGroup>

        <SettingGroup title="Location Point" defaultOpen>
          <div className="space-y-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>Point size</span>
                <span className="font-mono text-primary">
                  {config.pointSize}
                  px
                </span>
              </div>
              <Slider
                value={[config.pointSize]}
                min={3}
                max={16}
                step={1}
                onValueChange={value => updateConfig({ pointSize: value[0] })}
              />
            </div>
            <label className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <input type="checkbox" checked={config.showHeading} onChange={event => updateConfig({ showHeading: event.target.checked })} />
              Show heading
            </label>
            <label className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <input type="checkbox" checked={config.showVelocity} onChange={event => updateConfig({ showVelocity: event.target.checked })} />
              Show velocity
            </label>
            <label className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <input type="checkbox" checked={config.followMode === 'follow'} onChange={event => updateConfig({ followMode: event.target.checked ? 'follow' : 'free' })} />
              Follow current position
            </label>
          </div>
        </SettingGroup>

        <SettingGroup title="Track" defaultOpen>
          <div className="space-y-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>Line width</span>
                <span className="font-mono text-primary">
                  {config.trackWidth}
                  px
                </span>
              </div>
              <Slider
                value={[config.trackWidth]}
                min={1}
                max={8}
                step={1}
                onValueChange={value => updateConfig({ trackWidth: value[0] })}
              />
            </div>
            <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
              <span>Track color</span>
              <input type="color" value={config.trackColor} onChange={event => updateConfig({ trackColor: event.target.value })} className="size-6 cursor-pointer rounded border border-border bg-transparent" />
            </div>
          </div>
        </SettingGroup>

        {geoJsonTopics.length > 0 && (
          <SettingGroup title="GeoJSON Topics" defaultOpen>
            <div className="space-y-2">
              {geoJsonTopics.map((channel) => {
                const enabled = config.visibleGeoJsonTopics[channel.topic] !== false
                return (
                  <label key={channel.id} className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={event => updateConfig({ visibleGeoJsonTopics: { ...config.visibleGeoJsonTopics, [channel.topic]: event.target.checked } })}
                    />
                    <span className="truncate font-mono">{channel.topic}</span>
                  </label>
                )
              })}
            </div>
          </SettingGroup>
        )}
      </div>
    </div>
  )
}
