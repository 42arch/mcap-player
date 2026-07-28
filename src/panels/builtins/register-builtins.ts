import type { ImagePanelConfig, PlotPanelConfig, RawMessagePanelConfig, ThreeDPanelConfig } from '@/panels/core/types'
import { registerPanel } from '@/panels/core/panel-registry'

let registered = false

export function registerBuiltInPanels() {
  if (registered) {
    return
  }
  registered = true

  registerPanel({
    type: 'overview',
    title: 'Overview & Schemas',
    configVersion: 1,
    createDefaultConfig: () => ({}),
    loadPanel: () => import('@/panels/builtins/overview/overview-panel'),
    loadSettings: () => import('@/panels/builtins/overview/overview-setting'),
  })

  registerPanel<RawMessagePanelConfig>({
    type: 'messages',
    title: 'Raw Message View',
    configVersion: 1,
    createDefaultConfig: () => ({
      topic: null,
      refreshRateHz: 15,
      binaryFormat: 'placeholder',
    }),
    loadPanel: () => import('@/panels/builtins/messages/raw-message-panel'),
    loadSettings: () => import('@/panels/builtins/messages/raw-message-setting'),
  })

  registerPanel<ImagePanelConfig>({
    type: 'image',
    title: 'Camera Image View',
    configVersion: 1,
    createDefaultConfig: () => ({
      topic: null,
      imageFit: 'contain',
      brightness: 1,
    }),
    loadPanel: () => import('@/panels/builtins/image/image-panel'),
    loadSettings: () => import('@/panels/builtins/image/image-setting'),
    supportsTopic: channel => /image|compressedimage/i.test(channel.schemaName || ''),
    createConfigForTopic: channel => ({ topic: channel.topic }),
  })

  registerPanel<PlotPanelConfig>({
    type: 'plot',
    title: 'Plot Visualizer',
    configVersion: 1,
    createDefaultConfig: () => ({
      windowSizeSeconds: 15,
      series: [
        {
          id: 'default-series',
          name: 'Series 1',
          topic: '',
          path: '',
          lineStyle: 'solid',
          lineWidth: 2,
          color: '#3b82f6',
        },
      ],
      availableFieldsByTopic: {},
    }),
    loadPanel: () => import('@/panels/builtins/plot/plot-panel'),
    loadSettings: () => import('@/panels/builtins/plot/plot-setting'),
  })

  registerPanel<ThreeDPanelConfig>({
    type: '3d',
    title: '3D Spatial View',
    configVersion: 1,
    createDefaultConfig: () => ({
      selectedTopic: null,
      visibleTopics: {},
      labelFieldsByTopic: {},
      pointSize: 2,
      colorMode: 'height',
      solidColor: '#00ffcc',
      backgroundColor: '#ffffff',
      maxPoints: 200000,
      showGrid: true,
      showAxes: true,
    }),
    loadPanel: () => import('@/panels/builtins/three-d/three-d-panel'),
    loadSettings: () => import('@/panels/builtins/three-d/three-d-setting'),
  })
}
