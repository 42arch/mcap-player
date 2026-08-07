import type { Map as MapLibreMap } from 'maplibre-gl'
import type { MapPanelConfig, PanelComponentProps } from '@/panels/core/types'
import { LocateFixed, Maximize2, Navigation, RotateCcw } from 'lucide-react'
import { Map as MapLibreMapConstructor, NavigationControl, ScaleControl } from 'maplibre-gl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { subscribePlaybackTime } from '@/core/playback-time-store'
import { scheduleFrame } from '@/core/raf-scheduler'
import { cn } from '@/lib/utils'
import { PanelContentHeader } from '@/panels/builtins/panel-content-header'
import { usePanelConfig } from '@/panels/core/panel-context'
import { globalMessagePipeline } from '@/panels/runtime/message-pipeline'
import { usePlayerStore } from '@/stores/use-player-store'
import { adaptGeoJsonMessage, adaptLocationMessage, isGeoJsonChannel, isLocationChannel } from './map-adapters'
import { MapDataStore } from './map-data-store'
import { MapLayerManager } from './map-layer-manager'
import { resolveMapStyle } from './map-style'

import 'maplibre-gl/dist/maplibre-gl.css'

function formatCoordinate(value: number | undefined, positive: string, negative: string) {
  if (value === undefined) {
    return '--'
  }
  return `${Math.abs(value).toFixed(5)}°${value >= 0 ? positive : negative}`
}

export default function MapPanel({ panelId }: PanelComponentProps<MapPanelConfig>) {
  const fileSummary = usePlayerStore(state => state.fileSummary)
  const [config, updateConfig] = usePanelConfig<MapPanelConfig>()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const managerRef = useRef<MapLayerManager | null>(null)
  const dataStoreRef = useRef(new MapDataStore())
  const configRef = useRef(config)
  const currentTimeRef = useRef(0n)
  const flushCancelRef = useRef<(() => void) | null>(null)
  const [mapStatus, setMapStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [mapError, setMapError] = useState<string | null>(null)
  const [hasData, setHasData] = useState(false)

  configRef.current = config
  const channels = useMemo(() => fileSummary?.channels || [], [fileSummary?.channels])
  const locationChannels = useMemo(() => channels.filter(isLocationChannel), [channels])
  const geoJsonChannels = useMemo(() => channels.filter(isGeoJsonChannel), [channels])
  const activePositionTopic = config.positionTopic && locationChannels.some(channel => channel.topic === config.positionTopic)
    ? config.positionTopic
    : locationChannels[0]?.topic || null

  const scheduleFlush = useCallback(() => {
    if (flushCancelRef.current) {
      return
    }
    flushCancelRef.current = scheduleFrame(() => {
      flushCancelRef.current = null
      const manager = managerRef.current
      const summary = usePlayerStore.getState().fileSummary
      if (!manager || !summary) {
        return
      }
      const store = dataStoreRef.current
      const current = store.getCurrentLocation()
      manager.update(
        store.getLocations(),
        current,
        store.getGeoJson(),
        configRef.current,
        currentTimeRef.current,
        summary.startNs,
      )
      manager.follow(current, configRef.current.followMode === 'follow')
      setHasData(Boolean(current || store.getGeoJson().features.length > 0))
    })
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const map = new MapLibreMapConstructor({
      container,
      style: resolveMapStyle(config.styleUrl),
      center: [0, 0],
      zoom: 1,
      attributionControl: { compact: false },
      dragRotate: false,
    })
    mapRef.current = map
    const manager = new MapLayerManager(map)
    managerRef.current = manager
    let mapLoaded = false
    setMapStatus('loading')
    setMapError(null)

    const onLoad = () => {
      mapLoaded = true
      manager.initialize(configRef.current)
      setMapStatus('ready')
      scheduleFlush()
    }
    const onError = (event: { error?: Error }) => {
      if (mapLoaded) {
        console.warn('Map tile or resource failed to load:', event.error)
        return
      }
      const message = event.error?.message || 'Failed to load map style or tiles.'
      setMapError(message)
      setMapStatus('error')
    }
    map.once('load', onLoad)
    map.on('error', onError)
    map.addControl(new NavigationControl({ showCompass: true }), 'top-right')
    map.addControl(new ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-left')

    const resizeObserver = new ResizeObserver(() => map.resize())
    resizeObserver.observe(container)

    return () => {
      if (flushCancelRef.current) {
        flushCancelRef.current()
        flushCancelRef.current = null
      }
      resizeObserver.disconnect()
      map.remove()
      mapRef.current = null
      managerRef.current = null
    }
    // The style is intentionally a remount boundary: MapLibre styles are not mutated through React.
  }, [config.styleUrl, scheduleFlush])

  useEffect(() => {
    dataStoreRef.current.reset()
    managerRef.current?.resetCameraState()
    setHasData(false)
    if (!activePositionTopic && geoJsonChannels.length === 0) {
      return
    }

    const unsubscribers: Array<() => void> = []
    unsubscribers.push(subscribePlaybackTime((elapsedNs) => {
      currentTimeRef.current = elapsedNs
      scheduleFlush()
    }))
    unsubscribers.push(globalMessagePipeline.subscribeSeek(panelId, () => {
      dataStoreRef.current.reset()
      managerRef.current?.resetCameraState()
      setHasData(false)
      scheduleFlush()
    }))

    if (activePositionTopic) {
      unsubscribers.push(globalMessagePipeline.subscribe({
        panelId,
        subscriptionId: 'map-location',
        topics: [{
          topic: activePositionTopic,
          mode: config.historyMode === 'latest' ? 'latest' : 'all',
          priority: 'normal',
        }],
      }, (message) => {
        const samples = adaptLocationMessage(message.payload, message)
        dataStoreRef.current.addLocations(samples, config.historyMode, config.maxTrackPoints)
        scheduleFlush()
      }))
    }

    for (const channel of geoJsonChannels) {
      if (config.visibleGeoJsonTopics[channel.topic] === false) {
        continue
      }
      unsubscribers.push(globalMessagePipeline.subscribe({
        panelId,
        subscriptionId: `map-geojson:${channel.topic}`,
        topics: [{ topic: channel.topic, mode: 'latest' }],
      }, (message) => {
        const collection = adaptGeoJsonMessage(message.payload)
        if (collection) {
          dataStoreRef.current.setGeoJson(channel.topic, collection)
          scheduleFlush()
        }
      }))
    }

    return () => {
      unsubscribers.forEach(unsubscribe => unsubscribe())
      if (flushCancelRef.current) {
        flushCancelRef.current()
        flushCancelRef.current = null
      }
    }
  }, [activePositionTopic, config.historyMode, config.maxTrackPoints, config.visibleGeoJsonTopics, geoJsonChannels, panelId, scheduleFlush])

  useEffect(() => {
    managerRef.current?.setPaint(config)
    scheduleFlush()
  }, [config, config.pointSize, config.showHeading, config.showVelocity, config.trackColor, config.trackWidth, scheduleFlush])

  const fitToData = () => {
    managerRef.current?.fitToLocations(dataStoreRef.current.getLocations())
  }

  const current = dataStoreRef.current.getCurrentLocation()
  const canShowMap = mapStatus === 'ready'

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-card overflow-hidden">
      <PanelContentHeader
        actions={(
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="text-[9px] font-semibold tracking-wider uppercase text-muted-foreground shrink-0 hidden @[460px]:inline-block">
              Position
            </span>
            <Select
              value={activePositionTopic || ''}
              onValueChange={value => updateConfig({ positionTopic: value || null })}
            >
              <SelectTrigger size="sm" className="w-56 max-w-full @[460px]:w-56 @[340px]:w-40 bg-background border-border/80 text-[10px] h-6 py-0.5 px-2 font-mono">
                <SelectValue placeholder="Select GPS topic..." />
              </SelectTrigger>
              <SelectContent position="popper" className="bg-popover text-popover-foreground">
                {locationChannels.map(channel => (
                  <SelectItem key={channel.id} value={channel.topic} className="font-mono text-[10px] py-1 h-6 min-h-0">
                    {channel.topic}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              type="button"
              title={config.followMode === 'follow' ? 'Following current position' : 'Follow current position'}
              onClick={() => updateConfig({ followMode: config.followMode === 'follow' ? 'free' : 'follow' })}
              className={cn(
                'inline-flex size-6 items-center justify-center rounded border text-muted-foreground transition-colors',
                config.followMode === 'follow' ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border/80 hover:bg-muted',
              )}
            >
              <LocateFixed className="size-3.5" />
            </button>
            <button
              type="button"
              title="Fit trajectory"
              onClick={fitToData}
              className="inline-flex size-6 items-center justify-center rounded border border-border/80 text-muted-foreground hover:bg-muted"
            >
              <Maximize2 className="size-3.5" />
            </button>
          </div>
        )}
      />

      <div className="relative flex-1 min-h-0">
        <div
          ref={containerRef}
          className="absolute inset-0"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        />

        {mapStatus === 'loading' && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-background/80 text-muted-foreground backdrop-blur-sm">
            <div className="size-5 animate-spin rounded-full border-2 border-primary/25 border-t-primary" />
            <span className="text-xs">Loading map…</span>
          </div>
        )}
        {mapStatus === 'error' && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-background/90 p-8 text-center text-muted-foreground">
            <Navigation className="size-6 text-destructive" />
            <span className="text-xs font-semibold text-foreground">Map style unavailable</span>
            <span className="max-w-md text-[10px] leading-relaxed">{mapError}</span>
            <span className="text-[10px] text-muted-foreground/70">Set a reachable MapLibre style URL in panel settings.</span>
          </div>
        )}
        {canShowMap && !hasData && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center">
            <div className="rounded border border-border/70 bg-background/85 px-2.5 py-1.5 text-[10px] text-muted-foreground shadow-sm backdrop-blur-sm">
              Select a GPS topic and play the MCAP file to display location data.
            </div>
          </div>
        )}
        {canShowMap && current && (
          <div className="pointer-events-none absolute left-3 top-3 z-10 rounded border border-border/70 bg-background/85 px-2.5 py-1.5 font-mono text-[10px] text-foreground shadow-sm backdrop-blur-sm">
            {formatCoordinate(current.latitude, 'N', 'S')}
            {' '}
            {formatCoordinate(current.longitude, 'E', 'W')}
          </div>
        )}
        <button
          type="button"
          title="Reset north-up"
          onClick={() => mapRef.current?.resetNorth({ duration: 250 })}
          className="absolute bottom-3 right-3 z-10 inline-flex size-7 items-center justify-center rounded border border-border/70 bg-background/90 text-muted-foreground shadow-sm hover:bg-muted"
        >
          <RotateCcw className="size-3.5" />
        </button>
      </div>
    </div>
  )
}
