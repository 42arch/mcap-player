import { parse } from '@foxglove/rosmsg'
import { MessageReader as Ros2Reader } from '@foxglove/rosmsg2-serialization'
import { MessageReader as Ros1Reader } from '@foxglove/rosmsg-serialization'
import { BlobReadable } from '@mcap/browser'
import { McapIndexedReader } from '@mcap/core'
import { loadDecompressHandlers } from '@mcap/support'
import { expose } from 'comlink'
import protobuf from 'protobufjs'
import 'protobufjs/ext/descriptor'

function sanitizePayload(value: any, binaryFormat: 'placeholder' | 'hex' | 'raw' = 'placeholder'): any {
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
    if (value.length > 128) {
      return `[Array: ${value.length} items (truncated)]`
    }
    return value.map(val => sanitizePayload(val, binaryFormat))
  }

  if (typeof value === 'object') {
    const res: any = {}
    for (const k of Object.keys(value)) {
      res[k] = sanitizePayload(value[k], binaryFormat)
    }
    return res
  }

  return value
}

class McapWorker {
  private reader: McapIndexedReader | null = null
  private decompressHandlers: any = null
  private deserializerCache = new Map<number, (data: Uint8Array) => any>()

  async initialize(file: File) {
    if (!this.decompressHandlers) {
      this.decompressHandlers = await loadDecompressHandlers()
    }
    const readable = new BlobReadable(file)
    this.reader = await McapIndexedReader.Initialize({
      readable,
      decompressHandlers: this.decompressHandlers,
    })

    this.deserializerCache.clear()

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

    return {
      name: file.name,
      size: file.size,
      messageCount: stats ? Number(stats.messageCount) : 0,
      channels: channelsList,
      schemas: schemasList,
      durationNs: durationNs > 0n ? durationNs : 0n,
      startNs: startNs > -1n ? startNs : 0n,
      endNs: endNs > -1n ? endNs : 0n,
    }
  }

  private getDeserializer(channelId: number) {
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
        const schemaText = new TextDecoder('utf-8').decode(schema.data)
        const parsedDefs = parse(schemaText)

        if (schema.encoding === 'ros1msg') {
          const reader = new Ros1Reader(parsedDefs)
          deserializer = data => reader.readMessage(data)
        }
        else if (schema.encoding === 'cdr' || schema.encoding === 'ros2msg') {
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

  async getMessages(
    startTimeNs: bigint,
    endTimeNs: bigint,
    topics: string[],
    binaryFormat: 'placeholder' | 'hex' | 'raw',
  ) {
    if (!this.reader) {
      return []
    }

    const messages = []
    const iterator = this.reader.readMessages({
      startTime: startTimeNs,
      endTime: endTimeNs,
      topics,
    })

    for await (const msg of iterator) {
      const channel = this.reader.channelsById.get(msg.channelId)
      if (!channel) {
        continue
      }

      const deserialize = this.getDeserializer(msg.channelId)
      let payload = null
      try {
        payload = sanitizePayload(deserialize(msg.data), binaryFormat)
      }
      catch (err: any) {
        payload = { error: err.message || 'Deserialization error' }
      }

      messages.push({
        topic: channel.topic,
        channelId: msg.channelId,
        logTime: msg.logTime,
        publishTime: msg.publishTime,
        sequence: msg.sequence,
        dataLength: msg.data.byteLength,
        payload,
      })
    }

    return messages
  }

  async getBackfillMessages(
    seekTimeNs: bigint,
    topics: string[],
    binaryFormat: 'placeholder' | 'hex' | 'raw',
  ) {
    if (!this.reader || topics.length === 0) {
      return []
    }

    const messages = []
    const topicsRemaining = new Set(topics)

    const iterator = this.reader.readMessages({
      endTime: seekTimeNs + 1n,
      topics,
      reverse: true,
    })

    for await (const msg of iterator) {
      const channel = this.reader.channelsById.get(msg.channelId)
      if (!channel) {
        continue
      }

      if (topicsRemaining.has(channel.topic)) {
        topicsRemaining.delete(channel.topic)

        const deserialize = this.getDeserializer(msg.channelId)
        let payload = null
        try {
          payload = sanitizePayload(deserialize(msg.data), binaryFormat)
        }
        catch (err: any) {
          payload = { error: err.message || 'Deserialization error' }
        }

        messages.push({
          topic: channel.topic,
          channelId: msg.channelId,
          logTime: msg.logTime,
          publishTime: msg.publishTime,
          sequence: msg.sequence,
          dataLength: msg.data.byteLength,
          payload,
        })

        if (topicsRemaining.size === 0) {
          break
        }
      }
    }

    return messages
  }
}

expose(new McapWorker())
