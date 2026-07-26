import { nanoid } from 'nanoid'
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

  // Subscription and details selection
  subscribedTopics: Set<string>
  selectedTopic: string | null

  // Panel settings
  activePanel: 'overview' | 'messages' | 'image' | 'plot' | '3d'
  messagesSettings: {
    refreshRateHz: number
    binaryFormat: 'placeholder' | 'hex' | 'raw'
  }
  imageSettings: {
    imageFit: 'contain' | 'cover' | 'fill'
    brightness: number
  }
  plotSettings: {
    windowSizeSeconds: number
  }
  threeDSettings: ThreeDSettings
  plotSeries: PlotSeries[]
  availablePlotFields: Record<string, string[]>

  setFileSummary: (summary: McapFileSummary | null) => void
  setIsLoading: (loading: boolean, message?: string) => void
  setError: (error: string | null) => void

  setIsPlaying: (playing: boolean) => void
  setPlaybackSpeed: (speed: number) => void
  setElapsedNs: (ns: bigint) => void
  setSelectedTopic: (topic: string | null) => void
  toggleTopicSubscription: (topic: string) => void
  setSubscribedTopics: (topics: Set<string>) => void
  setActivePanel: (panel: 'overview' | 'messages' | 'image' | 'plot' | '3d') => void
  updateMessagesSettings: (settings: Partial<PlayerStore['messagesSettings']>) => void
  updateImageSettings: (settings: Partial<PlayerStore['imageSettings']>) => void
  updatePlotSettings: (settings: Partial<PlayerStore['plotSettings']>) => void
  updateThreeDSettings: (settings: Partial<ThreeDSettings>) => void
  toggleTopicVisibility: (topic: string) => void
  setTopicVisibility: (topic: string, visible: boolean) => void
  setAllTopicsVisibility: (topics: string[], visible: boolean) => void

  // Plot series actions
  addPlotSeries: () => void
  removePlotSeries: (id: string) => void
  updatePlotSeries: (id: string, updates: Partial<PlotSeries>) => void
  setAvailablePlotFieldsForTopic: (topic: string, fields: string[]) => void
}

export const usePlayerStore = create<PlayerStore>(set => ({
  fileSummary: null,
  isLoading: false,
  loadingMessage: '',
  error: null,

  isPlaying: false,
  playbackSpeed: 1.0,
  elapsedNs: 0n,

  subscribedTopics: new Set<string>(),
  selectedTopic: null,

  activePanel: 'overview',
  messagesSettings: {
    refreshRateHz: 15,
    binaryFormat: 'placeholder',
  },
  imageSettings: {
    imageFit: 'contain',
    brightness: 1.0,
  },
  plotSettings: {
    windowSizeSeconds: 15,
  },
  threeDSettings: {
    selectedTopic: null,
    visibleTopics: {},
    pointSize: 2.0,
    colorMode: 'height',
    solidColor: '#00ffcc',
    backgroundColor: '#ffffff',
    maxPoints: 200000,
    showGrid: true,
    showAxes: true,
  },
  plotSeries: [],
  availablePlotFields: {},

  setFileSummary: summary =>
    set({
      fileSummary: summary,
      isLoading: false,
      error: null,
      isPlaying: false,
      elapsedNs: 0n,
      subscribedTopics: new Set<string>(),
      selectedTopic: null,
      activePanel: 'overview',
      plotSettings: {
        windowSizeSeconds: 15,
      },
      threeDSettings: {
        selectedTopic: null,
        visibleTopics: {},
        pointSize: 2.0,
        colorMode: 'height',
        solidColor: '#00ffcc',
        backgroundColor: '#ffffff',
        maxPoints: 200000,
        showGrid: true,
        showAxes: true,
      },
      plotSeries: [
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
      availablePlotFields: {},
    }),
  setIsLoading: (loading, message = '') =>
    set({ isLoading: loading, loadingMessage: message }),
  setError: error => set({ error, isLoading: false }),

  setIsPlaying: playing => set({ isPlaying: playing }),
  setPlaybackSpeed: speed => set({ playbackSpeed: speed }),
  setElapsedNs: ns => set({ elapsedNs: ns }),
  setSelectedTopic: topic => set({ selectedTopic: topic }),
  toggleTopicSubscription: topic =>
    set((state) => {
      const next = new Set(state.subscribedTopics)
      if (next.has(topic)) {
        next.delete(topic)
      }
      else {
        next.add(topic)
      }
      return { subscribedTopics: next }
    }),
  setSubscribedTopics: topics =>
    set(() => {
      return { subscribedTopics: new Set(topics) }
    }),
  setActivePanel: panel => set({ activePanel: panel }),
  updateMessagesSettings: settings =>
    set(state => ({
      messagesSettings: { ...state.messagesSettings, ...settings },
    })),
  updateImageSettings: settings =>
    set(state => ({
      imageSettings: { ...state.imageSettings, ...settings },
    })),
  updatePlotSettings: settings =>
    set(state => ({
      plotSettings: { ...state.plotSettings, ...settings },
    })),
  updateThreeDSettings: settings =>
    set(state => ({
      threeDSettings: { ...state.threeDSettings, ...settings },
    })),
  toggleTopicVisibility: topic =>
    set(state => {
      const current = state.threeDSettings.visibleTopics[topic] ?? true
      const nextVisible = { ...state.threeDSettings.visibleTopics, [topic]: !current }
      return {
        threeDSettings: { ...state.threeDSettings, visibleTopics: nextVisible },
      }
    }),
  setTopicVisibility: (topic, visible) =>
    set(state => ({
      threeDSettings: {
        ...state.threeDSettings,
        visibleTopics: { ...state.threeDSettings.visibleTopics, [topic]: visible },
      },
    })),
  setAllTopicsVisibility: (topics, visible) =>
    set(state => {
      const nextVisible = { ...state.threeDSettings.visibleTopics }
      for (const t of topics) {
        nextVisible[t] = visible
      }
      return {
        threeDSettings: { ...state.threeDSettings, visibleTopics: nextVisible },
      }
    }),

  addPlotSeries: () =>
    set((state) => {
      const nextIndex = state.plotSeries.length + 1
      const palette = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']
      const color = palette[(nextIndex - 1) % palette.length]

      const newSeries: PlotSeries = {
        id: nanoid(),
        name: `Series ${nextIndex}`,
        topic: '',
        path: '',
        lineStyle: 'solid',
        lineWidth: 2,
        color,
      }
      return { plotSeries: [...state.plotSeries, newSeries] }
    }),
  removePlotSeries: id =>
    set(state => ({
      plotSeries: state.plotSeries.filter(s => s.id !== id),
    })),
  updatePlotSeries: (id, updates) =>
    set(state => ({
      plotSeries: state.plotSeries.map(s => (s.id === id ? { ...s, ...updates } : s)),
    })),
  setAvailablePlotFieldsForTopic: (topic, fields) =>
    set(state => ({
      availablePlotFields: { ...state.availablePlotFields, [topic]: fields },
    })),
}))
