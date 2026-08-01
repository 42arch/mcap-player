import type { SceneLayerSettings } from './scene-renderer-registry'

export interface PointCloudRenderSettings {
  colorMode: 'height' | 'intensity' | 'solid'
  maxPoints: number
  pointSize: number
  solidColor: string
}

function numericSetting(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function readPointCloudSettings(settings: SceneLayerSettings): PointCloudRenderSettings {
  return {
    pointSize: numericSetting(settings.pointSize, 2),
    maxPoints: numericSetting(settings.maxPoints, 200000),
    colorMode: settings.colorMode === 'intensity' || settings.colorMode === 'solid'
      ? settings.colorMode
      : 'height',
    solidColor: typeof settings.solidColor === 'string' ? settings.solidColor : '#00ffcc',
  }
}
