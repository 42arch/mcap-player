import { describe, expect, it } from 'vitest'
import { copyBinaryPayload, getTransferableBuffers, selectLatestMessages, selectLatestWithSceneUpdates } from './message-cursor'

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
})
