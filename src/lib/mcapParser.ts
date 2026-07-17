import type { McapChannel, McapFileSummary, McapMessage, McapSchema } from '@/stores/usePlayerStore'
import { BlobReadable } from '@mcap/browser'
import { McapIndexedReader } from '@mcap/core'
import { loadDecompressHandlers } from '@mcap/support'

export async function parseMcapFile(
  file: File,
  onProgress: (stage: string) => void,
): Promise<McapFileSummary> {
  onProgress('Initializing decompression handlers...')
  const decompressHandlers = await loadDecompressHandlers()

  onProgress('Reading MCAP metadata...')
  const readable = new BlobReadable(file)
  const reader = await McapIndexedReader.Initialize({
    readable,
    decompressHandlers,
  })

  onProgress('Parsing channels and schemas...')
  const channelsMap = reader.channelsById
  const schemasMap = reader.schemasById

  const schemasList: McapSchema[] = []
  for (const [id, schema] of schemasMap.entries()) {
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

  const channelsList: McapChannel[] = []
  const channelCounts = new Map<number, number>()
  for (const id of channelsMap.keys()) {
    channelCounts.set(id, 0)
  }

  onProgress('Scanning messages...')
  const messagesPreview: McapMessage[] = []
  let totalMessagesCount = 0
  let startNs = -1n
  let endNs = -1n

  const messageIterator = reader.readMessages()
  for await (const msg of messageIterator) {
    totalMessagesCount++
    const chId = msg.channelId
    channelCounts.set(chId, (channelCounts.get(chId) || 0) + 1)

    const logTime = msg.logTime
    if (startNs === -1n || logTime < startNs) {
      startNs = logTime
    }
    if (endNs === -1n || logTime > endNs) {
      endNs = logTime
    }

    if (messagesPreview.length < 100) {
      const channel = channelsMap.get(chId)
      const topic = channel ? channel.topic : `Unknown (${chId})`

      let hexPreview = ''
      let textPreview = ''
      if (msg.data.byteLength > 0) {
        const len = Math.min(msg.data.byteLength, 64)
        const bytes = msg.data.subarray(0, len)
        hexPreview = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' ')
        if (msg.data.byteLength > 64)
          hexPreview += ' ...'

        try {
          const decoded = new TextDecoder('utf-8', { fatal: true }).decode(msg.data.subarray(0, 256))
          // eslint-disable-next-line no-control-regex
          const hasNonPrintable = /[\x00-\x08\v\f\x0E-\x1F]/.test(decoded)
          if (!hasNonPrintable) {
            textPreview = decoded.slice(0, 256)
            if (msg.data.byteLength > 256)
              textPreview += ' ...'
          }
        }
        catch {
          // ignore decoding errors
        }
      }

      messagesPreview.push({
        topic,
        channelId: chId,
        logTime: msg.logTime,
        publishTime: msg.publishTime,
        sequence: msg.sequence,
        dataLength: msg.data.byteLength,
        data: msg.data,
        hexPreview,
        textPreview,
      })
    }
  }

  for (const [id, ch] of channelsMap.entries()) {
    const schema = schemasMap.get(ch.schemaId)
    channelsList.push({
      id,
      topic: ch.topic,
      schemaId: ch.schemaId,
      schemaName: schema ? schema.name : undefined,
      messageCount: channelCounts.get(id) || 0,
    })
  }

  channelsList.sort((a, b) => a.topic.localeCompare(b.topic))
  const durationNs = endNs - startNs

  return {
    name: file.name,
    size: file.size,
    messageCount: totalMessagesCount,
    channels: channelsList,
    schemas: schemasList,
    messages: messagesPreview,
    durationNs: durationNs > 0n ? durationNs : 0n,
    startNs: startNs > -1n ? startNs : 0n,
    endNs: endNs > -1n ? endNs : 0n,
  }
}
