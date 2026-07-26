import type { DispatchMode } from './message-cursor'
import { BlobReadable } from '@mcap/browser'
import { McapIndexedReader } from '@mcap/core'
import { loadDecompressHandlers } from '@mcap/support'
import { expose, transfer } from 'comlink'
import { getValueByPath } from '../../lib/value-extractor'
import { getTransferableBuffers, MessageCursor } from './message-cursor'

class McapWorker {
  private reader: McapIndexedReader | null = null
  private decompressHandlers: any = null
  private cursor = new MessageCursor()

  // Track cursor tracking state to detect jumps/changes
  private lastTopics: string[] = []
  private lastBinaryFormat = ''
  private lastEndTimeNs = -1n

  async initialize(file: File) {
    if (!this.decompressHandlers) {
      this.decompressHandlers = await loadDecompressHandlers()
    }
    const readable = new BlobReadable(file)
    this.reader = await McapIndexedReader.Initialize({
      readable,
      decompressHandlers: this.decompressHandlers,
    })

    this.cursor.setReader(this.reader)

    // Reset tracking state
    this.lastTopics = []
    this.lastBinaryFormat = ''
    this.lastEndTimeNs = -1n

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

  async getMessages(
    startTimeNs: bigint,
    endTimeNs: bigint,
    topics: string[],
    binaryFormat: 'placeholder' | 'hex' | 'raw',
    dispatchMode: DispatchMode,
  ) {
    if (!this.reader) {
      return []
    }

    // Check if topics, format, or sequence continuity has changed
    const topicsChanged = this.lastTopics.length !== topics.length || !topics.every((t, i) => t === this.lastTopics[i])
    const formatChanged = this.lastBinaryFormat !== binaryFormat
    const timeJump = this.lastEndTimeNs === -1n || startTimeNs !== this.lastEndTimeNs

    if (topicsChanged || formatChanged || timeJump) {
      this.cursor.reset(startTimeNs, topics, binaryFormat)
      this.lastTopics = [...topics]
      this.lastBinaryFormat = binaryFormat
    }

    this.lastEndTimeNs = endTimeNs
    const messages = await this.cursor.drainUpTo(endTimeNs, dispatchMode)
    return transfer(messages, getTransferableBuffers(messages))
  }

  async getBackfillMessages(
    seekTimeNs: bigint,
    topics: string[],
    binaryFormat: 'placeholder' | 'hex' | 'raw',
  ) {
    if (!this.reader) {
      return []
    }

    this.lastTopics = [...topics]
    this.lastBinaryFormat = binaryFormat
    this.lastEndTimeNs = seekTimeNs + 1n // Next tick query should start contiguous with backfill end

    const messages = await this.cursor.getBackfillMessages(seekTimeNs, topics, binaryFormat)
    return transfer(messages, getTransferableBuffers(messages))
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

  async getTopicFieldValues(topic: string, path: string, startNs: bigint) {
    if (!this.reader) {
      return { times: [], values: [] }
    }
    const channel = Array.from(this.reader.channelsById.values()).find(ch => ch.topic === topic)
    if (!channel) {
      return { times: [], values: [] }
    }

    const deserialize = this.cursor.getDeserializer(channel.id)
    const times: number[] = []
    const values: number[] = []

    const iterator = this.reader.readMessages({
      topics: [topic],
    })

    for await (const msg of iterator) {
      try {
        const payload = deserialize(msg.data)
        const val = getValueByPath(payload, path)
        if (val !== null) {
          times.push(Number(msg.logTime - startNs) / 1e9)
          values.push(val)
        }
      }
      catch {
        // Skip bad packets
      }
    }

    return { times, values }
  }
}

expose(new McapWorker())
