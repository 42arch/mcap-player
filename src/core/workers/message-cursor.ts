import type { McapIndexedReader } from '@mcap/core'
import { parse } from '@foxglove/rosmsg'
import { MessageReader as Ros2Reader } from '@foxglove/rosmsg2-serialization'
import { MessageReader as Ros1Reader } from '@foxglove/rosmsg-serialization'
import protobuf from 'protobufjs'
import type { MessageProcessor, MessageProcessorByTopic } from '@/core/message-processing'
import { checkH264IsKeyframe, isH264Format } from '@/core/parsers/h264'
import { preparePointCloud } from '@/core/parsers/point-cloud-parser'
import { SceneUpdateState } from '@/core/parsers/scene-update-parser'
import 'protobufjs/ext/descriptor'

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

export function isSlowBackfillChannel(topic: string, schemaName: string): boolean {
  const normalizedTopic = topic.toLowerCase()
  const normalizedSchema = schemaName.toLowerCase()
  return normalizedTopic === '/tf'
    || normalizedTopic === '/tf_static'
    || normalizedSchema.includes('sceneupdate')
    || normalizedSchema.includes('scene_update')
    || normalizedSchema.includes('frametransform')
    || normalizedSchema.includes('frame_transform')
    || normalizedSchema.includes('tfmessage')
    || normalizedSchema.includes('tf_message')
    || normalizedSchema.includes('compressedimage')
    || normalizedSchema.includes('compressed_image')
    || normalizedSchema.includes('compressedvideo')
    || normalizedSchema.includes('compressed_video')
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

interface BackfillCheckpoint<T> {
  timeNs: bigint
  resumeTimeNs: bigint
  state: T
  lastMessage: DecodedMessage
  lastUsed: number
}

const STATE_CHECKPOINT_INTERVAL_NS = 30_000_000_000n
const MAX_STATE_CHECKPOINTS_PER_TOPIC = 64
const MAX_READ_AHEAD_MESSAGES = 64
const MAX_READ_AHEAD_BYTES = 8 * 1024 * 1024

function getSingleTransformChildFrame(payload: any): string {
  const value = payload?.child_frame_id || payload?.childFrameId
  return typeof value === 'string' ? value : ''
}

function getBatchTransformChildFrame(transform: any): string {
  const value = transform?.child_frame_id || transform?.childFrameId
  return typeof value === 'string' ? value : ''
}

class TransformUpdateState {
  private transformsByChild = new Map<string, any>()
  private batchTemplate: any = null
  private usesBatchPayload = false

  clone(): TransformUpdateState {
    const clone = new TransformUpdateState()
    clone.transformsByChild = new Map(this.transformsByChild)
    clone.batchTemplate = this.batchTemplate
    clone.usesBatchPayload = this.usesBatchPayload
    return clone
  }

  apply(payload: any): void {
    const singleChild = getSingleTransformChildFrame(payload)
    if (singleChild) {
      this.transformsByChild.set(singleChild, payload)
      return
    }
    if (!Array.isArray(payload?.transforms)) {
      return
    }
    this.usesBatchPayload = true
    this.batchTemplate = payload
    for (const transform of payload.transforms) {
      const child = getBatchTransformChildFrame(transform)
      if (child) {
        this.transformsByChild.set(child, transform)
      }
    }
  }

  toSnapshotMessages(lastMessage: DecodedMessage, seekTimeNs: bigint): DecodedMessage[] {
    if (this.usesBatchPayload) {
      return [{
        ...lastMessage,
        logTime: seekTimeNs,
        publishTime: seekTimeNs,
        dataLength: 0,
        payload: {
          ...this.batchTemplate,
          transforms: Array.from(this.transformsByChild.values()),
        },
      }]
    }

    const transforms = Array.from(this.transformsByChild.values())
    if (transforms.length === 0) {
      return [{
        ...lastMessage,
        logTime: seekTimeNs,
        publishTime: seekTimeNs,
        dataLength: 0,
      }]
    }
    return transforms.map((payload, index) => ({
      ...lastMessage,
      logTime: seekTimeNs,
      publishTime: seekTimeNs,
      sequence: lastMessage.sequence + index,
      dataLength: 0,
      payload,
    }))
  }
}

export function copyBinaryPayload(value: ArrayBufferView): Uint8Array {
  const source = new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  const copy = new Uint8Array(source.byteLength)
  copy.set(source)
  return copy
}

export function getTransferableBuffers(messages: readonly DecodedMessage[]): ArrayBuffer[] {
  const buffers = new Set<ArrayBuffer>()

  for (const { payload } of messages) {
    for (const value of [payload?.data, payload?.positions, payload?.intensities]) {
      if (ArrayBuffer.isView(value) && value.buffer instanceof ArrayBuffer) {
        buffers.add(value.buffer)
      }
    }
  }

  return Array.from(buffers)
}

export function selectLatestMessages<T>(
  messages: readonly T[],
  getTopic: (message: T) => string | undefined,
): T[] {
  const latestByTopic = new Map<string, T>()
  for (const message of messages) {
    const topic = getTopic(message)
    if (topic) {
      latestByTopic.set(topic, message)
    }
  }
  return Array.from(latestByTopic.values())
}

/**
 * Point clouds can keep only their latest sample, but stateful spatial messages
 * (for example SceneUpdate and TF) must be applied in order.
 */
export function selectLatestWithSceneUpdates<T>(
  messages: readonly T[],
  getTopic: (message: T) => string | undefined,
  isSceneUpdate: (message: T) => boolean,
): T[] {
  const latestByTopic = new Map<string, T>()
  for (const message of messages) {
    if (isSceneUpdate(message)) {
      continue
    }
    const topic = getTopic(message)
    if (topic) {
      latestByTopic.set(topic, message)
    }
  }

  return messages.filter((message) => {
    if (isSceneUpdate(message)) {
      return true
    }
    const topic = getTopic(message)
    return topic !== undefined && latestByTopic.get(topic) === message
  })
}

export function sanitizePayload(value: any, binaryFormat: 'placeholder' | 'hex' | 'raw' = 'placeholder'): any {
  if (value === null || value === undefined) {
    return value
  }

  if (ArrayBuffer.isView(value)) {
    const len = value.byteLength
    const uint8 = new Uint8Array(value.buffer, value.byteOffset, value.byteLength)

    if (binaryFormat === 'hex') {
      const hexLen = Math.min(len, 64)
      const bytes = uint8.subarray(0, hexLen)
      const hexStr = Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join(' ')
      return `<${value.constructor.name}: ${len} bytes [hex: ${hexStr}${len > 64 ? ' ...' : ''}]>`
    }
    else if (binaryFormat === 'raw') {
      const rawLen = Math.min(len, 64)
      const bytes = uint8.subarray(0, rawLen)
      const rawStr = Array.from(bytes).join(', ')
      return `<${value.constructor.name}: ${len} bytes [values: ${rawStr}${len > 64 ? ' ...' : ''}]>`
    }
    else {
      return `<${value.constructor.name}: ${len} bytes>`
    }
  }

  if (Array.isArray(value)) {
    // Do not truncate scene entities/markers array
    if (value.length > 512) {
      return `[Array: ${value.length} items (truncated)]`
    }
    return value.map(val => sanitizePayload(val, binaryFormat))
  }

  if (typeof value === 'object') {
    const isImage = value.width !== undefined && value.height !== undefined && value.encoding !== undefined && value.data !== undefined
    const isCompressedImage = value.format !== undefined && value.data !== undefined
    const isPointCloud = (value.point_step !== undefined || value.point_stride !== undefined || value.fields !== undefined) && value.data !== undefined
    const isSceneUpdate = value.entities !== undefined || value.cubes !== undefined || value.models !== undefined
    const isGrid = (value.column_count !== undefined || value.columnCount !== undefined)
      && (value.row_stride !== undefined || value.rowStride !== undefined)
      && (value.cell_stride !== undefined || value.cellStride !== undefined)
      && value.data !== undefined

    const res: any = {}
    for (const k of Object.keys(value)) {
      if ((isImage || isCompressedImage || isPointCloud || isSceneUpdate || isGrid) && k === 'data') {
        // The deserializer can return a view into a reader-owned buffer. Copy it
        // before transferring ownership to the main thread so the reader remains
        // usable for later seeks and reads.
        res[k] = ArrayBuffer.isView(value[k])
          ? copyBinaryPayload(value[k])
          : value[k]
      }
      else {
        res[k] = sanitizePayload(value[k], binaryFormat)
      }
    }
    return res
  }

  return value
}

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
    this.queue = []
    this.totalBytes = 0
    this.iterator = null
    this.isPumping = false
    this.hasEnded = false
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
          break
        }

        this.enqueue(next.value)
      }
    }
    catch (err) {
      if (generation !== this.cursorGeneration || iterator !== this.iterator) {
        return
      }
      console.error('Error pumping message in worker cursor:', err)
      this.hasEnded = true
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
      payload = preparedPointCloud ?? sanitizePayload(decodedPayload, this.binaryFormat)
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

    const channel = this.reader.channelsById.get(channelId)
    if (!channel) {
      return (data: Uint8Array) => data
    }

    const schema = this.reader.schemasById.get(channel.schemaId)
    if (!schema) {
      const fallback = (data: Uint8Array) => ({
        hex: Array.from(data.subarray(0, 32))
          .map(b => b.toString(16).padStart(2, '0'))
          .join(' '),
      })
      this.deserializerCache.set(channelId, fallback)
      return fallback
    }

    let deserializer: (data: Uint8Array) => any = data => data

    try {
      if (schema.encoding === 'protobuf') {
        const root = protobuf.Root.fromDescriptor(schema.data)
        const type = root.lookupType(schema.name)
        deserializer = (data) => {
          const decoded = type.decode(data)
          return type.toObject(decoded, {
            longs: String,
            enums: String,
            bytes: Object,
          })
        }
      }
      else if (schema.encoding === 'json') {
        const decoder = new TextDecoder('utf-8')
        deserializer = (data) => {
          try {
            return JSON.parse(decoder.decode(data))
          }
          catch {
            return { error: 'Failed to parse JSON message' }
          }
        }
      }
      else {
        const schemaText = new TextDecoder().decode(schema.data)

        if (schema.encoding === 'ros1msg') {
          const parsedDefs = parse(schemaText)
          const reader = new Ros1Reader(parsedDefs)
          deserializer = data => reader.readMessage(data)
        }
        else if (schema.encoding === 'cdr' || schema.encoding === 'ros2msg') {
          const parsedDefs = parse(schemaText, { ros2: true })
          const reader = new Ros2Reader(parsedDefs)
          deserializer = data => reader.readMessage(data)
        }
      }
    }
    catch (e) {
      console.error('Failed to parse or compile schema:', e)
      deserializer = data => ({
        error: 'Deserialization failed',
        hex: Array.from(data.subarray(0, 32))
          .map(b => b.toString(16).padStart(2, '0'))
          .join(' '),
      })
    }

    this.deserializerCache.set(channelId, deserializer)
    return deserializer
  }

  async drainUpTo(
    endTimeNs: bigint,
    dispatchModes: DispatchModeByTopic,
    processorsByTopic: MessageProcessorByTopic = {},
  ): Promise<DecodedMessage[]> {
    // If the pump hasn't read up to endTimeNs yet, and we haven't hit the end of the file,
    // block and pump synchronously until we reach endTimeNs or the file ends.
    while (
      !this.hasEnded
      && this.iterator
      && (this.queue.length === 0 || this.queue[this.queue.length - 1].message.logTime < endTimeNs)
    ) {
      const next = await this.iterator.next()
      if (next.done) {
        this.hasEnded = true
        break
      }
      this.enqueue(next.value)
    }

    // Extract raw messages first. For visual panels, collapse each topic before
    // deserializing it or crossing the Worker boundary.
    const ready: BufferedMessage[] = []
    let i = 0
    while (i < this.queue.length) {
      if (this.queue[i].message.logTime <= endTimeNs) {
        ready.push(this.queue[i])
        this.totalBytes -= this.queue[i].dataLength
        i++
      }
      else {
        break
      }
    }

    if (i > 0) {
      this.queue = this.queue.slice(i)
    }

    // Re-trigger background pump asynchronously to top up the buffer
    this.pump().catch(err => console.error('Error replenishing background buffer:', err))

    return this.decodeReadyMessages(ready, dispatchModes, processorsByTopic)
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

  private isSceneUpdateTopic(topic: string): boolean {
    if (!this.reader) {
      return false
    }
    return Array.from(this.reader.channelsById.values()).some((channel) => {
      if (channel.topic !== topic) {
        return false
      }
      const schemaName = this.reader?.schemasById.get(channel.schemaId)?.name?.toLowerCase() || ''
      return schemaName.includes('sceneupdate') || schemaName.includes('scene_update')
    })
  }

  private isTransformTopic(topic: string): boolean {
    if (!this.reader) {
      return false
    }
    const normalizedTopic = topic.toLowerCase()
    if (normalizedTopic === '/tf' || normalizedTopic === '/tf_static') {
      return true
    }
    return Array.from(this.reader.channelsById.values()).some((channel) => {
      if (channel.topic !== topic) {
        return false
      }
      const schemaName = this.reader?.schemasById.get(channel.schemaId)?.name?.toLowerCase() || ''
      return schemaName.includes('frametransform')
        || schemaName.includes('frame_transform')
        || schemaName.includes('tfmessage')
        || schemaName.includes('tf_message')
    })
  }

  private findCheckpoint<T>(
    cache: Map<string, BackfillCheckpoint<T>[]>,
    topic: string,
    seekTimeNs: bigint,
  ): BackfillCheckpoint<T> | undefined {
    let nearest: BackfillCheckpoint<T> | undefined
    for (const checkpoint of cache.get(topic) || []) {
      if (
        checkpoint.timeNs <= seekTimeNs
        && (!nearest || checkpoint.timeNs > nearest.timeNs)
      ) {
        nearest = checkpoint
      }
    }
    if (nearest) {
      nearest.lastUsed = ++this.checkpointAccess
    }
    return nearest
  }

  private storeCheckpoint<T>(
    cache: Map<string, BackfillCheckpoint<T>[]>,
    topic: string,
    checkpoint: Omit<BackfillCheckpoint<T>, 'lastUsed'>,
  ): void {
    let checkpoints = cache.get(topic)
    if (!checkpoints) {
      checkpoints = []
      cache.set(topic, checkpoints)
    }
    const existingIndex = checkpoints.findIndex(item => item.timeNs === checkpoint.timeNs)
    const next = { ...checkpoint, lastUsed: ++this.checkpointAccess }
    if (existingIndex >= 0) {
      checkpoints[existingIndex] = next
      return
    }
    checkpoints.push(next)
    if (checkpoints.length <= MAX_STATE_CHECKPOINTS_PER_TOPIC) {
      return
    }
    let leastRecentlyUsedIndex = 0
    for (let index = 1; index < checkpoints.length; index++) {
      if (checkpoints[index].lastUsed < checkpoints[leastRecentlyUsedIndex].lastUsed) {
        leastRecentlyUsedIndex = index
      }
    }
    checkpoints.splice(leastRecentlyUsedIndex, 1)
  }

  private async getSceneBackfillSnapshot(
    topic: string,
    seekTimeNs: bigint,
    isCanceled: () => boolean,
  ): Promise<DecodedMessage[]> {
    if (!this.reader) {
      return []
    }
    const checkpoint = this.findCheckpoint(this.sceneCheckpoints, topic, seekTimeNs)
    const state = checkpoint?.state.clone() || new SceneUpdateState()
    let lastMessage = checkpoint?.lastMessage
    let lastCheckpointTimeNs = checkpoint?.timeNs
    const iterator = this.reader.readMessages({
      ...(checkpoint ? { startTime: checkpoint.resumeTimeNs } : {}),
      endTime: seekTimeNs + 1n,
      topics: [topic],
    })

    for await (const rawMessage of iterator) {
      if (isCanceled()) {
        return []
      }
      const decoded = this.decodeMessage(rawMessage)
      if (!decoded) {
        continue
      }
      if (
        lastMessage
        && lastCheckpointTimeNs !== undefined
        && decoded.logTime > lastMessage.logTime
        && decoded.logTime - lastCheckpointTimeNs >= STATE_CHECKPOINT_INTERVAL_NS
      ) {
        const boundaryTimeNs = decoded.logTime > 0n ? decoded.logTime - 1n : 0n
        this.storeCheckpoint(this.sceneCheckpoints, topic, {
          timeNs: boundaryTimeNs,
          resumeTimeNs: decoded.logTime,
          state: state.clone(),
          lastMessage,
        })
        lastCheckpointTimeNs = boundaryTimeNs
      }
      state.applyMutation(decoded.payload, decoded.logTime)
      lastMessage = decoded
      lastCheckpointTimeNs ??= decoded.logTime
    }

    if (!lastMessage || isCanceled()) {
      return []
    }
    state.advanceTo(seekTimeNs)
    this.storeCheckpoint(this.sceneCheckpoints, topic, {
      timeNs: seekTimeNs,
      resumeTimeNs: seekTimeNs + 1n,
      state: state.clone(),
      lastMessage,
    })
    return [{
      ...lastMessage,
      logTime: seekTimeNs,
      publishTime: seekTimeNs,
      dataLength: 0,
      payload: state.toFullUpdate(seekTimeNs),
      sceneSnapshot: true,
    }]
  }

  private async getTransformBackfillSnapshot(
    topic: string,
    seekTimeNs: bigint,
    isCanceled: () => boolean,
  ): Promise<DecodedMessage[]> {
    if (!this.reader) {
      return []
    }
    const checkpoint = this.findCheckpoint(this.transformCheckpoints, topic, seekTimeNs)
    const state = checkpoint?.state.clone() || new TransformUpdateState()
    let lastMessage = checkpoint?.lastMessage
    let lastCheckpointTimeNs = checkpoint?.timeNs
    const iterator = this.reader.readMessages({
      ...(checkpoint ? { startTime: checkpoint.resumeTimeNs } : {}),
      endTime: seekTimeNs + 1n,
      topics: [topic],
    })

    for await (const rawMessage of iterator) {
      if (isCanceled()) {
        return []
      }
      const decoded = this.decodeMessage(rawMessage)
      if (!decoded) {
        continue
      }
      if (
        lastMessage
        && lastCheckpointTimeNs !== undefined
        && decoded.logTime > lastMessage.logTime
        && decoded.logTime - lastCheckpointTimeNs >= STATE_CHECKPOINT_INTERVAL_NS
      ) {
        const boundaryTimeNs = decoded.logTime > 0n ? decoded.logTime - 1n : 0n
        this.storeCheckpoint(this.transformCheckpoints, topic, {
          timeNs: boundaryTimeNs,
          resumeTimeNs: decoded.logTime,
          state: state.clone(),
          lastMessage,
        })
        lastCheckpointTimeNs = boundaryTimeNs
      }
      state.apply(decoded.payload)
      lastMessage = decoded
      lastCheckpointTimeNs ??= decoded.logTime
    }

    if (!lastMessage || isCanceled()) {
      return []
    }
    this.storeCheckpoint(this.transformCheckpoints, topic, {
      timeNs: seekTimeNs,
      resumeTimeNs: seekTimeNs + 1n,
      state: state.clone(),
      lastMessage,
    })
    return state.toSnapshotMessages(lastMessage, seekTimeNs)
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
    const sceneUpdateTopics = topics.filter(topic => this.isSceneUpdateTopic(topic))
    const transformTopics = topics.filter(topic => this.isTransformTopic(topic))
    const statefulTopics = new Set([...sceneUpdateTopics, ...transformTopics])
    const topicsRemaining = new Set(topics.filter(topic => !statefulTopics.has(topic)))

    // Rebuild SceneUpdate state in the worker and return one full replacement
    // instead of transferring every historical mutation to the main thread.
    for (const topic of sceneUpdateTopics) {
      messages.push(...await this.getSceneBackfillSnapshot(topic, seekTimeNs, isCanceled))
      if (isCanceled()) {
        return []
      }
    }

    const transformMessages: DecodedMessage[] = []
    for (const topic of transformTopics) {
      transformMessages.push(...await this.getTransformBackfillSnapshot(topic, seekTimeNs, isCanceled))
      if (isCanceled()) {
        return []
      }
    }
    if (transformMessages.length > 0) {
      transformMessages[0].transformSnapshot = true
      messages.push(...transformMessages)
    }

    if (topicsRemaining.size === 0) {
      return messages.sort(compareDecodedMessages)
    }

    // Query backward to get latest historical messages
    const backfillIterator = this.reader.readMessages({
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
