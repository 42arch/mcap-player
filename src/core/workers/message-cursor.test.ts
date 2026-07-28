import { describe, expect, it } from 'vitest'
import {
  copyBinaryPayload,
  getTransferableBuffers,
  isSlowBackfillChannel,
  MessageCursor,
  sanitizePayload,
  selectLatestMessages,
  selectLatestWithSceneUpdates,
} from './message-cursor'

interface Message {
  topic: string
  sequence: number
}

describe('selectLatestMessages', () => {
  it('keeps only the last message for each topic', () => {
    const messages: Message[] = [
      { topic: '/camera', sequence: 1 },
      { topic: '/imu', sequence: 1 },
      { topic: '/camera', sequence: 2 },
      { topic: '/imu', sequence: 2 },
    ]

    expect(selectLatestMessages(messages, message => message.topic)).toEqual([
      { topic: '/camera', sequence: 2 },
      { topic: '/imu', sequence: 2 },
    ])
  })

  it('omits messages without a resolved topic', () => {
    const messages = [
      { topic: '/camera', sequence: 1 },
      { topic: '', sequence: 2 },
    ]

    expect(selectLatestMessages(messages, message => message.topic || undefined)).toEqual([
      { topic: '/camera', sequence: 1 },
    ])
  })
})

describe('selectLatestWithSceneUpdates', () => {
  it('preserves ordered SceneUpdate messages while reducing point-cloud topics', () => {
    const messages = [
      { topic: '/points', sequence: 1, scene: false },
      { topic: '/markers', sequence: 1, scene: true },
      { topic: '/points', sequence: 2, scene: false },
      { topic: '/markers', sequence: 2, scene: true },
    ]

    expect(selectLatestWithSceneUpdates(
      messages,
      message => message.topic,
      message => message.scene,
    )).toEqual([
      { topic: '/markers', sequence: 1, scene: true },
      { topic: '/points', sequence: 2, scene: false },
      { topic: '/markers', sequence: 2, scene: true },
    ])
  })
})

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

describe('backfill optimization', () => {
  it('classifies stateful and compressed topics as slow backfill', () => {
    expect(isSlowBackfillChannel('/scene', 'foxglove.SceneUpdate')).toBe(true)
    expect(isSlowBackfillChannel('/tf', 'custom.Transform')).toBe(true)
    expect(isSlowBackfillChannel('/camera', 'sensor_msgs/CompressedImage')).toBe(true)
    expect(isSlowBackfillChannel('/points', 'sensor_msgs/PointCloud2')).toBe(false)
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
})
