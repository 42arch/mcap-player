import { describe, expect, it } from 'vitest'
import { PlaybackBatchAccumulator } from './playback-batch-accumulator'

interface Message {
  topic: string
  sequence: number
}

describe('playback batch accumulator', () => {
  it('holds latest-mode messages across continuations and emits only the final value', () => {
    const accumulator = new PlaybackBatchAccumulator<Message>()
    const modes = { '/cloud': 'latest' as const, '/tf': 'all' as const }

    expect(accumulator.consume([
      { topic: '/cloud', sequence: 1 },
      { topic: '/tf', sequence: 1 },
    ], modes, false)).toEqual([
      { topic: '/tf', sequence: 1 },
    ])

    expect(accumulator.consume([
      { topic: '/cloud', sequence: 2 },
      { topic: '/tf', sequence: 2 },
    ], modes, true)).toEqual([
      { topic: '/tf', sequence: 2 },
      { topic: '/cloud', sequence: 2 },
    ])
  })

  it('drops a pending continuation when cleared by seek', () => {
    const accumulator = new PlaybackBatchAccumulator<Message>()
    const modes = { '/cloud': 'latest' as const }

    accumulator.consume([{ topic: '/cloud', sequence: 1 }], modes, false)
    accumulator.clear()

    expect(accumulator.consume([{ topic: '/cloud', sequence: 2 }], modes, true)).toEqual([
      { topic: '/cloud', sequence: 2 },
    ])
  })
})
