import type { ComponentType } from 'react'
import type { McapChannel, PlotSeries, ThreeDSettings } from '@/stores/use-player-store'

export type PanelId = string
export type PanelType = string
export type PanelConfig = Record<string, unknown>

export interface OverviewPanelConfig extends PanelConfig {}

export interface RawMessagePanelConfig extends PanelConfig {
  topic: string | null
  refreshRateHz: number
  binaryFormat: 'placeholder' | 'hex' | 'raw'
}

export interface ImagePanelConfig extends PanelConfig {
  topic: string | null
  imageFit: 'contain' | 'cover' | 'fill'
  brightness: number
}

export interface PlotPanelConfig extends PanelConfig {
  series: PlotSeries[]
  availableFieldsByTopic: Record<string, string[]>
}

export interface TimelinePanelConfig extends PanelConfig {
  visibleTopics: string[] | null
}

export interface ThreeDPanelConfig extends PanelConfig, ThreeDSettings {}

export interface PanelComponentProps<C extends PanelConfig = PanelConfig> {
  panelId: PanelId
  config: C
}

export interface PanelSettingsProps<C extends PanelConfig = PanelConfig> {
  panelId: PanelId
  config: C
  updateConfig: (patch: Partial<C>) => void
}

export interface PanelDefinition<C extends PanelConfig = PanelConfig> {
  type: PanelType
  title: string
  configVersion: number
  createDefaultConfig: () => C
  loadPanel: () => Promise<{ default: ComponentType<PanelComponentProps<C>> }>
  loadSettings?: () => Promise<{ default: ComponentType<PanelSettingsProps<C>> }>
  supportsTopic?: (channel: McapChannel) => boolean
  createConfigForTopic?: (channel: McapChannel) => Partial<C>
  migrateConfig?: (config: unknown, fromVersion: number) => C
}

export interface PanelInstance<C extends PanelConfig = PanelConfig> {
  id: PanelId
  type: PanelType
  title?: string
  configVersion: number
  config: C
}

export interface PanelLayoutExportData {
  version: 1
  appName: 'mcapview'
  exportedAt: string
  panelsById: Record<PanelId, PanelInstance>
  panelOrder: PanelId[]
  dockviewLayout: Record<string, unknown>
}
