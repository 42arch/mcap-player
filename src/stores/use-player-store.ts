import { create } from 'zustand'

export interface McapChannel {
  id: number
  topic: string
  schemaId: number
  schemaName?: string
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
  messages: McapMessage[]
  durationNs: bigint
  startNs: bigint
  endNs: bigint
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
  selectedTopic: string | null
  visibleTopics: Record<string, boolean>
  labelFieldsByTopic: Record<string, string[]>
  pointSize: number
  colorMode: 'height' | 'intensity' | 'solid'
  solidColor: string
  backgroundColor: string
  maxPoints: number
  showGrid: boolean
  showAxes: boolean
}

interface PlayerStore {
  fileSummary: McapFileSummary | null
  isLoading: boolean
  loadingMessage: string
  error: string | null

  // Playback state
  isPlaying: boolean
  playbackSpeed: number
  elapsedNs: bigint // nanoseconds relative to startNs (i.e. starts at 0n)

  // Topic selection in the metadata sidebar
  selectedTopic: string | null

  setFileSummary: (summary: McapFileSummary | null) => void
  setIsLoading: (loading: boolean, message?: string) => void
  setError: (error: string | null) => void

  setIsPlaying: (playing: boolean) => void
  setPlaybackSpeed: (speed: number) => void
  setElapsedNs: (ns: bigint) => void
  setSelectedTopic: (topic: string | null) => void
}

export const usePlayerStore = create<PlayerStore>(set => ({
  fileSummary: null,
  isLoading: false,
  loadingMessage: '',
  error: null,

  isPlaying: false,
  playbackSpeed: 1.0,
  elapsedNs: 0n,

  selectedTopic: null,

  setFileSummary: summary =>
    set({
      fileSummary: summary,
      isLoading: false,
      error: null,
      isPlaying: false,
      elapsedNs: 0n,
      selectedTopic: null,
    }),
  setIsLoading: (loading, message = '') =>
    set({ isLoading: loading, loadingMessage: message }),
  setError: error => set({ error, isLoading: false }),

  setIsPlaying: playing => set({ isPlaying: playing }),
  setPlaybackSpeed: speed => set({ playbackSpeed: speed }),
  setElapsedNs: ns => set({ elapsedNs: ns }),
  setSelectedTopic: topic => set({ selectedTopic: topic }),
}))
