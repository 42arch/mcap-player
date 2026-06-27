import type { ParsedMessage } from '@/lib/mcap/decoder'
import { BlobReadable } from '@mcap/browser'
import { McapIndexedReader } from '@mcap/core'
// import { loadDecompressHandlers } from '@mcap/support'
import { create } from 'zustand'
import { buildProtobufDefinitions, parseRosMsgDefinitions } from '@/lib/mcap/decoder'

export interface ParsedChannel {
  id: number
  topic: string
  schemaId: number
  messageEncoding: string
  schemaName: string
}

export interface ParsedSchema {
  id: number
  name: string
  encoding: string
  dataString: string
  rawBytes: Uint8Array
}

export interface FileStats {
  name: string
  size: number
  messageCount: string
  duration: string
  start: string
  end: string
  channelsCount: number
  schemasCount: number
  chunkCount: number
  attachmentCount: number
  metadataCount: number
}

export function findActiveMessage(topicMsgs: ParsedMessage[], targetNs: bigint): ParsedMessage | null {
  if (topicMsgs.length === 0)
    return null
  if (topicMsgs[0].logTimeBigInt > targetNs) {
    return null
  }

  let low = 0
  let high = topicMsgs.length - 1
  let resultIndex = -1

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const midVal = topicMsgs[mid].logTimeBigInt

    if (midVal <= targetNs) {
      resultIndex = mid
      low = mid + 1
    }
    else {
      high = mid - 1
    }
  }

  return resultIndex !== -1 ? topicMsgs[resultIndex] : null
}

interface McapState {
  loading: boolean
  loadingProgress: { loaded: number, total: number } | null
  error: string | null
  isLoaded: boolean

  stats: FileStats | null
  channels: ParsedChannel[]
  schemas: ParsedSchema[]
  messages: ParsedMessage[]
  messagesByTopic: Record<string, ParsedMessage[]>
  messageCountsByTopic: Record<string, number>
  ros2Definitions: Record<string, any>
  protobufDefinitions: Record<string, any>

  selectedTopic: string

  startNs: bigint
  durationSeconds: number
  elapsedSeconds: number
  isPlaying: boolean
  playbackSpeed: number

  loadFile: (file: File) => Promise<void>
  setSelectedTopic: (topic: string) => void
  setElapsedSeconds: (sec: number | ((prev: number) => number)) => void
  setIsPlaying: (playing: boolean) => void
  setPlaybackSpeed: (speed: number) => void
  seekRelative: (seconds: number) => void
  reset: () => void
}

export const useMcapStore = create<McapState>((set, get) => ({
  loading: false,
  loadingProgress: null,
  error: null,
  isLoaded: false,

  stats: null,
  channels: [],
  schemas: [],
  messages: [],
  messagesByTopic: {},
  messageCountsByTopic: {},
  ros2Definitions: {},
  protobufDefinitions: {},

  selectedTopic: '',

  startNs: BigInt(0),
  durationSeconds: 0,
  elapsedSeconds: 0,
  isPlaying: false,
  playbackSpeed: 1.0,

  loadFile: async (file: File) => {
    if (!file)
      return

    set({
      loading: true,
      error: null,
      loadingProgress: { loaded: 0, total: 100 },
      elapsedSeconds: 0,
      isPlaying: false,
      isLoaded: false,
    })

    try {
      // const decompressHandlers = await loadDecompressHandlers()
      const readable = new BlobReadable(file)
      const reader = await McapIndexedReader.Initialize({
        readable,
        // decompressHandlers,
      })

      const totalMessages = Number(reader.statistics?.messageCount || BigInt(0))
      const chunkCount = reader.chunkIndexes.length
      const attachmentCount = reader.attachmentIndexes.length
      const metadataCount = reader.metadataIndexes.length

      const channelsList: ParsedChannel[] = []
      const schemasList: ParsedSchema[] = []

      for (const [id, channel] of reader.channelsById.entries()) {
        const schema = reader.schemasById.get(channel.schemaId)
        channelsList.push({
          id,
          topic: channel.topic,
          schemaId: channel.schemaId,
          messageEncoding: channel.messageEncoding,
          schemaName: schema ? schema.name : 'None',
        })
      }

      for (const [id, schema] of reader.schemasById.entries()) {
        let dataString = ''
        try {
          dataString = new TextDecoder().decode(schema.data)
        }
        catch {
          dataString = `[Binary: ${schema.data.length} bytes]`
        }
        schemasList.push({
          id,
          name: schema.name,
          encoding: schema.encoding,
          dataString,
          rawBytes: schema.data,
        })
      }

      const ros2Defs: Record<string, any> = {}
      for (const s of schemasList) {
        try {
          Object.assign(ros2Defs, parseRosMsgDefinitions(s.name, s.dataString))
        }
        catch (e) {
          console.warn('Failed to parse schema definition for', s.name, e)
        }
      }

      const protoDefs: Record<string, any> = {}
      for (const s of schemasList) {
        if (s.encoding.toLowerCase().includes('protobuf')) {
          try {
            Object.assign(protoDefs, buildProtobufDefinitions(s.rawBytes))
          }
          catch (e) {
            console.warn('Failed to parse Protobuf definitions for', s.name, e)
          }
        }
      }
      console.warn('Loaded Protobuf definitions for message types:', Object.keys(protoDefs))

      let fileStartNs = reader.statistics?.messageStartTime || BigInt(0)
      let fileEndNs = reader.statistics?.messageEndTime || BigInt(0)

      const msgs: ParsedMessage[] = []
      let msgCount = 0

      // Map dynamic counts
      const counts: Record<string, number> = {}
      const byTopic: Record<string, ParsedMessage[]> = {}

      for (const channel of reader.channelsById.values()) {
        byTopic[channel.topic] = []
      }

      for await (const message of reader.readMessages()) {
        const channel = reader.channelsById.get(message.channelId)
        const topic = channel ? channel.topic : `Unknown (${message.channelId})`
        const encoding = channel ? channel.messageEncoding : ''
        const schema = channel ? reader.schemasById.get(channel.schemaId) : undefined
        const schemaName = schema ? schema.name : 'None'

        const timeSec = Number(message.logTime / BigInt(1000000000))
        const timeNs = Number(message.logTime % BigInt(1000000000))
        const formattedTime = `${new Date(timeSec * 1000).toLocaleTimeString()}.${timeNs.toString().padStart(9, '0')}`

        let dataPreview = ''
        if (encoding.includes('json')) {
          try {
            const decoded = new TextDecoder().decode(message.data)
            dataPreview = JSON.stringify(JSON.parse(decoded))
          }
          catch {
            dataPreview = new TextDecoder().decode(message.data)
          }
        }
        else {
          try {
            const decoded = new TextDecoder().decode(message.data)
            const isPlain = /^[\u0020-\u007E\t\n\r]*$/.test(decoded.slice(0, 100))
            if (isPlain) {
              dataPreview = decoded.slice(0, 150)
            }
            else {
              dataPreview = `[Binary: ${message.data.length} bytes]`
            }
          }
          catch {
            dataPreview = `[Binary: ${message.data.length} bytes]`
          }
        }

        const parsedMsg: ParsedMessage = {
          sequence: message.sequence,
          topic,
          logTime: formattedTime,
          logTimeBigInt: message.logTime,
          publishTime: message.publishTime.toString(),
          dataPreview,
          rawBytes: message.data,
          encoding,
          schemaName,
        }

        msgs.push(parsedMsg)
        if (!byTopic[topic]) {
          byTopic[topic] = []
        }
        byTopic[topic].push(parsedMsg)
        counts[topic] = (counts[topic] || 0) + 1

        msgCount++
        if (msgCount % 2000 === 0) {
          set({
            loadingProgress: { loaded: msgCount, total: totalMessages || 10000 },
          })
          await new Promise(resolve => setTimeout(resolve, 0))
        }

        if (msgCount >= 100000) {
          break
        }
      }

      if ((fileStartNs === BigInt(0) || fileEndNs === BigInt(0)) && msgs.length > 0) {
        fileStartNs = msgs[0].logTimeBigInt
        fileEndNs = msgs[msgs.length - 1].logTimeBigInt
      }

      const durationSec = Number(fileEndNs - fileStartNs) / 1e9

      let startStr = 'N/A'
      let endStr = 'N/A'
      if (fileStartNs > BigInt(0)) {
        startStr = new Date(Number(fileStartNs / BigInt(1000000000)) * 1000).toLocaleString()
        endStr = new Date(Number(fileEndNs / BigInt(1000000000)) * 1000).toLocaleString()
      }

      const statsObj: FileStats = {
        name: file.name,
        size: file.size,
        messageCount: msgCount.toString(),
        duration: `${durationSec.toFixed(3)}s`,
        start: startStr,
        end: endStr,
        channelsCount: channelsList.length,
        schemasCount: schemasList.length,
        chunkCount,
        attachmentCount,
        metadataCount,
      }

      const initialTopic = channelsList.length > 0 ? channelsList[0].topic : ''

      set({
        loading: false,
        loadingProgress: null,
        isLoaded: true,
        stats: statsObj,
        channels: channelsList,
        schemas: schemasList,
        messages: msgs,
        messagesByTopic: byTopic,
        messageCountsByTopic: counts,
        ros2Definitions: ros2Defs,
        protobufDefinitions: protoDefs,
        selectedTopic: initialTopic,
        startNs: fileStartNs,
        durationSeconds: durationSec,
        elapsedSeconds: 0,
      })
    }
    catch (err: any) {
      console.error('Error loading MCAP file:', err)
      set({
        loading: false,
        loadingProgress: null,
        error: err?.message || 'Failed to parse MCAP file.',
      })
    }
  },

  setSelectedTopic: (topic: string) => {
    set({ selectedTopic: topic })
  },

  setElapsedSeconds: (sec: number | ((prev: number) => number)) => {
    const { durationSeconds } = get()
    set((state) => {
      let nextSec = typeof sec === 'function' ? sec(state.elapsedSeconds) : sec
      if (nextSec < 0)
        nextSec = 0
      if (nextSec > durationSeconds)
        nextSec = durationSeconds
      return { elapsedSeconds: nextSec }
    })
  },

  setIsPlaying: (playing: boolean) => {
    set({ isPlaying: playing })
  },

  setPlaybackSpeed: (speed: number) => {
    set({ playbackSpeed: speed })
  },

  seekRelative: (seconds: number) => {
    const { elapsedSeconds, durationSeconds } = get()
    let next = elapsedSeconds + seconds
    if (next < 0)
      next = 0
    if (next > durationSeconds)
      next = durationSeconds
    set({ elapsedSeconds: next })
  },

  reset: () => {
    set({
      loading: false,
      loadingProgress: null,
      error: null,
      isLoaded: false,
      stats: null,
      channels: [],
      schemas: [],
      messages: [],
      messagesByTopic: {},
      messageCountsByTopic: {},
      ros2Definitions: {},
      protobufDefinitions: {},
      selectedTopic: '',
      startNs: BigInt(0),
      durationSeconds: 0,
      elapsedSeconds: 0,
      isPlaying: false,
      playbackSpeed: 1.0,
    })
  },
}))
