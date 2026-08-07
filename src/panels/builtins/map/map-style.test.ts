import { describe, expect, it } from 'vitest'
import { DEFAULT_OSM_STYLE_URL, LEGACY_DEMO_STYLE_URL, OSM_ATTRIBUTION, OSM_TILE_URL, resolveMapStyle } from './map-style'

describe('map style', () => {
  it('uses an inline OSM raster style by default', () => {
    const style = resolveMapStyle(DEFAULT_OSM_STYLE_URL)
    expect(typeof style).toBe('object')
    expect(style).toMatchObject({
      version: 8,
      sources: {
        osm: {
          type: 'raster',
          tiles: [OSM_TILE_URL],
          attribution: OSM_ATTRIBUTION,
        },
      },
    })
  })

  it('migrates the previous demo style to OSM', () => {
    expect(resolveMapStyle(LEGACY_DEMO_STYLE_URL)).not.toBe(LEGACY_DEMO_STYLE_URL)
  })

  it('keeps custom MapLibre styles configurable', () => {
    const customStyle = 'https://example.com/style.json'
    expect(resolveMapStyle(customStyle)).toBe(customStyle)
  })
})
