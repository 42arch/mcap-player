export const DEFAULT_OSM_STYLE_URL = 'osm://default'
export const LEGACY_DEMO_STYLE_URL = 'https://demotiles.maplibre.org/style.json'
export const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
export const OSM_ATTRIBUTION = '© OpenStreetMap contributors'

export interface OSMStyle {
  version: 8
  name: string
  sources: Record<string, {
    type: 'raster'
    tiles: string[]
    tileSize: number
    attribution: string
  }>
  layers: Array<{
    id: string
    type: 'raster'
    source: string
  }>
}

export function createOsmStyle(): OSMStyle {
  return {
    version: 8,
    name: 'OpenStreetMap',
    sources: {
      osm: {
        type: 'raster',
        tiles: [OSM_TILE_URL],
        tileSize: 256,
        attribution: OSM_ATTRIBUTION,
      },
    },
    layers: [{
      id: 'osm-raster',
      type: 'raster',
      source: 'osm',
    }],
  }
}

export function resolveMapStyle(styleUrl: string): OSMStyle | string {
  return !styleUrl || styleUrl === DEFAULT_OSM_STYLE_URL || styleUrl === LEGACY_DEMO_STYLE_URL
    ? createOsmStyle()
    : styleUrl
}
