import type {
  ImagePanelConfig,
  PlotPanelConfig,
  RawMessagePanelConfig,
  ThreeDPanelConfig,
  TimelinePanelConfig,
} from '@/panels/core/types'
import { registerBuiltInSceneAdapters } from '@/panels/builtins/three-d/register-built-in-scene-adapters'
import { registerBuiltInSceneRenderers } from '@/panels/builtins/three-d/register-built-in-scene-renderers'
import { registerPanel } from '@/panels/core/panel-registry'

let registered = false

function createDefaultThreeDConfig(): ThreeDPanelConfig {
  return {
    selectedTopic: null,
    selectedLayerId: null,
    visibleTopics: {},
    layerSettings: {},
    labelFieldsByTopic: {},
    fixedFrame: 'auto',
    displayFrame: 'map',
    followMode: 'follow-position',
    pointSize: 2,
    colorMode: 'height',
    solidColor: '#00ffcc',
    backgroundColor: '#ffffff',
    maxPoints: 200000,
    showGrid: true,
    showAxes: true,
  }
}

function migrateThreeDConfig(config: unknown): ThreeDPanelConfig {
  const previous = config && typeof config === 'object'
    ? config as Partial<ThreeDPanelConfig>
    : {}
  const followMode = previous.followMode
  return {
    ...createDefaultThreeDConfig(),
    ...previous,
    fixedFrame: typeof previous.fixedFrame === 'string' && previous.fixedFrame.trim()
      ? previous.fixedFrame
      : 'auto',
    displayFrame: typeof previous.displayFrame === 'string' && previous.displayFrame.trim()
      ? previous.displayFrame
      : 'map',
    followMode: followMode === 'follow-pose'
      || followMode === 'follow-heading'
      || followMode === 'follow-position'
      || followMode === 'follow-none'
      ? followMode
      : 'follow-position',
  }
}

export function registerBuiltInPanels() {
  if (registered) {
    return
  }
  registered = true
  registerBuiltInSceneRenderers()
  registerBuiltInSceneAdapters()

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

  registerPanel<TimelinePanelConfig>({
    type: 'timeline',
    title: 'Message Timeline',
    configVersion: 1,
    createDefaultConfig: () => ({
      visibleTopics: null,
    }),
    loadPanel: () => import('@/panels/builtins/timeline/timeline-panel'),
    loadSettings: () => import('@/panels/builtins/timeline/timeline-setting'),
  })

  registerPanel<ThreeDPanelConfig>({
    type: '3d',
    title: '3D Spatial View',
    configVersion: 4,
    createDefaultConfig: createDefaultThreeDConfig,
    loadPanel: () => import('@/panels/builtins/three-d/three-d-panel'),
    loadSettings: () => import('@/panels/builtins/three-d/three-d-setting'),
    migrateConfig: migrateThreeDConfig,
  })
}
