import type { McapIndexedReader } from '@mcap/core'
import { parse } from '@foxglove/rosmsg'
import { MessageReader as Ros2Reader } from '@foxglove/rosmsg2-serialization'
import { MessageReader as Ros1Reader } from '@foxglove/rosmsg-serialization'
import protobuf from 'protobufjs'
import 'protobufjs/ext/descriptor'

export type MessageDeserializer = (data: Uint8Array) => any

export function createMessageDeserializer(
  reader: McapIndexedReader,
  channelId: number,
): MessageDeserializer {
  const channel = reader.channelsById.get(channelId)
  if (!channel) {
    return (data: Uint8Array) => data
  }

  const schema = reader.schemasById.get(channel.schemaId)
  if (!schema) {
    return (data: Uint8Array) => ({
      hex: Array.from(data.subarray(0, 32))
        .map(b => b.toString(16).padStart(2, '0'))
        .join(' '),
    })
  }

  try {
    if (schema.encoding === 'protobuf') {
      const root = protobuf.Root.fromDescriptor(schema.data)
      const type = root.lookupType(schema.name)
      return (data: Uint8Array) => {
        const decoded = type.decode(data)
        return type.toObject(decoded, {
          longs: String,
          enums: String,
          bytes: Object,
        })
      }
    }

    if (schema.encoding === 'json') {
      const decoder = new TextDecoder('utf-8')
      return (data: Uint8Array) => {
        try {
          return JSON.parse(decoder.decode(data))
        }
        catch {
          return { error: 'Failed to parse JSON message' }
        }
      }
    }

    const schemaText = new TextDecoder().decode(schema.data)
    if (schema.encoding === 'ros1msg') {
      const parsedDefs = parse(schemaText)
      const ros1Reader = new Ros1Reader(parsedDefs)
      return (data: Uint8Array) => ros1Reader.readMessage(data)
    }

    if (schema.encoding === 'cdr' || schema.encoding === 'ros2msg') {
      const parsedDefs = parse(schemaText, { ros2: true })
      const ros2Reader = new Ros2Reader(parsedDefs)
      return (data: Uint8Array) => ros2Reader.readMessage(data)
    }
  }
  catch (e) {
    console.error('Failed to parse or compile schema:', e)
    return (data: Uint8Array) => ({
      error: 'Deserialization failed',
      hex: Array.from(data.subarray(0, 32))
        .map(b => b.toString(16).padStart(2, '0'))
        .join(' '),
    })
  }

  return (data: Uint8Array) => data
}
