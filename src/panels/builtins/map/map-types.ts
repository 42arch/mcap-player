export interface MapLocationSample {
  logTimeNs: bigint
  longitude: number
  latitude: number
  altitude?: number
  headingRad?: number
  velocity?: { x: number, y: number, z: number }
  color?: string
  frameId?: string
}

export interface MapGeoJsonGeometry {
  type: string
  coordinates?: unknown
  geometries?: MapGeoJsonGeometry[]
}

export interface MapGeoJsonFeature {
  type: 'Feature'
  geometry: MapGeoJsonGeometry
  properties?: Record<string, unknown> | null
}

export interface MapGeoJsonCollection {
  type: 'FeatureCollection'
  features: MapGeoJsonFeature[]
}
