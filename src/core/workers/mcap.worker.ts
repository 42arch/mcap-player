import type { DispatchModeByTopic } from './message-cursor'
import type { PlotSeriesData, PlotSeriesRequest } from './plot-data'
import type { BackfillClass } from './topic-classifier'
import type { MessageProcessorByTopic } from '@/core/message-processing'
import type { McapSource } from '@/core/sources/mcap-source'
import type { IndexedChunkCoverage, RemoteLoadProgress } from '@/core/sources/remote-load-progress'
import { Buffer } from 'buffer/'
import { BlobReadable } from '@mcap/browser'
import { McapIndexedReader } from '@mcap/core'
import { loadDecompressHandlers } from '@mcap/support'
import { expose, transfer } from 'comlink'
import { isH264Format } from '@/core/parsers/h264'
import { createNumericValueAccessor } from '@/core/parsers/value-extractor'
import { CachedHttpReadable } from '@/core/sources/cached-http-readable'
import { getPlayableTimeRanges } from '@/core/sources/remote-load-progress'
import {
  getTransferableBuffers,
  MessageCursor,
} from './message-cursor'
import { DEFAULT_MAX_PLOT_POINTS_PER_SERIES, PlotSeriesAccumulator } from './plot-data'
import { collectTimelineData } from './timeline-data'
import { getBackfillClass } from './topic-classifier'

type BackfillPhase = 'all' | BackfillClass

interface InitializeOptions {
  buildSpatialIndex?: boolean
  remoteCacheBytes?: number
}

function yieldToEventLoop(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}

function buildChunkCoverage(reader: McapIndexedReader): IndexedChunkCoverage[] {
  const chunksByOffset = [...reader.chunkIndexes]
    .sort((a, b) => (a.chunkStartOffset < b.chunkStartOffset ? -1 : a.chunkStartOffset > b.chunkStartOffset ? 1 : 0))
  const coverage: IndexedChunkCoverage[] = []

  for (const [index, chunk] of chunksByOffset.entries()) {
    const chunkStart = Number(chunk.chunkStartOffset)
    const chunkEnd = Number(chunk.chunkStartOffset + chunk.chunkLength)
    const nextChunkStart = chunksByOffset[index + 1] === undefined
      ? undefined
      : Number(chunksByOffset[index + 1].chunkStartOffset)
    const byteEnd = nextChunkStart !== undefined && nextChunkStart > chunkEnd
      ? nextChunkStart
      : chunkEnd
    if (!Number.isSafeInteger(chunkStart) || !Number.isSafeInteger(byteEnd) || byteEnd <= chunkStart) {
      continue
    }
    coverage.push({
      byteRange: { start: chunkStart, end: byteEnd },
      startNs: chunk.messageStartTime,
      endNs: chunk.messageEndTime,
    })
  }
  return coverage.sort((a, b) => (a.startNs < b.startNs ? -1 : a.startNs > b.startNs ? 1 : 0))
}

// @foxglove/wasm-lz4 expects Node's Buffer when copying decompressed bytes.
// Install the browser implementation only in this worker's global scope.
const workerBuffer = Reflect.get(globalThis, 'Buffer')
if (workerBuffer === undefined || workerBuffer === null) {
  Reflect.set(globalThis, 'Buffer', Buffer)
}

class McapWorker {
  private reader: McapIndexedReader | null = null
  private remoteReadable: CachedHttpReadable | null = null
  private chunkCoverage: IndexedChunkCoverage[] = []
  private decompressHandlers: any = null
  private cursor = new MessageCursor()
  private initializeGeneration = 0

  // Track cursor tracking state to detect jumps/changes
  private lastTopics: string[] = []
  private lastDispatchModes = ''
  private lastEndTimeNs = -1n
  private latestSeekGeneration = 0
  private imageDeliveryModes = new Map<string, 'all' | 'latest'>()
  private activePlotRequestIds = new Set<number>()
  private canceledPlotRequestIds = new Set<number>()
  private timelineGeneration = 0

  async initialize(source: McapSource, options: InitializeOptions = {}) {
    const initializeGeneration = ++this.initializeGeneration
    this.remoteReadable?.close()
    this.remoteReadable = null
    this.chunkCoverage = []
    this.reader = null
    this.cursor.setReader(null)
    this.activePlotRequestIds.forEach(requestId => this.canceledPlotRequestIds.add(requestId))
    this.timelineGeneration++
    if (!this.decompressHandlers) {
      this.decompressHandlers = await loadDecompressHandlers()
    }
    if (initializeGeneration !== this.initializeGeneration) {
      throw new DOMException('MCAP initialization was canceled.', 'AbortError')
    }

    const readable = source.kind === 'local'
      ? new BlobReadable(source.file)
      : new CachedHttpReadable(source.url, {
          knownSize: source.knownSize,
          cacheSizeBytes: options.remoteCacheBytes,
        })
    if (source.kind === 'remote') {
      this.remoteReadable = readable as CachedHttpReadable
    }

    const reader = await McapIndexedReader.Initialize({
      readable,
      decompressHandlers: this.decompressHandlers,
    })
    if (initializeGeneration !== this.initializeGeneration) {
      if (source.kind === 'remote') {
        (readable as CachedHttpReadable).close()
      }
      throw new DOMException('MCAP initialization was canceled.', 'AbortError')
    }
    this.reader = reader
    this.chunkCoverage = source.kind === 'remote' ? buildChunkCoverage(reader) : []

    this.cursor.setReader(this.reader)

    // Reset tracking state
    this.lastTopics = []
    this.lastDispatchModes = ''
    this.lastEndTimeNs = -1n
    this.latestSeekGeneration = 0
    this.imageDeliveryModes.clear()

    // Extract schemas
    const schemasList = []
    for (const [id, schema] of this.reader.schemasById.entries()) {
      let dataText = ''
      if (schema.data) {
        try {
          dataText = new TextDecoder('utf-8').decode(schema.data)
        }
        catch {
          dataText = `[Binary data: ${schema.data.byteLength} bytes]`
        }
      }
      schemasList.push({
        id,
        name: schema.name,
        encoding: schema.encoding,
        dataText,
      })
    }

    // Channels
    const channelsList = []
    const stats = this.reader.statistics
    const channelCounts = new Map<number, number>()
    if (stats) {
      for (const [channelId, count] of stats.channelMessageCounts.entries()) {
        channelCounts.set(channelId, Number(count))
      }
    }

    for (const [id, ch] of this.reader.channelsById.entries()) {
      const schema = this.reader.schemasById.get(ch.schemaId)
      channelsList.push({
        id,
        topic: ch.topic,
        schemaId: ch.schemaId,
        schemaName: schema ? schema.name : undefined,
        messageCount: channelCounts.get(id) || 0,
      })
    }

    // Calculate start and end times from chunk indexes
    let startNs = -1n
    let endNs = -1n
    if (this.reader.chunkIndexes.length > 0) {
      for (const idx of this.reader.chunkIndexes) {
        if (startNs === -1n || idx.messageStartTime < startNs) {
          startNs = idx.messageStartTime
        }
        if (endNs === -1n || idx.messageEndTime > endNs) {
          endNs = idx.messageEndTime
        }
      }
    }

    if (startNs === -1n || endNs === -1n) {
      const msgIterator = this.reader.readMessages()
      for await (const msg of msgIterator) {
        const t = msg.logTime
        if (startNs === -1n || t < startNs) {
          startNs = t
        }
        if (endNs === -1n || t > endNs) {
          endNs = t
        }
      }
    }

    channelsList.sort((a, b) => a.topic.localeCompare(b.topic))
    const durationNs = endNs - startNs
    const frameIds = options.buildSpatialIndex === false
      ? []
      : await this.cursor.buildSpatialSeekIndex(endNs > -1n ? endNs : 0n)

    return {
      name: source.kind === 'local' ? source.file.name : source.name,
      size: source.kind === 'local' ? source.file.size : Number(await readable.size()),
      messageCount: stats ? Number(stats.messageCount) : 0,
      channels: channelsList,
      schemas: schemasList,
      durationNs: durationNs > 0n ? durationNs : 0n,
      startNs: startNs > -1n ? startNs : 0n,
      endNs: endNs > -1n ? endNs : 0n,
      frameIds,
    }
  }

  closeSource() {
    this.initializeGeneration++
    this.timelineGeneration++
    this.activePlotRequestIds.forEach(requestId => this.canceledPlotRequestIds.add(requestId))
    this.remoteReadable?.close()
    this.remoteReadable = null
    this.chunkCoverage = []
    this.reader = null
    this.cursor.setReader(null)
  }

  async getLoadProgress(): Promise<RemoteLoadProgress | null> {
    const readable = this.remoteReadable
    if (!readable) {
      return null
    }
    const downloadedByteRanges = readable.getDownloadedRanges()
    const totalBytes = Number(await readable.size())
    const downloadedBytes = readable.getDownloadedBytes()
    return {
      downloadedByteRanges,
      downloadedBytes,
      totalBytes,
      percent: totalBytes > 0 ? Math.min(100, (downloadedBytes / totalBytes) * 100) : 0,
      playableTimeRanges: getPlayableTimeRanges(this.chunkCoverage, downloadedByteRanges),
    }
  }

  async getMessages(
    startTimeNs: bigint,
    endTimeNs: bigint,
    topics: string[],
    dispatchModes: DispatchModeByTopic,
    processorsByTopic: MessageProcessorByTopic = {},
  ) {
    if (!this.reader) {
      return { messages: [], readThroughTimeNs: endTimeNs, hasMore: false }
    }

    // Check if subscription plan or sequence continuity has changed.
    const topicsChanged = this.lastTopics.length !== topics.length || !topics.every((t, i) => t === this.lastTopics[i])
    const dispatchModesKey = JSON.stringify(dispatchModes)
    const dispatchModesChanged = this.lastDispatchModes !== dispatchModesKey
    const timeJump = this.lastEndTimeNs === -1n || startTimeNs !== this.lastEndTimeNs

    if (topicsChanged || dispatchModesChanged || timeJump) {
      this.cursor.reset(startTimeNs, topics, 'placeholder')
      this.lastTopics = [...topics]
      this.lastDispatchModes = dispatchModesKey
    }

    const result = await this.cursor.drainUpTo(endTimeNs, dispatchModes, processorsByTopic)
    this.lastEndTimeNs = result.readThroughTimeNs
    return transfer(result, getTransferableBuffers(result.messages))
  }

  async getBackfillMessages(
    seekTimeNs: bigint,
    topics: string[],
    preservePlaybackCursor = false,
    seekGeneration?: number,
    phase: BackfillPhase = 'all',
    processorsByTopic: MessageProcessorByTopic = {},
  ) {
    if (!this.reader) {
      return []
    }

    if (seekGeneration !== undefined) {
      this.setSeekGeneration(seekGeneration)
    }
    const isCanceled = () => seekGeneration !== undefined && seekGeneration !== this.latestSeekGeneration
    const selectedTopics = phase === 'all'
      ? topics
      : topics.filter(topic => this.getBackfillClass(topic) === phase)

    const messages = await this.cursor.getBackfillMessages(
      seekTimeNs,
      selectedTopics,
      'placeholder',
      isCanceled,
      processorsByTopic,
    )
    if (isCanceled()) {
      return []
    }

    if (!preservePlaybackCursor && phase !== 'fast') {
      this.lastTopics = [...topics]
      this.lastDispatchModes = ''
      this.lastEndTimeNs = seekTimeNs
    }
    return transfer(messages, getTransferableBuffers(messages))
  }

  setSeekGeneration(generation: number) {
    if (generation > this.latestSeekGeneration) {
      this.latestSeekGeneration = generation
    }
  }

  private getBackfillClass(topic: string): BackfillClass {
    if (!this.reader) {
      return 'fast'
    }
    for (const channel of this.reader.channelsById.values()) {
      if (channel.topic !== topic) {
        continue
      }
      const schemaName = this.reader?.schemasById.get(channel.schemaId)?.name?.toLowerCase() || ''
      return getBackfillClass(topic, schemaName)
    }
    return 'fast'
  }

  async getFirstMessagePayload(topic: string) {
    if (!this.reader) {
      return null
    }
    const channel = Array.from(this.reader.channelsById.values()).find(ch => ch.topic === topic)
    if (!channel) {
      return null
    }

    const deserialize = this.cursor.getDeserializer(channel.id)
    const iterator = this.reader.readMessages({
      topics: [topic],
    })

    const next = await iterator.next()
    if (next.done) {
      return null
    }

    try {
      return deserialize(next.value.data)
    }
    catch {
      return null
    }
  }

  async getImageTopicDeliveryMode(topic: string): Promise<'all' | 'latest'> {
    if (!this.reader) {
      return 'latest'
    }
    const cached = this.imageDeliveryModes.get(topic)
    if (cached) {
      return cached
    }
    const channel = Array.from(this.reader.channelsById.values()).find(ch => ch.topic === topic)
    if (!channel) {
      return 'latest'
    }
    const iterator = this.reader.readMessages({ topics: [topic] })
    const next = await iterator.next()
    if (next.done) {
      return 'latest'
    }

    let mode: 'all' | 'latest' = 'latest'
    try {
      const payload = this.cursor.getDeserializer(next.value.channelId)(next.value.data)
      mode = isH264Format(payload?.format) ? 'all' : 'latest'
    }
    catch {
      // A malformed first frame should not force the expensive ordered path.
    }
    this.imageDeliveryModes.set(topic, mode)
    return mode
  }

  async getPlotSeriesData(
    requestId: number,
    requests: PlotSeriesRequest[],
    startTimeNs: bigint,
    endTimeNs: bigint,
    maxPoints = DEFAULT_MAX_PLOT_POINTS_PER_SERIES,
  ) {
    const reader = this.reader
    if (!reader || requests.length === 0) {
      return []
    }
    this.activePlotRequestIds.add(requestId)
    this.canceledPlotRequestIds.delete(requestId)
    const isCanceled = () => this.canceledPlotRequestIds.has(requestId)
    try {
      const requestsByTopic = new Map<string, Array<{
        accumulator: PlotSeriesAccumulator
        readValue: (payload: any) => number | null
      }>>()
      const accumulators: PlotSeriesAccumulator[] = []
      for (const request of requests) {
        const accumulator = new PlotSeriesAccumulator(
          request.id,
          startTimeNs,
          endTimeNs,
          maxPoints,
        )
        accumulators.push(accumulator)
        const topicRequests = requestsByTopic.get(request.topic) ?? []
        topicRequests.push({
          accumulator,
          readValue: createNumericValueAccessor(request.path),
        })
        requestsByTopic.set(request.topic, topicRequests)
      }

      const iterator = reader.readMessages({ topics: Array.from(requestsByTopic.keys()) })
      let sliceStart = performance.now()
      let sliceMessages = 0
      for await (const message of iterator) {
        if (isCanceled()) {
          return []
        }
        const topic = reader.channelsById.get(message.channelId)?.topic
        const topicRequests = topic ? requestsByTopic.get(topic) : undefined
        if (topicRequests) {
          try {
            const payload = this.cursor.getDeserializer(message.channelId)(message.data)
            for (const request of topicRequests) {
              const value = request.readValue(payload)
              if (value !== null) {
                request.accumulator.add(message.logTime, value)
              }
            }
          }
          catch {
            // Skip malformed packets and continue streaming the remaining data.
          }
        }

        sliceMessages++
        if (sliceMessages >= 2048 || performance.now() - sliceStart >= 8) {
          await yieldToEventLoop()
          sliceStart = performance.now()
          sliceMessages = 0
        }
      }

      if (isCanceled()) {
        return []
      }
      const result: PlotSeriesData[] = accumulators.map(accumulator => accumulator.finish())
      return transfer(
        result,
        result.flatMap(series => [series.times.buffer, series.values.buffer]),
      )
    }
    finally {
      this.activePlotRequestIds.delete(requestId)
      this.canceledPlotRequestIds.delete(requestId)
    }
  }

  cancelPlotSeriesData(requestId: number) {
    if (this.activePlotRequestIds.has(requestId)) {
      this.canceledPlotRequestIds.add(requestId)
    }
  }

  async getMessageTimelineData(startTimeNs: bigint, endTimeNs: bigint) {
    const reader = this.reader
    if (!reader) {
      return []
    }

    const generation = this.timelineGeneration
    const timelineData = await collectTimelineData({
      channels: reader.channelsById.values(),
      messages: reader.readMessages(),
      startTimeNs,
      endTimeNs,
      isCanceled: () => generation !== this.timelineGeneration,
    })

    return transfer(
      timelineData,
      timelineData.flatMap(topic => [
        topic.bucketStartTimes.buffer,
        topic.bucketEndTimes.buffer,
        topic.bucketCounts.buffer,
      ]),
    )
  }
}

expose(new McapWorker())
