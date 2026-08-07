import type { PlaybackMessage } from '@/panels/runtime/message-pipeline'
import { describe, expect, it } from 'vitest'
import { adaptGeoJsonMessage, adaptLocationMessage, isGeoJsonChannel, isLocationChannel } from './map-adapters'

const message: PlaybackMessage = {
  topic: '/gps',
  channelId: 1,
  logTime: 10n,
  publishTime: 10n,
  sequence: 1,
  dataLength: 0,
  payload: null,
}

describe('map adapters', () => {
  it('recognizes supported location and GeoJSON channels', () => {
    expect(isLocationChannel({ id: 1, topic: '/gps', schemaId: 1, schemaName: 'sensor_msgs/NavSatFix', messageCount: 1 })).toBe(true)
    expect(isLocationChannel({ id: 2, topic: '/location', schemaId: 2, schemaName: 'foxglove.LocationFix', messageCount: 1 })).toBe(true)
    expect(isGeoJsonChannel({ id: 3, topic: '/zones', schemaId: 3, schemaName: 'foxglove.GeoJSON', messageCount: 1 })).toBe(true)
  })

  it('adapts LocationFix with heading and ENU velocity', () => {
    const samples = adaptLocationMessage({
      latitude: 31.23,
      longitude: 121.47,
      heading: Math.PI / 2,
      velocity: { x: 2, y: 1, z: 0 },
      frame_id: 'gps',
    }, message)
    expect(samples).toEqual([expect.objectContaining({
      latitude: 31.23,
      longitude: 121.47,
      headingRad: Math.PI / 2,
      velocity: { x: 2, y: 1, z: 0 },
      frameId: 'gps',
      logTimeNs: 10n,
    })])
  })

  it('rejects invalid coordinates and parses Foxglove GeoJSON strings', () => {
    expect(adaptLocationMessage({ latitude: 91, longitude: 121 }, message)).toEqual([])
    expect(adaptGeoJsonMessage({ geojson: JSON.stringify({ type: 'FeatureCollection', features: [] }) })).toEqual({
      type: 'FeatureCollection',
      features: [],
    })
  })
})
