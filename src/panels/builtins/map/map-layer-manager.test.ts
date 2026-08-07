import type { Map as MapLibreMap } from 'maplibre-gl'
import type { MapLocationSample } from './map-types'
import type { MapPanelConfig } from '@/panels/core/types'
import { describe, expect, it, vi } from 'vitest'
import { MapLayerManager } from './map-layer-manager'

const config: MapPanelConfig = {
  styleUrl: 'osm://default',
  positionTopic: '/gps',
  visibleGeoJsonTopics: {},
  historyMode: 'all-previous',
  historySeconds: 30,
  pointStyle: 'arrow',
  showHeading: true,
  showVelocity: true,
  pointSize: 7,
  colorMode: 'automatic',
  customColor: '#2563eb',
  trackColor: '#2563eb',
  trackWidth: 3,
  followMode: 'follow',
  maxTrackPoints: 50000,
}

function location(longitude: number, latitude: number): MapLocationSample {
  return {
    logTimeNs: 0n,
    longitude,
    latitude,
  }
}

function createMap(zoom = 1) {
  const easeTo = vi.fn()
  const map = {
    easeTo,
    getZoom: vi.fn(() => zoom),
  } as unknown as MapLibreMap

  return { easeTo, manager: new MapLayerManager(map) }
}

describe('map layer manager camera following', () => {
  it('zooms to the first current location and follows later movement', () => {
    const { easeTo, manager } = createMap()

    manager.follow(location(121.4737, 31.2304), true)
    manager.follow(location(121.4741, 31.2308), true)

    expect(easeTo).toHaveBeenNthCalledWith(1, {
      center: [121.4737, 31.2304],
      zoom: 15,
      duration: 350,
    })
    expect(easeTo).toHaveBeenNthCalledWith(2, {
      center: [121.4741, 31.2308],
      duration: 0,
    })
  })

  it('does not issue redundant camera updates while the position is unchanged', () => {
    const { easeTo, manager } = createMap()
    const current = location(121.4737, 31.2304)

    manager.follow(current, true)
    manager.follow(current, true)

    expect(easeTo).toHaveBeenCalledTimes(1)
  })

  it('zooms back to the current location when following is re-enabled', () => {
    const { easeTo, manager } = createMap(10)
    const current = location(121.4737, 31.2304)

    manager.follow(current, true)
    manager.follow(current, false)
    manager.follow(current, true)

    expect(easeTo).toHaveBeenCalledTimes(2)
    expect(easeTo).toHaveBeenLastCalledWith({
      center: [121.4737, 31.2304],
      zoom: 15,
      duration: 350,
    })
  })

  it('preserves a closer zoom level when focusing the current location', () => {
    const { easeTo, manager } = createMap(17)

    manager.follow(location(121.4737, 31.2304), true)

    expect(easeTo).toHaveBeenCalledWith({
      center: [121.4737, 31.2304],
      zoom: 17,
      duration: 350,
    })
  })
})

describe('map layer manager history points', () => {
  it('renders traveled locations as smaller white-ringed points', () => {
    const addLayer = vi.fn()
    const trackSetData = vi.fn()
    const otherSetData = vi.fn()
    const map = {
      addLayer,
      addSource: vi.fn(),
      getSource: vi.fn((id: string) => id === 'mcapview-map-track'
        ? { setData: trackSetData }
        : { setData: otherSetData }),
    } as unknown as MapLibreMap
    const manager = new MapLayerManager(map)
    const locations = [
      location(121.4737, 31.2304),
      location(121.4741, 31.2308),
      location(121.4746, 31.2312),
    ]

    manager.initialize(config)
    manager.update(locations, locations.at(-1)!, { type: 'FeatureCollection', features: [] }, config, 0n, 0n)

    expect(addLayer).toHaveBeenCalledWith(expect.objectContaining({
      id: 'mcapview-map-historical-points',
      type: 'circle',
      paint: expect.objectContaining({
        'circle-radius': 4.2,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1,
      }),
    }))
    expect(trackSetData).toHaveBeenCalledWith(expect.objectContaining({
      features: [
        expect.objectContaining({
          geometry: {
            type: 'LineString',
            coordinates: locations.map(sample => [sample.longitude, sample.latitude]),
          },
        }),
        expect.objectContaining({
          geometry: {
            type: 'MultiPoint',
            coordinates: locations.map(sample => [sample.longitude, sample.latitude]),
          },
        }),
      ],
    }))
  })

  it('keeps history points smaller when the current point size changes', () => {
    const setPaintProperty = vi.fn()
    const map = {
      getLayer: vi.fn(() => true),
      setPaintProperty,
    } as unknown as MapLibreMap

    new MapLayerManager(map).setPaint({ ...config, pointSize: 10 })

    expect(setPaintProperty).toHaveBeenCalledWith('mcapview-map-historical-points', 'circle-radius', 6)
    expect(setPaintProperty).toHaveBeenCalledWith('mcapview-map-current-point', 'circle-radius', 10)
  })
})
