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
  activePanel: 'overview' | 'messages'
  messagesSettings: {
    refreshRateHz: number
    binaryFormat: 'placeholder' | 'hex' | 'raw'
  }

  setFileSummary: (summary: McapFileSummary | null) => void
  setIsLoading: (loading: boolean, message?: string) => void
  setError: (error: string | null) => void

  setIsPlaying: (playing: boolean) => void
  setPlaybackSpeed: (speed: number) => void
  setElapsedNs: (ns: bigint) => void
  setSelectedTopic: (topic: string | null) => void
  toggleTopicSubscription: (topic: string) => void
  setSubscribedTopics: (topics: Set<string>) => void
  setActivePanel: (panel: 'overview' | 'messages') => void
  updateMessagesSettings: (settings: Partial<PlayerStore['messagesSettings']>) => void
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
      const next = new Set<string>()
      if (!state.subscribedTopics.has(topic)) {
        next.add(topic)
      }
      return { subscribedTopics: next }
    }),
  setSubscribedTopics: topics =>
    set(() => {
      const next = new Set<string>()
      if (topics.size > 0) {
        const first = Array.from(topics)[0]
        next.add(first)
      }
      return { subscribedTopics: next }
    }),
  setActivePanel: panel => set({ activePanel: panel }),
  updateMessagesSettings: settings =>
    set(state => ({
      messagesSettings: { ...state.messagesSettings, ...settings },
    })),
}))
