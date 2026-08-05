import { describe, expect, it } from 'vitest'
import { createMessageDeserializer } from './message-decoders'

describe('createMessageDeserializer', () => {
  const encoder = new TextEncoder()

  it('returns identity function when channel is missing', () => {
    const reader = {
      channelsById: new Map(),
      schemasById: new Map(),
    } as any

    const deserializer = createMessageDeserializer(reader, 999)
    const input = new Uint8Array([1, 2, 3])
    expect(deserializer(input)).toBe(input)
  })

  it('returns hex representation when schema is missing', () => {
    const reader = {
      channelsById: new Map([[1, { schemaId: 99 }]]),
      schemasById: new Map(),
    } as any

    const deserializer = createMessageDeserializer(reader, 1)
    const input = new Uint8Array([0xAB, 0xCD, 0xEF])
    expect(deserializer(input)).toEqual({ hex: 'ab cd ef' })
  })

  it('deserializes JSON messages when schema encoding is json', () => {
    const reader = {
      channelsById: new Map([[1, { schemaId: 10 }]]),
      schemasById: new Map([[10, { encoding: 'json', data: new Uint8Array() }]]),
    } as any

    const deserializer = createMessageDeserializer(reader, 1)
    const input = encoder.encode(JSON.stringify({ value: 42 }))
    expect(deserializer(input)).toEqual({ value: 42 })
  })

  it('deserializes JSON messages when schema encoding is jsonschema', () => {
    const reader = {
      channelsById: new Map([[1, { schemaId: 10, messageEncoding: 'json' }]]),
      schemasById: new Map([[10, { encoding: 'jsonschema', name: 'foxglove.PoseInFrame', data: new Uint8Array() }]]),
    } as any

    const deserializer = createMessageDeserializer(reader, 1)
    const input = encoder.encode(JSON.stringify({ x: 1.0, y: 2.0 }))
    expect(deserializer(input)).toEqual({ x: 1.0, y: 2.0 })
  })

  it('deserializes JSON messages when channel messageEncoding is json', () => {
    const reader = {
      channelsById: new Map([[1, { schemaId: 10, messageEncoding: 'json' }]]),
      schemasById: new Map([[10, { encoding: 'custom', name: 'custom.Type', data: new Uint8Array() }]]),
    } as any

    const deserializer = createMessageDeserializer(reader, 1)
    const input = encoder.encode(JSON.stringify({ status: 'ok' }))
    expect(deserializer(input)).toEqual({ status: 'ok' })
  })

  it('handles invalid JSON gracefully', () => {
    const reader = {
      channelsById: new Map([[1, { schemaId: 10 }]]),
      schemasById: new Map([[10, { encoding: 'json', data: new Uint8Array() }]]),
    } as any

    const deserializer = createMessageDeserializer(reader, 1)
    const input = encoder.encode('{ invalid json }')
    expect(deserializer(input)).toEqual({ error: 'Failed to parse JSON message' })
  })

  it('deserializes ros1msg encoded messages', () => {
    const schemaText = 'string data\n'
    const reader = {
      channelsById: new Map([[1, { schemaId: 20 }]]),
      schemasById: new Map([[20, { encoding: 'ros1msg', name: 'std_msgs/String', data: encoder.encode(schemaText) }]]),
    } as any

    const deserializer = createMessageDeserializer(reader, 1)
    // ROS1 string: 4 bytes length prefix followed by utf-8 bytes
    const payload = new Uint8Array([5, 0, 0, 0, ...encoder.encode('hello')])
    expect(deserializer(payload)).toEqual({ data: 'hello' })
  })

  it('deserializes ros2msg / cdr encoded messages', () => {
    const schemaText = 'string data\n'
    const reader = {
      channelsById: new Map([[1, { schemaId: 30 }]]),
      schemasById: new Map([[30, { encoding: 'ros2msg', name: 'std_msgs/msg/String', data: encoder.encode(schemaText) }]]),
    } as any

    const deserializer = createMessageDeserializer(reader, 1)
    // CDR encapsulation header (4 bytes: 0x00, 0x01, 0x00, 0x00) + string length 6 (5 chars + null terminator)
    const payload = new Uint8Array([
      0x00,
      0x01,
      0x00,
      0x00, // CDR header
      0x06,
      0x00,
      0x00,
      0x00, // length (including null char)
      ...encoder.encode('world'),
      0x00, // null terminator
    ])
    expect(deserializer(payload)).toEqual({ data: 'world' })
  })

  it('handles schema compilation failure gracefully', () => {
    const reader = {
      channelsById: new Map([[1, { schemaId: 40 }]]),
      schemasById: new Map([[40, { encoding: 'protobuf', name: 'Invalid', data: new Uint8Array([0xFF, 0xFF]) }]]),
    } as any

    const deserializer = createMessageDeserializer(reader, 1)
    const input = new Uint8Array([1, 2, 3])
    const result = deserializer(input)
    expect(result.error).toBe('Deserialization failed')
    expect(result.hex).toBe('01 02 03')
  })

  it('returns raw data for unrecognized schema encodings', () => {
    const reader = {
      channelsById: new Map([[1, { schemaId: 50 }]]),
      schemasById: new Map([[50, { encoding: 'unknown_format', name: 'Test', data: encoder.encode('schema') }]]),
    } as any

    const deserializer = createMessageDeserializer(reader, 1)
    const input = new Uint8Array([10, 20, 30])
    expect(deserializer(input)).toBe(input)
  })
})
