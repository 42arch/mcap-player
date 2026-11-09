import type { RemoteLoadProgress } from '@/core/sources/remote-load-progress'
import { create } from 'zustand'
import { assignDefaultPanelTopics } from '@/panels/core/assign-default-topics'

export interface McapHeader {
  profile?: string
  library?: string
}

export interface McapMetadataItem {
  name: string
  metadata: Record<string, string>
}

export interface McapAttachmentItem {
  name: string
  mediaType: string
  size: number
  logTime?: bigint
  createTime?: bigint
}

export interface McapChannel {
  id: number
  topic: string
  schemaId: number
  schemaName?: string
  messageEncoding?: string
  metadata?: Record<string, string>
  messageCount: number
}

export interface McapSchema {
  id: number
  name: string
  encoding: string
  dataText: string
}

export interface McapMessage {
  topic: string
  channelId: number
  logTime: bigint
  publishTime: bigint
  sequence: number
  dataLength: number
  data: Uint8Array
  hexPreview?: string
  textPreview?: string
}

export interface McapFileSummary {
  name: string
  size: number
  messageCount: number
  channels: McapChannel[]
  schemas: McapSchema[]
  messages?: McapMessage[]
  durationNs: bigint
  startNs: bigint
  endNs: bigint
  frameIds?: string[]
  header?: McapHeader
  compressions?: string[]
  chunkCount?: number
  attachmentCount?: number
  metadataCount?: number
  metadataItems?: McapMetadataItem[]
  attachments?: McapAttachmentItem[]
}

export interface PlotSeries {
  id: string
  name: string
  topic: string
  path: string
  lineStyle: 'solid' | 'dashed'
  lineWidth: number
  color: string
}

export interface ThreeDSettings {
  /** @deprecated Use selectedLayerId. */
  selectedTopic: string | null
  selectedLayerId: string | null
  visibleTopics: Record<string, boolean>
  layerSettings: Record<string, Record<string, unknown>>
  /** @deprecated Stored for version-2 configuration compatibility. */
  labelFieldsByTopic: Record<string, string[]>
  /** "auto" resolves to the root of the observed transform graph. */
  fixedFrame: string
  /** Coordinate frame used as the camera's playback reference. */
  displayFrame: string
  /** How the camera follows motion of the display frame. */
  followMode: 'follow-pose' | 'follow-heading' | 'follow-position' | 'follow-none'
  /** @deprecated Point-cloud renderers now store settings per layer. */
  pointSize: number
  /** @deprecated Point-cloud renderers now store settings per layer. */
  colorMode: 'height' | 'intensity' | 'solid'
  /** @deprecated Point-cloud renderers now store settings per layer. */
  solidColor: string
  backgroundColor: string
  /** @deprecated Point-cloud renderers now store settings per layer. */
  maxPoints: number
  showGrid: boolean
  showAxes: boolean
}

interface PlayerStore {
  fileSummary: McapFileSummary | null
  isLoading: boolean
  loadingMessage: string
  error: string | null
  remoteLoadProgress: RemoteLoadProgress | null
  isRemoteBuffering: boolean
  isRemoteFullDownloadRunning: boolean

  // Playback state
  isPlaying: boolean
  playbackSpeed: number

  // Topic selection in the metadata sidebar
  selectedTopic: string | null

  setFileSummary: (summary: McapFileSummary | null) => void
  setIsLoading: (loading: boolean, message?: string) => void
  setError: (error: string | null) => void
  setRemoteLoadProgress: (progress: RemoteLoadProgress | null) => void
  setIsRemoteBuffering: (buffering: boolean) => void
  setIsRemoteFullDownloadRunning: (running: boolean) => void

  setIsPlaying: (playing: boolean) => void
  setPlaybackSpeed: (speed: number) => void
  setSelectedTopic: (topic: string | null) => void
}

export const usePlayerStore = create<PlayerStore>(set => ({
  fileSummary: null,
  isLoading: false,
  loadingMessage: '',
  error: null,
  remoteLoadProgress: null,
  isRemoteBuffering: false,
  isRemoteFullDownloadRunning: false,

  isPlaying: false,
  playbackSpeed: 1.0,

  selectedTopic: null,

  setFileSummary: (summary) => {
    set({
      fileSummary: summary,
      isLoading: false,
      error: null,
      remoteLoadProgress: null,
      isPlaying: false,
      selectedTopic: null,
      isRemoteFullDownloadRunning: false,
    })
    assignDefaultPanelTopics()
  },
  setIsLoading: (loading, message = '') =>
    set({ isLoading: loading, loadingMessage: message }),
  setError: error => set({ error, isLoading: false }),
  setRemoteLoadProgress: remoteLoadProgress => set({ remoteLoadProgress }),
  setIsRemoteBuffering: isRemoteBuffering => set({ isRemoteBuffering }),
  setIsRemoteFullDownloadRunning: isRemoteFullDownloadRunning => set({ isRemoteFullDownloadRunning }),

  setIsPlaying: playing => set({ isPlaying: playing }),
  setPlaybackSpeed: speed => set({ playbackSpeed: speed }),
  setSelectedTopic: topic => set({ selectedTopic: topic }),
}))
