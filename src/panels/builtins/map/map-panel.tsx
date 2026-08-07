import type { Map as MapLibreMap } from 'maplibre-gl'
import type { MapPanelConfig, PanelComponentProps } from '@/panels/core/types'
import { Compass, LocateFixed, Maximize2, Minus, Navigation, Plus } from 'lucide-react'
import { Map as MapLibreMapConstructor, ScaleControl } from 'maplibre-gl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { subscribePlaybackTime } from '@/core/playback-time-store'
import { scheduleFrame } from '@/core/raf-scheduler'
import { cn } from '@/lib/utils'
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

  const toggleFollow = useCallback(() => {
    updateConfig({ followMode: configRef.current.followMode === 'follow' ? 'free' : 'follow' })
  }, [updateConfig])

  const fitToData = useCallback(() => {
    managerRef.current?.fitToLocations(dataStoreRef.current.getLocations())
  }, [])

  const zoomIn = useCallback(() => {
    mapRef.current?.zoomIn({ duration: 250 })
  }, [])

  const zoomOut = useCallback(() => {
    mapRef.current?.zoomOut({ duration: 250 })
  }, [])

  const resetNorth = useCallback(() => {
    mapRef.current?.resetNorth({ duration: 250 })
  }, [])

  const current = dataStoreRef.current.getCurrentLocation()
  const canShowMap = mapStatus === 'ready'

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-card overflow-hidden">
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
        {canShowMap && (
          <div className="absolute right-3 top-3 z-10 flex flex-col items-end gap-2">
            <div className="flex items-center gap-1" role="group" aria-label="Map view controls">
              <Button
                type="button"
                variant="outline"
                size="icon"
                title={config.followMode === 'follow' ? 'Stop following current position' : 'Follow current position'}
                aria-label={config.followMode === 'follow' ? 'Stop following current position' : 'Follow current position'}
                aria-pressed={config.followMode === 'follow'}
                onClick={toggleFollow}
                className={cn(
                  'bg-background/90 shadow-sm backdrop-blur-sm',
                  config.followMode === 'follow' && 'border-primary/50 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary',
                )}
              >
                <LocateFixed />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                title="Fit trajectory"
                aria-label="Fit trajectory"
                onClick={fitToData}
                className="bg-background/90 shadow-sm backdrop-blur-sm"
              >
                <Maximize2 />
              </Button>
            </div>

            <div className="flex flex-col gap-1" role="group" aria-label="Map navigation controls">
              <Button
                type="button"
                variant="outline"
                size="icon"
                title="Zoom in"
                aria-label="Zoom in"
                onClick={zoomIn}
                className="bg-background/90 shadow-sm backdrop-blur-sm"
              >
                <Plus />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                title="Zoom out"
                aria-label="Zoom out"
                onClick={zoomOut}
                className="bg-background/90 shadow-sm backdrop-blur-sm"
              >
                <Minus />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                title="Reset north-up"
                aria-label="Reset north-up"
                onClick={resetNorth}
                className="bg-background/90 shadow-sm backdrop-blur-sm"
              >
                <Compass />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
