import type { MapGeoJsonCollection, MapGeoJsonFeature, MapLocationSample } from './map-types'
import type { PlaybackMessage } from '@/panels/runtime/message-pipeline'
import type { McapChannel } from '@/stores/use-player-store'

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function getFrameId(payload: any): string | undefined {
  const frameId = payload?.frame_id
    ?? payload?.frameId
    ?? payload?.header?.frame_id
    ?? payload?.header?.frameId
  return typeof frameId === 'string' && frameId.trim() ? frameId.trim() : undefined
}

function colorToHex(color: any): string | undefined {
  if (!color || typeof color !== 'object') {
    return undefined
  }
  const r = asFiniteNumber(color.r)
  const g = asFiniteNumber(color.g)
  const b = asFiniteNumber(color.b)
  if (r === undefined || g === undefined || b === undefined) {
    return undefined
  }
  const toByte = (value: number) => Math.round(Math.max(0, Math.min(1, value)) * 255)
  return `#${[r, g, b].map(value => toByte(value).toString(16).padStart(2, '0')).join('')}`
}

function isValidCoordinate(latitude: number | undefined, longitude: number | undefined): latitude is number {
  return latitude !== undefined
    && longitude !== undefined
    && latitude >= -90
    && latitude <= 90
    && longitude >= -180
    && longitude <= 180
}

function createLocationSample(payload: any, message: PlaybackMessage): MapLocationSample | null {
  const latitude = asFiniteNumber(payload?.latitude)
  const longitude = asFiniteNumber(payload?.longitude)
  if (!isValidCoordinate(latitude, longitude)) {
    return null
  }

  const velocity = payload?.velocity && typeof payload.velocity === 'object'
    ? {
        x: asFiniteNumber(payload.velocity.x) ?? 0,
        y: asFiniteNumber(payload.velocity.y) ?? 0,
        z: asFiniteNumber(payload.velocity.z) ?? 0,
      }
    : undefined

  return {
    logTimeNs: message.logTime,
    latitude: latitude as number,
    longitude: longitude as number,
    altitude: asFiniteNumber(payload?.altitude),
    headingRad: asFiniteNumber(payload?.heading),
    velocity,
    color: colorToHex(payload?.color),
    frameId: getFrameId(payload),
  }
}

export function isLocationChannel(channel: McapChannel): boolean {
  const schema = (channel.schemaName || '').toLowerCase()
  return schema === 'sensor_msgs/navsatfix'
    || schema === 'sensor_msgs/msg/navsatfix'
    || schema === 'foxglove.locationfix'
    || schema === 'foxglove.locationfixes'
}

export function isGeoJsonChannel(channel: McapChannel): boolean {
  const schema = (channel.schemaName || '').toLowerCase()
  return schema === 'foxglove.geojson'
    || schema === 'foxglove_msgs/geojson'
    || schema === 'foxglove_msgs/msg/geojson'
}

export function adaptLocationMessage(
  payload: unknown,
  message: PlaybackMessage,
): MapLocationSample[] {
  if (!payload || typeof payload !== 'object') {
    return []
  }

  const value = payload as any
  if (Array.isArray(value.locations)) {
    return value.locations
      .map((location: any) => createLocationSample(location, message))
      .filter((sample: MapLocationSample | null): sample is MapLocationSample => sample !== null)
  }

  const sample = createLocationSample(value, message)
  return sample ? [sample] : []
}

function isFeature(value: unknown): value is MapGeoJsonFeature {
  return Boolean(value)
    && typeof value === 'object'
    && (value as any).type === 'Feature'
    && Boolean((value as any).geometry)
}

function isFeatureCollection(value: unknown): value is MapGeoJsonCollection {
  return Boolean(value)
    && typeof value === 'object'
    && (value as any).type === 'FeatureCollection'
    && Array.isArray((value as any).features)
}

export function adaptGeoJsonMessage(payload: unknown): MapGeoJsonCollection | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const raw = (payload as any).geojson ?? payload
  let parsed: unknown = raw
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw)
    }
    catch {
      return null
    }
  }

  if (isFeatureCollection(parsed)) {
    return parsed
  }
  if (isFeature(parsed)) {
    return {
      type: 'FeatureCollection',
      features: [parsed],
    }
  }
  if (parsed && typeof parsed === 'object' && 'type' in parsed && 'coordinates' in parsed) {
    return {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {},
        geometry: parsed as any,
      }],
    }
  }
  return null
}
