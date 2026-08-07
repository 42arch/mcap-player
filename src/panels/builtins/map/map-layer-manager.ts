import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import type { MapGeoJsonCollection, MapLocationSample } from './map-types'
import type { MapPanelConfig } from '@/panels/core/types'
import { LngLatBounds } from 'maplibre-gl'

const SOURCE_IDS = {
  track: 'mcapview-map-track',
  current: 'mcapview-map-current',
  heading: 'mcapview-map-heading',
  velocity: 'mcapview-map-velocity',
  geoJson: 'mcapview-map-geojson',
} as const

const LAYER_IDS = {
  track: 'mcapview-map-track-line',
  historical: 'mcapview-map-historical-points',
  current: 'mcapview-map-current-point',
  heading: 'mcapview-map-heading-line',
  velocity: 'mcapview-map-velocity-line',
  geoJsonFill: 'mcapview-map-geojson-fill',
  geoJsonLine: 'mcapview-map-geojson-line',
  geoJsonPoint: 'mcapview-map-geojson-point',
} as const

const INITIAL_LOCATION_ZOOM = 15
const HISTORICAL_POINT_RADIUS_SCALE = 0.6
const MIN_HISTORICAL_POINT_RADIUS = 1.5

function historicalPointRadius(currentPointRadius: number) {
  return Math.max(MIN_HISTORICAL_POINT_RADIUS, currentPointRadius * HISTORICAL_POINT_RADIUS_SCALE)
}

function emptyCollection() {
  return { type: 'FeatureCollection' as const, features: [] }
}

function source(map: MapLibreMap, id: string): GeoJSONSource | null {
  const value = map.getSource(id)
  return value && 'setData' in value ? value as GeoJSONSource : null
}

function locationPoint(sample: MapLocationSample) {
  return {
    type: 'Feature' as const,
    properties: {
      heading: sample.headingRad === undefined ? null : sample.headingRad * 180 / Math.PI,
      color: sample.color || null,
    },
    geometry: {
      type: 'Point' as const,
      coordinates: [sample.longitude, sample.latitude],
    },
  }
}

function lineFeature(coordinates: number[][]) {
  return {
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'LineString' as const, coordinates },
  }
}

function multiPointFeature(coordinates: number[][]) {
  return {
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'MultiPoint' as const, coordinates },
  }
}

function headingFeature(sample: MapLocationSample) {
  if (sample.headingRad === undefined) {
    return null
  }
  const length = 0.00008
  const north = Math.cos(sample.headingRad) * length
  const east = Math.sin(sample.headingRad) * length
  return lineFeature([
    [sample.longitude, sample.latitude],
    [sample.longitude + east, sample.latitude + north],
  ])
}

function velocityFeature(sample: MapLocationSample) {
  if (!sample.velocity) {
    return null
  }
  const speed = Math.hypot(sample.velocity.x, sample.velocity.y)
  if (speed < 0.001) {
    return null
  }
  const scale = 0.00005
  return lineFeature([
    [sample.longitude, sample.latitude],
    [
      sample.longitude + sample.velocity.x * scale,
      sample.latitude + sample.velocity.y * scale,
    ],
  ])
}

export class MapLayerManager {
  private isFollowing = false
  private lastFollowedCenter: [number, number] | null = null

  constructor(private readonly map: MapLibreMap) {}

  initialize(config: MapPanelConfig) {
    this.map.addSource(SOURCE_IDS.track, { type: 'geojson', data: emptyCollection() })
    this.map.addSource(SOURCE_IDS.current, { type: 'geojson', data: emptyCollection() })
    this.map.addSource(SOURCE_IDS.heading, { type: 'geojson', data: emptyCollection() })
    this.map.addSource(SOURCE_IDS.velocity, { type: 'geojson', data: emptyCollection() })
    this.map.addSource(SOURCE_IDS.geoJson, { type: 'geojson', data: emptyCollection() })

    this.map.addLayer({
      id: LAYER_IDS.track,
      type: 'line',
      source: SOURCE_IDS.track,
      paint: {
        'line-color': config.trackColor,
        'line-width': config.trackWidth,
        'line-opacity': 0.9,
      },
    })
    this.map.addLayer({
      id: LAYER_IDS.historical,
      type: 'circle',
      source: SOURCE_IDS.track,
      paint: {
        'circle-color': config.trackColor,
        'circle-radius': historicalPointRadius(config.pointSize),
        'circle-opacity': 0.8,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1,
      },
    })
    this.map.addLayer({
      id: LAYER_IDS.current,
      type: 'circle',
      source: SOURCE_IDS.current,
      paint: {
        'circle-color': ['coalesce', ['get', 'color'], config.customColor],
        'circle-radius': config.pointSize,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2,
      },
    })
    this.map.addLayer({
      id: LAYER_IDS.heading,
      type: 'line',
      source: SOURCE_IDS.heading,
      paint: {
        'line-color': config.customColor,
        'line-width': 2,
        'line-opacity': 0.85,
      },
    })
    this.map.addLayer({
      id: LAYER_IDS.velocity,
      type: 'line',
      source: SOURCE_IDS.velocity,
      paint: {
        'line-color': '#f59e0b',
        'line-width': 3,
        'line-opacity': 0.85,
        'line-dasharray': [1, 1],
      },
    })
    this.map.addLayer({
      id: LAYER_IDS.geoJsonFill,
      type: 'fill',
      source: SOURCE_IDS.geoJson,
      filter: ['==', '$type', 'Polygon'],
      paint: {
        'fill-color': ['coalesce', ['get', 'color'], '#f97316'],
        'fill-opacity': 0.2,
      },
    })
    this.map.addLayer({
      id: LAYER_IDS.geoJsonLine,
      type: 'line',
      source: SOURCE_IDS.geoJson,
      filter: ['==', '$type', 'LineString'],
      paint: {
        'line-color': ['coalesce', ['get', 'color'], '#f97316'],
        'line-width': 2,
      },
    })
    this.map.addLayer({
      id: LAYER_IDS.geoJsonPoint,
      type: 'circle',
      source: SOURCE_IDS.geoJson,
      filter: ['==', '$type', 'Point'],
      paint: {
        'circle-color': ['coalesce', ['get', 'color'], '#f97316'],
        'circle-radius': 5,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1,
      },
    })
  }

  update(
    locations: readonly MapLocationSample[],
    current: MapLocationSample | null,
    geoJson: MapGeoJsonCollection,
    config: MapPanelConfig,
    nowNs: bigint,
    startNs: bigint,
  ) {
    const visibleLocations = config.historyMode === 'last-n-seconds'
      ? locations.filter(sample => sample.logTimeNs >= startNs + nowNs - BigInt(config.historySeconds) * 1_000_000_000n)
      : locations
    const coordinates = visibleLocations.map(sample => [sample.longitude, sample.latitude])
    source(this.map, SOURCE_IDS.track)?.setData({
      type: 'FeatureCollection',
      features: [
        ...(coordinates.length > 1 ? [lineFeature(coordinates)] : []),
        ...(coordinates.length > 0 ? [multiPointFeature(coordinates)] : []),
      ],
    })
    source(this.map, SOURCE_IDS.current)?.setData({
      type: 'FeatureCollection',
      features: current ? [locationPoint(current)] : [],
    })
    const heading = config.showHeading && current ? headingFeature(current) : null
    source(this.map, SOURCE_IDS.heading)?.setData({
      type: 'FeatureCollection',
      features: heading ? [heading] : [],
    })
    const velocity = config.showVelocity && current ? velocityFeature(current) : null
    source(this.map, SOURCE_IDS.velocity)?.setData({
      type: 'FeatureCollection',
      features: velocity ? [velocity] : [],
    })
    source(this.map, SOURCE_IDS.geoJson)?.setData(geoJson as any)
  }

  fitToLocations(locations: readonly MapLocationSample[]) {
    if (locations.length === 0) {
      return
    }
    const bounds = locations.reduce(
      (result, sample) => result.extend([sample.longitude, sample.latitude]),
      new LngLatBounds(),
    )
    this.map.fitBounds(bounds, { padding: 48, maxZoom: 17, duration: 350 })
  }

  follow(sample: MapLocationSample | null, enabled: boolean) {
    if (!enabled) {
      this.resetCameraState()
      return
    }
    if (!sample) {
      return
    }
    const center: [number, number] = [sample.longitude, sample.latitude]
    if (!this.isFollowing) {
      this.isFollowing = true
      this.lastFollowedCenter = center
      this.map.easeTo({
        center,
        zoom: Math.max(this.map.getZoom(), INITIAL_LOCATION_ZOOM),
        duration: 350,
      })
      return
    }

    if (
      this.lastFollowedCenter?.[0] === center[0]
      && this.lastFollowedCenter[1] === center[1]
    ) {
      return
    }
    this.lastFollowedCenter = center
    this.map.easeTo({ center, duration: 0 })
  }

  resetCameraState() {
    this.isFollowing = false
    this.lastFollowedCenter = null
  }

  setPaint(config: MapPanelConfig) {
    if (this.map.getLayer(LAYER_IDS.track)) {
      this.map.setPaintProperty(LAYER_IDS.track, 'line-color', config.trackColor)
      this.map.setPaintProperty(LAYER_IDS.track, 'line-width', config.trackWidth)
      this.map.setPaintProperty(LAYER_IDS.historical, 'circle-color', config.trackColor)
      this.map.setPaintProperty(LAYER_IDS.historical, 'circle-radius', historicalPointRadius(config.pointSize))
      this.map.setPaintProperty(LAYER_IDS.current, 'circle-radius', config.pointSize)
    }
  }
}
