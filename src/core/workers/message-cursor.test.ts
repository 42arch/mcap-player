import { describe, expect, it } from 'vitest'
import {
  copyBinaryPayload,
  getTransferableBuffers,
  isSlowBackfillChannel,
  isTransformBackfillChannel,
  MessageCursor,
  sanitizePayload,
} from './message-cursor'

describe('binary transfer helpers', () => {
  it('copies only the bytes in a typed-array view', () => {
    const source = new Uint8Array([1, 2, 3, 4]).subarray(1, 3)
    const copy = copyBinaryPayload(source)

    source[0] = 99

    expect(Array.from(copy)).toEqual([2, 3])
    expect(copy.buffer).not.toBe(source.buffer)
  })

  it('collects each binary payload buffer only once', () => {
    const data = new Uint8Array([1, 2, 3])
    const buffers = getTransferableBuffers([
      { payload: { data } },
      { payload: { data } },
      { payload: { data: 'not-binary' } },
    ] as any)

    expect(buffers).toEqual([data.buffer])
  })

  it('collects prepared point-cloud buffers for zero-copy transfer', () => {
    const positions = new Float32Array([1, 2, 3])
    const intensities = new Float32Array([4])
    const buffers = getTransferableBuffers([
      { payload: { positions, intensities } },
    ] as any)

    expect(buffers).toEqual([positions.buffer, intensities.buffer])
  })

  it('preserves foxglove.Grid data as transferable bytes', () => {
    const source = new Uint8Array([0, 1, 2])
    const payload = sanitizePayload({
      column_count: 3,
      row_stride: 3,
      cell_stride: 1,
      data: source,
    })

    source[1] = 99

    expect(payload.data).toBeInstanceOf(Uint8Array)
    expect(Array.from(payload.data)).toEqual([0, 1, 2])
    expect(payload.data.buffer).not.toBe(source.buffer)
  })
})

describe('bounded playback batches', () => {
  it('continues a large interval without losing messages at the same timestamp', async () => {
    const encoder = new TextEncoder()
    const rawMessages = Array.from({ length: 600 }, (_, index) => ({
      channelId: 1,
      logTime: 10n,
      publishTime: 10n,
      sequence: index,
      data: encoder.encode(JSON.stringify({ index })),
    }))
    const reader = {
      channelsById: new Map([[1, { topic: '/camera', schemaId: 1 }]]),
      schemasById: new Map([[1, {
        name: 'custom.Message',
        encoding: 'json',
        data: new Uint8Array(),
      }]]),
      readMessages: () => (async function* () {
        yield* rawMessages
      })(),
    }
    const cursor = new MessageCursor()
    cursor.setReader(reader as any)
    cursor.reset(0n, ['/camera'], 'placeholder')

    const received: number[] = []
    let batch = await cursor.drainUpTo(10n, { '/camera': 'all' })
    let batchCount = 0
    while (true) {
      batchCount++
      expect(batch.messages.length).toBeLessThanOrEqual(256)
      received.push(...batch.messages.map(message => message.sequence))
      if (!batch.hasMore) {
        break
      }
      expect(batch.readThroughTimeNs).toBe(10n)
      batch = await cursor.drainUpTo(10n, { '/camera': 'all' })
    }

    expect(batchCount).toBeGreaterThan(1)
    expect(received).toEqual(Array.from({ length: 600 }, (_, index) => index))
  })

  it('coalesces latest topics inside every bounded batch', async () => {
    const encoder = new TextEncoder()
    const rawMessages = Array.from({ length: 300 }, (_, index) => ({
      channelId: 1,
      logTime: BigInt(index),
      publishTime: BigInt(index),
      sequence: index,
      data: encoder.encode(JSON.stringify({ index })),
    }))
    const reader = {
      channelsById: new Map([[1, { topic: '/points', schemaId: 1 }]]),
      schemasById: new Map([[1, {
        name: 'custom.Message',
        encoding: 'json',
        data: new Uint8Array(),
      }]]),
      readMessages: () => (async function* () {
        yield* rawMessages
      })(),
    }
    const cursor = new MessageCursor()
    cursor.setReader(reader as any)
    cursor.reset(0n, ['/points'], 'placeholder')

    const first = await cursor.drainUpTo(299n, { '/points': 'latest' })

    expect(first.hasMore).toBe(true)
    expect(first.messages).toHaveLength(1)
    expect(first.messages[0].sequence).toBeGreaterThanOrEqual(0)
  })
})

describe('backfill optimization', () => {
  it('classifies stateful and compressed topics as slow backfill', () => {
    expect(isSlowBackfillChannel('/scene', 'foxglove.SceneUpdate')).toBe(true)
    expect(isSlowBackfillChannel('/tf', 'custom.Transform')).toBe(true)
    expect(isSlowBackfillChannel('/camera', 'sensor_msgs/CompressedImage')).toBe(true)
    expect(isSlowBackfillChannel('/points', 'sensor_msgs/PointCloud2')).toBe(false)
    expect(isTransformBackfillChannel('/refined/tf', 'tf2_msgs/TFMessage')).toBe(true)
    expect(isTransformBackfillChannel('/camera', 'sensor_msgs/CompressedImage')).toBe(false)
  })

  it('compacts SceneUpdate history into one full update', async () => {
    const encoder = new TextEncoder()
    const rawMessages = [
      {
        channelId: 1,
        logTime: 1n,
        publishTime: 1n,
        sequence: 1,
        data: encoder.encode(JSON.stringify({
          entities: [{ id: 'old', cubes: [{ size: { x: 1, y: 1, z: 1 } }] }],
        })),
      },
      {
        channelId: 1,
        logTime: 2n,
        publishTime: 2n,
        sequence: 2,
        data: encoder.encode(JSON.stringify({
          deletions: ['old'],
          entities: [{ id: 'current', cubes: [{ size: { x: 2, y: 1, z: 1 } }] }],
        })),
      },
    ]
    const readOptions: Array<{ startTime?: bigint, endTime?: bigint }> = []
    const reader = {
      channelsById: new Map([[1, { topic: '/scene', schemaId: 1 }]]),
      schemasById: new Map([[1, {
        name: 'foxglove.SceneUpdate',
        encoding: 'json',
        data: new Uint8Array(),
      }]]),
      readMessages: (options: { startTime?: bigint, endTime?: bigint }) => (async function* () {
        readOptions.push(options)
        yield* rawMessages.filter(message =>
          (options.startTime === undefined || message.logTime >= options.startTime)
          && (options.endTime === undefined || message.logTime < options.endTime),
        )
      })(),
    }
    const cursor = new MessageCursor()
    cursor.setReader(reader as any)

    const messages = await cursor.getBackfillMessages(10n, ['/scene'], 'placeholder')

    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({
      topic: '/scene',
      logTime: 10n,
      sequence: 2,
      sceneSnapshot: true,
    })
    expect(messages[0].payload.entities).toEqual([
      expect.objectContaining({ id: 'current' }),
    ])

    await cursor.getBackfillMessages(20n, ['/scene'], 'placeholder')
    expect(readOptions[1].startTime).toBe(11n)
  })

  it('compacts TF history by child frame and reuses its checkpoint', async () => {
    const encoder = new TextEncoder()
    const rawMessages = [
      {
        channelId: 1,
        logTime: 1n,
        publishTime: 1n,
        sequence: 1,
        data: encoder.encode(JSON.stringify({
          transforms: [
            {
              header: { frame_id: 'base_link' },
              child_frame_id: 'camera',
              transform: { translation: { x: 1 }, rotation: { w: 1 } },
            },
            {
              header: { frame_id: 'base_link' },
              child_frame_id: 'lidar',
              transform: { translation: { x: 2 }, rotation: { w: 1 } },
            },
          ],
        })),
      },
      {
        channelId: 1,
        logTime: 2n,
        publishTime: 2n,
        sequence: 2,
        data: encoder.encode(JSON.stringify({
          transforms: [{
            header: { frame_id: 'base_link' },
            child_frame_id: 'camera',
            transform: { translation: { x: 3 }, rotation: { w: 1 } },
          }],
        })),
      },
    ]
    const readOptions: Array<{ startTime?: bigint, endTime?: bigint }> = []
    const reader = {
      channelsById: new Map([[1, { topic: '/tf', schemaId: 1 }]]),
      schemasById: new Map([[1, {
        name: 'tf2_msgs/TFMessage',
        encoding: 'json',
        data: new Uint8Array(),
      }]]),
      readMessages: (options: { startTime?: bigint, endTime?: bigint }) => (async function* () {
        readOptions.push(options)
        yield* rawMessages.filter(message =>
          (options.startTime === undefined || message.logTime >= options.startTime)
          && (options.endTime === undefined || message.logTime < options.endTime),
        )
      })(),
    }
    const cursor = new MessageCursor()
    cursor.setReader(reader as any)

    const messages = await cursor.getBackfillMessages(10n, ['/tf'], 'placeholder')

    expect(messages).toHaveLength(1)
    expect(messages[0].transformSnapshot).toBe(true)
    expect(messages[0].payload.transforms).toEqual([
      expect.objectContaining({
        child_frame_id: 'camera',
        transform: expect.objectContaining({ translation: { x: 3 } }),
      }),
      expect.objectContaining({
        child_frame_id: 'lidar',
        transform: expect.objectContaining({ translation: { x: 2 } }),
      }),
    ])

    await cursor.getBackfillMessages(20n, ['/tf'], 'placeholder')
    expect(readOptions[1].startTime).toBe(11n)
  })

  it('rebuilds interleaved TF topics with one shared MCAP scan', async () => {
    const encoder = new TextEncoder()
    const rawMessages = [
      {
        channelId: 1,
        logTime: 1n,
        publishTime: 1n,
        sequence: 1,
        data: encoder.encode(JSON.stringify({
          transforms: [{
            header: { frame_id: 'world' },
            child_frame_id: 'body',
            transform: { translation: { x: 1 }, rotation: { w: 1 } },
          }],
        })),
      },
      {
        channelId: 2,
        logTime: 2n,
        publishTime: 2n,
        sequence: 2,
        data: encoder.encode(JSON.stringify({
          transforms: [{
            header: { frame_id: 'odom' },
            child_frame_id: 'camera_init',
            transform: { translation: { x: 2 }, rotation: { w: 1 } },
          }],
        })),
      },
    ]
    const readOptions: Array<{ topics?: string[] }> = []
    const reader = {
      channelsById: new Map([
        [1, { topic: '/tf', schemaId: 1 }],
        [2, { topic: '/refined/tf', schemaId: 1 }],
      ]),
      schemasById: new Map([[1, {
        name: 'tf2_msgs/TFMessage',
        encoding: 'json',
        data: new Uint8Array(),
      }]]),
      readMessages: (options: { topics?: string[] }) => (async function* () {
        readOptions.push(options)
        yield* rawMessages.filter(message => options.topics?.includes(
          reader.channelsById.get(message.channelId)!.topic,
        ))
      })(),
    }
    const cursor = new MessageCursor()
    cursor.setReader(reader as any)

    const messages = await cursor.getBackfillMessages(
      10n,
      ['/refined/tf', '/tf'],
      'placeholder',
    )

    expect(readOptions).toEqual([{ endTime: 11n, topics: ['/refined/tf', '/tf'] }])
    expect(messages).toHaveLength(2)
    expect(messages.map(message => message.topic)).toEqual(['/refined/tf', '/tf'])
    expect(messages.filter(message => message.transformSnapshot)).toHaveLength(1)
  })

  it('prewarms interval checkpoints so later seeks scan only nearby TF messages', async () => {
    const encoder = new TextEncoder()
    const rawMessages = [
      1n,
      10_000_000_001n,
      20_000_000_001n,
      30_000_000_001n,
    ].map((logTime, index) => ({
      channelId: 1,
      logTime,
      publishTime: logTime,
      sequence: index,
      data: encoder.encode(JSON.stringify({
        transforms: [{
          header: { frame_id: 'world' },
          child_frame_id: 'body',
          transform: { translation: { x: index }, rotation: { w: 1 } },
        }],
      })),
    }))
    const readOptions: Array<{ startTime?: bigint, endTime?: bigint }> = []
    const reader = {
      channelsById: new Map([[1, { topic: '/tf', schemaId: 1 }]]),
      schemasById: new Map([[1, {
        name: 'tf2_msgs/TFMessage',
        encoding: 'json',
        data: new Uint8Array(),
      }]]),
      readMessages: (options: { startTime?: bigint, endTime?: bigint }) => (async function* () {
        readOptions.push(options)
        yield* rawMessages.filter(message =>
          (options.startTime === undefined || message.logTime >= options.startTime)
          && (options.endTime === undefined || message.logTime < options.endTime),
        )
      })(),
    }
    const cursor = new MessageCursor()
    cursor.setReader(reader as any)

    await cursor.prewarmTransformCheckpoints(['/tf'], 35_000_000_000n)
    await cursor.getBackfillMessages(25_000_000_000n, ['/tf'], 'placeholder')

    expect(readOptions[0].startTime).toBeUndefined()
    expect(readOptions[1].startTime).toBe(20_000_000_001n)
  })
})
