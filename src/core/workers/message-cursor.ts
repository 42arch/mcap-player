import type { McapIndexedReader } from '@mcap/core'
import { parse } from '@foxglove/rosmsg'
import { MessageReader as Ros2Reader } from '@foxglove/rosmsg2-serialization'
import { MessageReader as Ros1Reader } from '@foxglove/rosmsg-serialization'
import protobuf from 'protobufjs'
import { checkH264IsKeyframe, isH264Format } from '@/core/parsers/h264'
import 'protobufjs/ext/descriptor'

export interface DecodedMessage {
  topic: string
  channelId: number
  logTime: bigint
  publishTime: bigint
  sequence: number
  dataLength: number
  payload: any
}

export type DispatchMode = 'latest' | 'all'
export type DispatchModeByTopic = Record<string, DispatchMode>

interface BufferedMessage {
  message: any
  dataLength: number
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
    const data = payload?.data
    if (ArrayBuffer.isView(data) && data.buffer instanceof ArrayBuffer) {
      buffers.add(data.buffer)
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

  // Configuration
  private topics: string[] = []
  private binaryFormat: 'placeholder' | 'hex' | 'raw' = 'placeholder'

  // Deserializer cache
  private deserializerCache = new Map<number, (data: Uint8Array) => any>()

  setReader(reader: McapIndexedReader | null) {
    this.reader = reader
    this.clear()
    this.deserializerCache.clear()
  }

  clear() {
    this.queue = []
    this.totalBytes = 0
    this.iterator = null
    this.isPumping = false
    this.hasEnded = false
  }

  reset(startTimeNs: bigint, topics: string[], binaryFormat: 'placeholder' | 'hex' | 'raw') {
    this.clear()
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
    this.pump().catch(err => console.error('Error in background message pump:', err))
  }

  private async pump() {
    if (this.isPumping || this.hasEnded || !this.iterator) {
      return
    }
    this.isPumping = true

    try {
      while (
        this.iterator
        && this.queue.length < 500
        && this.totalBytes < 20 * 1024 * 1024
      ) {
        const next = await this.iterator.next()
        if (next.done) {
          this.hasEnded = true
          break
        }

        this.enqueue(next.value)
      }
    }
    catch (err) {
      console.error('Error pumping message in worker cursor:', err)
      this.hasEnded = true
    }
    finally {
      this.isPumping = false
    }
  }

  private decodeMessage(msg: any): DecodedMessage | null {
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
      payload = sanitizePayload(deserialize(msg.data), this.binaryFormat)
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

  async drainUpTo(endTimeNs: bigint, dispatchModes: DispatchModeByTopic): Promise<DecodedMessage[]> {
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

    return this.decodeReadyMessages(ready, dispatchModes)
  }

  private enqueue(message: any) {
    this.queue.push({
      message,
      dataLength: message.data.byteLength,
    })
    this.totalBytes += message.data.byteLength
  }

  private decodeReadyMessages(messages: BufferedMessage[], dispatchModes: DispatchModeByTopic): DecodedMessage[] {
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
      .map(message => this.decodeMessage(message))
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

  async getBackfillMessages(
    seekTimeNs: bigint,
    topics: string[],
    binaryFormat: 'placeholder' | 'hex' | 'raw',
    resetCursor = true,
  ): Promise<DecodedMessage[]> {
    // A seek replaces playback state; a newly opened panel can instead query
    // history without disturbing the shared forward playback cursor.
    if (resetCursor) {
      this.reset(seekTimeNs, topics, binaryFormat)
    }

    if (!this.reader || topics.length === 0) {
      return []
    }

    const messages: DecodedMessage[] = []
    const sceneUpdateTopics = topics.filter(topic => this.isSceneUpdateTopic(topic))
    const topicsRemaining = new Set(topics.filter(topic => !sceneUpdateTopics.includes(topic)))

    // SceneUpdate is a stateful stream. Replay its history up to the seek point
    // so a newly mounted layer can reconstruct entity additions and deletions.
    if (sceneUpdateTopics.length > 0) {
      const sceneIterator = this.reader.readMessages({
        endTime: seekTimeNs + 1n,
        topics: sceneUpdateTopics,
      })
      for await (const msg of sceneIterator) {
        const decoded = this.decodeMessage(msg)
        if (decoded) {
          messages.push(decoded)
        }
      }
    }

    if (topicsRemaining.size === 0) {
      return messages.sort((a, b) => a.logTime === b.logTime ? a.sequence - b.sequence : a.logTime < b.logTime ? -1 : 1)
    }

    // Query backward to get latest historical messages
    const backfillIterator = this.reader.readMessages({
      endTime: seekTimeNs + 1n,
      topics: Array.from(topicsRemaining),
      reverse: true,
    })

    const topicMessagesMap = new Map<string, DecodedMessage[]>()

    for await (const msg of backfillIterator) {
      const channel = this.reader.channelsById.get(msg.channelId)
      if (!channel) {
        continue
      }
      if (!topicsRemaining.has(channel.topic)) {
        continue
      }

      const decoded = this.decodeMessage(msg)
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

    return messages.sort((a, b) => a.logTime === b.logTime ? a.sequence - b.sequence : a.logTime < b.logTime ? -1 : 1)
  }
}
