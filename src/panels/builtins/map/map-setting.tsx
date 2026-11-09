import type { MapPanelConfig, PanelSettingsProps } from '@/panels/core/types'
import { FormattedMessage, useIntl } from 'react-intl'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { usePlayerStore } from '@/stores/use-player-store'
import { HelpTooltip } from '../help-tooltip'
import { SettingGroup } from '../setting-group'
import { isLocationChannel } from './map-adapters'
import { DEFAULT_OSM_STYLE_URL } from './map-style'

export default function MapSetting({ panelId, config, updateConfig }: PanelSettingsProps<MapPanelConfig>) {
  const intl = useIntl()
  const channels = usePlayerStore(state => state.fileSummary?.channels || [])
  const locationTopics = channels.filter(isLocationChannel)
  const activePositionTopic = config.positionTopic && locationTopics.some(channel => channel.topic === config.positionTopic)
    ? config.positionTopic
    : locationTopics[0]?.topic || ''
  const positionTopicId = `map-position-topic-${panelId}`
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
        <SettingGroup
          title={intl.formatMessage({ id: 'panel.map.position', defaultMessage: 'Position' })}
          defaultOpen
        >
          <div className="flex flex-col gap-2">
            <label htmlFor={positionTopicId} className="flex items-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <FormattedMessage id="panel.map.positionTopic" defaultMessage="Position topic" />
              <HelpTooltip content={intl.formatMessage({ id: 'panel.map.positionTopicTooltip', defaultMessage: 'Select the GPS or location topic used for the current position and trajectory.' })} />
            </label>
            <Select
              value={activePositionTopic}
              onValueChange={value => updateConfig({ positionTopic: value || null })}
              disabled={locationTopics.length === 0}
            >
              <SelectTrigger id={positionTopicId} className="h-8 w-full bg-background font-mono text-[11px]">
                <SelectValue placeholder={locationTopics.length === 0
                  ? intl.formatMessage({ id: 'panel.map.noLocationTopics', defaultMessage: 'No compatible position topics' })
                  : intl.formatMessage({ id: 'panel.map.selectLocationTopic', defaultMessage: 'Select a position topic' })}
                />
              </SelectTrigger>
              <SelectContent position="popper" className="bg-popover text-popover-foreground">
                <SelectGroup>
                  {locationTopics.map(channel => (
                    <SelectItem key={channel.id} value={channel.topic} className="font-mono text-[10px]">
                      {channel.topic}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </SettingGroup>

        <SettingGroup
          title={intl.formatMessage({ id: 'panel.map.mapStyle', defaultMessage: 'Map Style' })}
          defaultOpen
        >
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center">
              <FormattedMessage id="panel.map.styleSource" defaultMessage="Style source" />
              <HelpTooltip content={intl.formatMessage({ id: 'panel.map.styleSourceTooltip', defaultMessage: 'Use osm://default for OpenStreetMap XYZ tiles, or enter a custom MapLibre Style JSON URL.' })} />
            </label>
            <input
              value={config.styleUrl}
              onChange={event => updateConfig({ styleUrl: event.target.value })}
              className="h-8 w-full rounded border border-border bg-background px-2 text-[10px] font-mono outline-none focus:border-primary"
              placeholder={DEFAULT_OSM_STYLE_URL}
            />
          </div>
        </SettingGroup>

        <SettingGroup
          title={intl.formatMessage({ id: 'panel.map.history', defaultMessage: 'History' })}
          defaultOpen
        >
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              <FormattedMessage id="panel.map.timeRange" defaultMessage="Time Range" />
            </label>
            <Select
              value={config.historyMode}
              onValueChange={value => updateConfig({ historyMode: value as MapPanelConfig['historyMode'] })}
            >
              <SelectTrigger className="h-8 w-full bg-background text-[11px]">
                <span>
                  {config.historyMode === 'all-previous'
                    ? intl.formatMessage({ id: 'panel.map.historyAllPrevious', defaultMessage: 'All previous' })
                    : config.historyMode === 'last-n-seconds'
                      ? intl.formatMessage({ id: 'panel.map.historyLastNSeconds', defaultMessage: 'Last N seconds' })
                      : config.historyMode === 'latest'
                        ? intl.formatMessage({ id: 'panel.map.historyLatest', defaultMessage: 'Latest' })
                        : intl.formatMessage({ id: 'panel.map.historyAll', defaultMessage: 'All' })}
                </span>
              </SelectTrigger>
              <SelectContent position="popper" className="bg-popover text-popover-foreground">
                <SelectGroup>
                  <SelectItem value="latest" className="text-[11px]">
                    <FormattedMessage id="panel.map.historyLatest" defaultMessage="Latest" />
                  </SelectItem>
                  <SelectItem value="all-previous" className="text-[11px]">
                    <FormattedMessage id="panel.map.historyAllPrevious" defaultMessage="All previous" />
                  </SelectItem>
                  <SelectItem value="last-n-seconds" className="text-[11px]">
                    <FormattedMessage id="panel.map.historyLastNSeconds" defaultMessage="Last N seconds" />
                  </SelectItem>
                  <SelectItem value="all" className="text-[11px]">
                    <FormattedMessage id="panel.map.historyAll" defaultMessage="All" />
                  </SelectItem>
                </SelectGroup>
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

        <SettingGroup
          title={intl.formatMessage({ id: 'panel.map.locationPoint', defaultMessage: 'Location Point' })}
          defaultOpen
        >
          <div className="space-y-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>
                  <FormattedMessage id="panel.map.pointSize" defaultMessage="Point size" />
                </span>
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
              <FormattedMessage id="panel.map.showHeading" defaultMessage="Show heading" />
            </label>
            <label className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <input type="checkbox" checked={config.showVelocity} onChange={event => updateConfig({ showVelocity: event.target.checked })} />
              <FormattedMessage id="panel.map.showVelocity" defaultMessage="Show velocity" />
            </label>
            <label className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <input type="checkbox" checked={config.followMode === 'follow'} onChange={event => updateConfig({ followMode: event.target.checked ? 'follow' : 'free' })} />
              <FormattedMessage id="panel.map.followCurrent" defaultMessage="Follow current position" />
            </label>
          </div>
        </SettingGroup>

        <SettingGroup
          title={intl.formatMessage({ id: 'panel.map.track', defaultMessage: 'Track' })}
          defaultOpen
        >
          <div className="space-y-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>
                  <FormattedMessage id="panel.map.lineWidth" defaultMessage="Line width" />
                </span>
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
              <span>
                <FormattedMessage id="panel.map.trackColor" defaultMessage="Track color" />
              </span>
              <input type="color" value={config.trackColor} onChange={event => updateConfig({ trackColor: event.target.value })} className="size-6 cursor-pointer rounded border border-border bg-transparent" />
            </div>
          </div>
        </SettingGroup>

        {geoJsonTopics.length > 0 && (
          <SettingGroup
            title={intl.formatMessage({ id: 'panel.map.geoJsonTopics', defaultMessage: 'GeoJSON Topics' })}
            defaultOpen
          >
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
