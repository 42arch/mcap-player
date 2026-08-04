import { afterEach, describe, expect, it, vi } from 'vitest'
import { globalMessagePipeline } from '@/panels/runtime/message-pipeline'
import { usePlayerStore } from '@/stores/use-player-store'
import { PlaybackClock } from './playback-clock'
import { PlaybackController } from './playback-controller'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve
  })
  return { promise, resolve }
}

function createControllerWithPendingBackfill() {
  const fast = deferred<any[]>()
  const spatial = deferred<any[]>()
  const media = deferred<any[]>()
  const worker = {
    setSeekGeneration: vi.fn().mockResolvedValue(undefined),
    getBackfillMessages: vi.fn((
      _timeNs: bigint,
      _topics: string[],
      _preserveCursor: boolean,
      _generation: number,
      phase: 'fast' | 'spatial' | 'media',
    ) => phase === 'fast' ? fast.promise : phase === 'spatial' ? spatial.promise : media.promise),
  }
  const clock = new PlaybackClock(0n, 100n)
  const controller = new PlaybackController()
  Object.assign(controller as any, {
    clock,
    fileSummary: {
      startNs: 0n,
      endNs: 100n,
      channels: [{ topic: '/cloud', schemaName: 'sensor_msgs/PointCloud2' }],
    },
    worker,
    seekWorker: worker,
  })
  return { clock, controller, fast, media, spatial, worker }
}

describe('playback controller seek gating', () => {
  afterEach(() => {
    usePlayerStore.getState().setIsPlaying(false)
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('defers a play request until seek backfill completes', async () => {
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    vi.spyOn(globalMessagePipeline, 'getSeekQueryPlan').mockReturnValue({
      topics: ['/cloud'],
      modeByTopic: { '/cloud': 'latest' },
    })
    const { clock, controller, fast, worker } = createControllerWithPendingBackfill()

    controller.seek(10n)
    controller.play()

    expect(clock.getIsPlaying()).toBe(false)
    expect(usePlayerStore.getState().isPlaying).toBe(true)
    expect(worker.getBackfillMessages).toHaveBeenCalledTimes(1)

    fast.resolve([])
    await vi.waitFor(() => expect(clock.getIsPlaying()).toBe(true))

    controller.pause()
  })

  it('freezes an active clock during seek and resumes it after backfill', async () => {
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    vi.spyOn(globalMessagePipeline, 'getSeekQueryPlan').mockReturnValue({
      topics: ['/cloud'],
      modeByTopic: { '/cloud': 'latest' },
    })
    const { clock, controller, fast } = createControllerWithPendingBackfill()
    clock.play()
    usePlayerStore.getState().setIsPlaying(true)

    controller.seek(20n)

    expect(clock.getIsPlaying()).toBe(false)
    fast.resolve([])
    await vi.waitFor(() => expect(clock.getIsPlaying()).toBe(true))

    controller.pause()
  })

  it('does not block playback on media keyframe repair', async () => {
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    vi.spyOn(globalMessagePipeline, 'getSeekQueryPlan').mockReturnValue({
      topics: ['/camera'],
      modeByTopic: { '/camera': 'all' },
    })
    const { clock, controller, media, worker } = createControllerWithPendingBackfill()
    Object.assign(controller as any, {
      fileSummary: {
        startNs: 0n,
        endNs: 100n,
        channels: [{ topic: '/camera', schemaName: 'foxglove.CompressedVideo' }],
      },
    })

    controller.seek(30n)
    controller.play()

    await vi.waitFor(() => expect(worker.getBackfillMessages).toHaveBeenCalledWith(
      30n,
      ['/camera'],
      false,
      expect.any(Number),
      'media',
      undefined,
    ))
    expect(clock.getIsPlaying()).toBe(true)

    media.resolve([])
    controller.pause()
  })
})
