import type { McapIndexedReader } from '@mcap/core'
import type { SceneUpdateState } from '../parsers/scene-update-parser'
import type {
  BackfillCheckpoint,
} from './backfill-checkpoint-cache'
import type {
  TransformUpdateState,
} from './transform-state-accumulator'
import type { MessageProcessor, MessageProcessorByTopic } from '@/core/message-processing'
import { checkH264IsKeyframe, isH264Format } from '@/core/parsers/h264'
import { colorizePreparedPointCloud, preparePointCloud } from '@/core/parsers/point-cloud-parser'
import { createMessageDeserializer } from './message-decoders'
import { getSceneBackfillSnapshot } from './scene-backfill-service'
import {
  isSceneUpdateTopic,
  isSlowBackfillChannel,
  isTransformBackfillChannel,
  isTransformTopic,
} from './topic-classifier'
import {
  copyBinaryPayload,
  getTransferableBuffers,
  sanitizePayload,
} from './transferable-utils'
import { getTransformBackfillSnapshots } from './transform-backfill-service'
import {
  extractTransforms,
  normalizeFrameId,
} from './transform-state-accumulator'

export {
  copyBinaryPayload,
  getTransferableBuffers,
  isSlowBackfillChannel,
  isTransformBackfillChannel,
  sanitizePayload,
}

export interface DecodedMessage {
  topic: string
  channelId: number
  logTime: bigint
  publishTime: bigint
  sequence: number
  dataLength: number
  payload: any
  sceneSnapshot?: boolean
  transformSnapshot?: boolean
}

export type DispatchMode = 'latest' | 'all'
export type DispatchModeByTopic = Record<string, DispatchMode>

export interface MessageBatchResult {
  messages: DecodedMessage[]
  /** The next request must start here. The cursor preserves messages sharing this timestamp. */
  readThroughTimeNs: bigint
  /** True when the requested time range was stopped by a batch limit. */
  hasMore: boolean
}

function compareDecodedMessages(a: DecodedMessage, b: DecodedMessage): number {
  if (a.logTime !== b.logTime) {
    return a.logTime < b.logTime ? -1 : 1
  }
  if (a.transformSnapshot !== b.transformSnapshot) {
    return a.transformSnapshot ? -1 : 1
  }
  return a.sequence - b.sequence
}

interface BufferedMessage {
  message: any
  dataLength: number
}

const MAX_READ_AHEAD_MESSAGES = 1024
const MAX_READ_AHEAD_BYTES = 32 * 1024 * 1024
const MAX_BATCH_MESSAGES = 256
const MAX_BATCH_BYTES = 8 * 1024 * 1024
const MAX_BATCH_WALL_MS = 6

export class MessageCursor {
  private reader: McapIndexedReader | null = null
  // Keep raw MCAP messages in the read-ahead queue. Decoding is deferred until a
  // consumer asks for a time range, so a "latest" consumer does not deserialize
  // frames that will be discarded anyway.
  private queue: BufferedMessage[] = []
  private totalBytes = 0
  private iterator: any = null
  private isPumping = false
  private hasEnded = false
  private cursorGeneration = 0
  private queueWaiters = new Set<() => void>()

  // Configuration
  private topics: string[] = []
  private binaryFormat: 'placeholder' | 'hex' | 'raw' = 'placeholder'

  // Deserializer cache
  private deserializerCache = new Map<number, (data: Uint8Array) => any>()
  private sceneCheckpoints = new Map<string, BackfillCheckpoint<SceneUpdateState>[]>()
  private transformCheckpoints = new Map<string, BackfillCheckpoint<TransformUpdateState>[]>()
  private checkpointAccess = 0

  setReader(reader: McapIndexedReader | null) {
    this.reader = reader
    this.clear()
    this.deserializerCache.clear()
    this.sceneCheckpoints.clear()
    this.transformCheckpoints.clear()
    this.checkpointAccess = 0
  }

  clear() {
    this.cursorGeneration++
    const iterator = this.iterator
    this.queue = []
    this.totalBytes = 0
    this.iterator = null
    this.isPumping = false
    this.hasEnded = false
    this.notifyQueueWaiters()
    if (typeof iterator?.return === 'function') {
      void Promise.resolve(iterator.return()).catch((error: unknown) => {
        console.warn('Failed to close MCAP message iterator:', error)
      })
    }
  }

  reset(startTimeNs: bigint, topics: string[], binaryFormat: 'placeholder' | 'hex' | 'raw') {
    this.clear()
    const generation = this.cursorGeneration
    this.topics = topics
    this.binaryFormat = binaryFormat

    if (!this.reader || topics.length === 0) {
      this.hasEnded = true
      return
    }

    this.iterator = this.reader.readMessages({
      startTime: startTimeNs,
      topics: this.topics,
    })

    // Fire off asynchronous background pump
    this.pump(generation).catch(err => console.error('Error in background message pump:', err))
  }

  private async pump(generation = this.cursorGeneration) {
    if (this.isPumping || this.hasEnded || !this.iterator) {
      return
    }
    const iterator = this.iterator
    this.isPumping = true

    try {
      while (
        generation === this.cursorGeneration
        && iterator === this.iterator
        && this.queue.length < MAX_READ_AHEAD_MESSAGES
        && this.totalBytes < MAX_READ_AHEAD_BYTES
      ) {
        const next = await iterator.next()
        if (generation !== this.cursorGeneration || iterator !== this.iterator) {
          return
        }
        if (next.done) {
          this.hasEnded = true
          this.notifyQueueWaiters()
          break
        }

        this.enqueue(next.value)
        this.notifyQueueWaiters()
      }
    }
    catch (err) {
      if (generation !== this.cursorGeneration || iterator !== this.iterator) {
        return
      }
      console.error('Error pumping message in worker cursor:', err)
      this.hasEnded = true
      this.notifyQueueWaiters()
    }
    finally {
      if (generation === this.cursorGeneration) {
        this.isPumping = false
      }
    }
  }

  private decodeMessage(msg: any, processor?: MessageProcessor): DecodedMessage | null {
    if (!this.reader) {
      return null
    }
    const channel = this.reader.channelsById.get(msg.channelId)
    if (!channel) {
      return null
    }

    const deserialize = this.getDeserializer(msg.channelId)
    let payload = null
    try {
      const decodedPayload = deserialize(msg.data)
      const preparedPointCloud = processor?.type === 'point-cloud'
        ? preparePointCloud(decodedPayload, processor.maxPoints)
        : null
      const renderedPointCloud = preparedPointCloud && processor?.colorMode
        ? colorizePreparedPointCloud(
            preparedPointCloud,
            processor.colorMode,
            processor.solidColor,
          )
        : preparedPointCloud
      payload = renderedPointCloud ?? sanitizePayload(decodedPayload, this.binaryFormat)
    }
    catch (err: any) {
      payload = { error: err.message || 'Deserialization error' }
    }

    return {
      topic: channel.topic,
      channelId: msg.channelId,
      logTime: msg.logTime,
      publishTime: msg.publishTime,
      sequence: msg.sequence,
      dataLength: msg.data.byteLength,
      payload,
    }
  }

  getDeserializer(channelId: number) {
    if (!this.reader) {
      return (data: Uint8Array) => data
    }
    if (this.deserializerCache.has(channelId)) {
      return this.deserializerCache.get(channelId)!
    }

    const deserializer = createMessageDeserializer(this.reader, channelId)
    this.deserializerCache.set(channelId, deserializer)
    return deserializer
  }

  async drainUpTo(
    endTimeNs: bigint,
    dispatchModes: DispatchModeByTopic,
    processorsByTopic: MessageProcessorByTopic = {},
  ): Promise<MessageBatchResult> {
    const generation = this.cursorGeneration
    const batchStart = performance.now()
    const ready: BufferedMessage[] = []
    let readyBytes = 0
    let hitBatchLimit = false

    while (generation === this.cursorGeneration) {
      const next = this.queue[0]
      if (!next) {
        if (this.hasEnded || !this.iterator) {
          break
        }
        if (ready.length > 0) {
          hitBatchLimit = true
          break
        }
        void this.pump(generation).catch(err => console.error('Error replenishing background buffer:', err))
        await this.waitForQueue(generation)
        continue
      }

      if (next.message.logTime > endTimeNs) {
        break
      }

      const wouldExceedBytes = ready.length > 0 && readyBytes + next.dataLength > MAX_BATCH_BYTES
      const wallTimeExceeded = ready.length > 0 && performance.now() - batchStart >= MAX_BATCH_WALL_MS
      if (ready.length >= MAX_BATCH_MESSAGES || wouldExceedBytes || wallTimeExceeded) {
        hitBatchLimit = true
        break
      }

      this.queue.shift()
      this.totalBytes = Math.max(0, this.totalBytes - next.dataLength)
      ready.push(next)
      readyBytes += next.dataLength
    }

    void this.pump(generation).catch(err => console.error('Error replenishing background buffer:', err))

    const messages = this.decodeReadyMessages(ready, dispatchModes, processorsByTopic)
    const lastReadyTimeNs = ready.at(-1)?.message.logTime as bigint | undefined

    return {
      messages,
      readThroughTimeNs: hitBatchLimit && lastReadyTimeNs !== undefined
        ? lastReadyTimeNs
        : endTimeNs,
      hasMore: hitBatchLimit,
    }
  }

  private waitForQueue(generation: number): Promise<void> {
    if (
      generation !== this.cursorGeneration
      || this.queue.length > 0
      || this.hasEnded
      || !this.iterator
    ) {
      return Promise.resolve()
    }
    return new Promise<void>((resolve) => {
      this.queueWaiters.add(resolve)
    })
  }

  private notifyQueueWaiters() {
    const waiters = Array.from(this.queueWaiters)
    this.queueWaiters.clear()
    waiters.forEach(resolve => resolve())
  }

  private enqueue(message: any) {
    const data = copyBinaryPayload(message.data)
    this.queue.push({
      message: { ...message, data },
      dataLength: data.byteLength,
    })
    this.totalBytes += data.byteLength
  }

  private decodeReadyMessages(
    messages: BufferedMessage[],
    dispatchModes: DispatchModeByTopic,
    processorsByTopic: MessageProcessorByTopic,
  ): DecodedMessage[] {
    const rawMessages = messages.map(({ message }) => message)
    const latestByTopic = new Map<string, unknown>()
    for (const message of rawMessages) {
      const topic = this.reader?.channelsById.get(message.channelId)?.topic
      if (topic && dispatchModes[topic] === 'latest' && !this.isStatefulSpatialMessage(message)) {
        latestByTopic.set(topic, message)
      }
    }
    const selected = rawMessages.filter((message) => {
      const topic = this.reader?.channelsById.get(message.channelId)?.topic
      if (!topic || dispatchModes[topic] !== 'latest' || this.isStatefulSpatialMessage(message)) {
        return true
      }
      return latestByTopic.get(topic) === message
    })

    return selected
      .map((message) => {
        const topic = this.reader?.channelsById.get(message.channelId)?.topic
        return this.decodeMessage(message, topic ? processorsByTopic[topic] : undefined)
      })
      .filter((message): message is DecodedMessage => message !== null)
  }

  private isStatefulSpatialMessage(message: any): boolean {
    if (!this.reader) {
      return false
    }
    const channel = this.reader.channelsById.get(message.channelId)
    if (!channel) {
      return false
    }
    const schemaName = this.reader.schemasById.get(channel.schemaId)?.name?.toLowerCase() || ''
    return schemaName.includes('sceneupdate')
      || schemaName.includes('scene_update')
      || schemaName.includes('frametransform')
      || schemaName.includes('tfmessage')
  }

  async prewarmTransformCheckpoints(
    topics: readonly string[],
    endTimeNs: bigint,
    isCanceled: () => boolean = () => false,
  ): Promise<void> {
    if (!this.reader || topics.length === 0 || isCanceled()) {
      return
    }
    await getTransformBackfillSnapshots({
      reader: this.reader,
      topics,
      seekTimeNs: endTimeNs,
      transformCheckpoints: this.transformCheckpoints,
      getAccessCount: () => ++this.checkpointAccess,
      decodeMessage: rawMsg => this.decodeMessage(rawMsg),
      isCanceled,
      pinCheckpoints: true,
    })
  }

  /**
   * Reuses the load-time spatial scan to build exact, recording-wide seek
   * checkpoints. The previous implementation scanned all TF messages only for
   * frame IDs and discarded the accumulated state, forcing the first seek to
   * repeat the same work.
   */
  async buildSpatialSeekIndex(
    endTimeNs: bigint,
    isCanceled: () => boolean = () => false,
  ): Promise<string[]> {
    if (!this.reader || isCanceled()) {
      return []
    }

    const allTopics = Array.from(new Set(
      Array.from(this.reader.channelsById.values(), channel => channel.topic),
    ))
    const transformTopics = allTopics.filter(topic => isTransformTopic(this.reader, topic))
    const transformMessages = await getTransformBackfillSnapshots({
      reader: this.reader,
      topics: transformTopics,
      seekTimeNs: endTimeNs,
      transformCheckpoints: this.transformCheckpoints,
      getAccessCount: () => ++this.checkpointAccess,
      decodeMessage: rawMsg => this.decodeMessage(rawMsg),
      isCanceled,
      pinCheckpoints: true,
    })
    if (isCanceled()) {
      return []
    }

    const frameIds = new Set<string>()
    for (const message of transformMessages) {
      for (const transform of extractTransforms(message.payload)) {
        const parent = normalizeFrameId(transform.parentFrameId)
        const child = normalizeFrameId(transform.childFrameId)
        if (parent) {
          frameIds.add(parent)
        }
        if (child) {
          frameIds.add(child)
        }
      }
    }

    const sceneTopics = allTopics.filter(topic => isSceneUpdateTopic(this.reader, topic))
    for (const topic of sceneTopics) {
      await getSceneBackfillSnapshot({
        reader: this.reader,
        topic,
        seekTimeNs: endTimeNs,
        sceneCheckpoints: this.sceneCheckpoints,
        getAccessCount: () => ++this.checkpointAccess,
        decodeMessage: rawMsg => this.decodeMessage(rawMsg),
        isCanceled,
        pinCheckpoints: true,
      })
      if (isCanceled()) {
        return []
      }
    }

    return Array.from(frameIds).sort()
  }

  async getBackfillMessages(
    seekTimeNs: bigint,
    topics: string[],
    binaryFormat: 'placeholder' | 'hex' | 'raw',
    isCanceled: () => boolean = () => false,
    processorsByTopic: MessageProcessorByTopic = {},
  ): Promise<DecodedMessage[]> {
    if (!this.reader || topics.length === 0 || isCanceled()) {
      return []
    }
    this.binaryFormat = binaryFormat

    const messages: DecodedMessage[] = []
    const sceneUpdateTopics = topics.filter(topic => isSceneUpdateTopic(this.reader, topic))
    const transformTopics = topics.filter(topic => isTransformTopic(this.reader, topic))
    const statefulTopics = new Set([...sceneUpdateTopics, ...transformTopics])
    const topicsRemaining = new Set(topics.filter(topic => !statefulTopics.has(topic)))

    // Rebuild SceneUpdate state in the worker and return one full replacement
    // instead of transferring every historical mutation to the main thread.
    for (const topic of sceneUpdateTopics) {
      messages.push(...await getSceneBackfillSnapshot({
        reader: this.reader,
        topic,
        seekTimeNs,
        sceneCheckpoints: this.sceneCheckpoints,
        getAccessCount: () => ++this.checkpointAccess,
        decodeMessage: rawMsg => this.decodeMessage(rawMsg),
        isCanceled,
      }))
      if (isCanceled()) {
        return []
      }
    }

    const transformMessages = await getTransformBackfillSnapshots({
      reader: this.reader,
      topics: transformTopics,
      seekTimeNs,
      transformCheckpoints: this.transformCheckpoints,
      getAccessCount: () => ++this.checkpointAccess,
      decodeMessage: rawMsg => this.decodeMessage(rawMsg),
      isCanceled,
    })
    if (transformMessages.length > 0) {
      transformMessages[0].transformSnapshot = true
      messages.push(...transformMessages)
    }

    if (topicsRemaining.size === 0) {
      return messages.sort(compareDecodedMessages)
    }

    // Calculate a tight startTime using chunkIndexes to prevent scanning all chunks backward over HTTP
    let minBackfillStartTimeNs: bigint | undefined
    if (this.reader.chunkIndexes && this.reader.chunkIndexes.length > 0) {
      const targetChannelIdsByTopic = new Map<string, number[]>()
      for (const [chId, channel] of this.reader.channelsById) {
        if (topicsRemaining.has(channel.topic)) {
          if (!targetChannelIdsByTopic.has(channel.topic)) {
            targetChannelIdsByTopic.set(channel.topic, [])
          }
          targetChannelIdsByTopic.get(channel.topic)!.push(chId)
        }
      }

      let earliestChunkStartTime: bigint | undefined
      for (const [topic, channelIds] of targetChannelIdsByTopic.entries()) {
        let topicChunkStartTime: bigint | undefined
        for (let i = this.reader.chunkIndexes.length - 1; i >= 0; i--) {
          const chunk = this.reader.chunkIndexes[i]
          if (chunk.messageStartTime <= seekTimeNs) {
            const hasChannel = channelIds.some(chId => chunk.messageIndexOffsets.has(chId))
            if (hasChannel) {
              topicChunkStartTime = chunk.messageStartTime
              break
            }
          }
        }
        if (topicChunkStartTime !== undefined) {
          if (earliestChunkStartTime === undefined || topicChunkStartTime < earliestChunkStartTime) {
            earliestChunkStartTime = topicChunkStartTime
          }
        }
      }
      if (earliestChunkStartTime !== undefined) {
        minBackfillStartTimeNs = earliestChunkStartTime
      }
    }

    // Query backward to get latest historical messages
    const backfillIterator = this.reader.readMessages({
      ...(minBackfillStartTimeNs !== undefined ? { startTime: minBackfillStartTimeNs } : {}),
      endTime: seekTimeNs + 1n,
      topics: Array.from(topicsRemaining),
      reverse: true,
    })

    const topicMessagesMap = new Map<string, DecodedMessage[]>()

    for await (const msg of backfillIterator) {
      if (isCanceled()) {
        return []
      }
      const channel = this.reader.channelsById.get(msg.channelId)
      if (!channel) {
        continue
      }
      if (!topicsRemaining.has(channel.topic)) {
        continue
      }

      const decoded = this.decodeMessage(msg, processorsByTopic[channel.topic])
      if (!decoded) {
        continue
      }

      if (!topicMessagesMap.has(channel.topic)) {
        topicMessagesMap.set(channel.topic, [])
      }
      const list = topicMessagesMap.get(channel.topic)!

      const payload = decoded.payload
      const isCompressed = payload && payload.format !== undefined && payload.data !== undefined
      const isH264 = isCompressed && isH264Format(payload.format)

      list.push(decoded)

      if (!isH264) {
        // Standard topic: 1 message is sufficient
        topicsRemaining.delete(channel.topic)
      }
      else {
        // H.264 topic: continue backfilling until Keyframe (IDR/SPS) is found
        const uint8 = payload.data instanceof Uint8Array ? payload.data : new Uint8Array(payload.data)
        const isKey = checkH264IsKeyframe(uint8)
        if (isKey || list.length >= 120) {
          topicsRemaining.delete(channel.topic)
        }
      }

      if (topicsRemaining.size === 0) {
        break
      }
    }

    // Sort per-topic backfill messages chronologically (Keyframe first -> Delta frames -> Seek frame)
    for (const list of topicMessagesMap.values()) {
      list.reverse()
      messages.push(...list)
    }

    if (isCanceled()) {
      return []
    }
    return messages.sort(compareDecodedMessages)
  }
}
