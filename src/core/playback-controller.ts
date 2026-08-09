import type { McapSource } from '@/core/sources/mcap-source'
import type { RemoteLoadProgress, RemoteTimeRange } from '@/core/sources/remote-load-progress'
import type { PlotSeriesData, PlotSeriesRequest } from '@/core/workers/plot-data'
import type { TimelineTopicData } from '@/core/workers/timeline-data'
import type { BackfillClass } from '@/core/workers/topic-classifier'
import { transfer, wrap } from 'comlink'
import { resetDatasetResources } from '@/core/dataset-resource-registry'
import { PlaybackBatchAccumulator } from '@/core/playback-batch-accumulator'
import { setPlaybackElapsedNs } from '@/core/playback-time-store'
import { createRemoteMcapSource } from '@/core/sources/mcap-source'
import { getPlayableRangeEnd } from '@/core/sources/remote-load-progress'
import { getBackfillClass } from '@/core/workers/topic-classifier'
import { globalMessagePipeline } from '@/panels/runtime/message-pipeline'
import { usePlayerStore } from '@/stores/use-player-store'
import { PlaybackClock } from './playback-clock'

interface PendingSeekBackfill {
  generation: number
  timeNs: bigint
}

interface PlaybackMessageBatch {
  messages: any[]
  readThroughTimeNs: bigint
  hasMore: boolean
}

const SEEK_BACKFILL_PHASES: readonly BackfillClass[] = ['fast', 'spatial', 'media']
const MIB = 1024 * 1024
const PLAYBACK_REMOTE_CACHE_BYTES = 96 * MIB
const SEEK_REMOTE_CACHE_BYTES = 64 * MIB
const REMOTE_BUFFER_LOW_WATER_PERCENT = 1n
const REMOTE_BUFFER_RESUME_PERCENT = 3n
const REMOTE_BUFFER_TARGET_PERCENT = 10n

export class PlaybackController {
  private worker: any = null
  private seekWorker: any = null
  private remoteCacheWorker: any = null
  private remoteCacheSessionId: string | null = null
  private clock: PlaybackClock | null = null
  private animationFrameId: number | null = null
  private lastTickTimeNs: bigint = 0n
  private fileSummary: any = null
  private isQuerying = false
  private pendingQueryEndTimeNs: bigint | null = null
  private queryVersion = 0
  private pendingBackfillPanelIds = new Set<string>()
  private backfillScheduled = false
  private seekGeneration = 0
  private pendingSeekBackfill: PendingSeekBackfill | null = null
  private isSeekBackfillRunning = false
  private isSeekProcessorRunning = false
  private resumeAfterSeek = false
  private playbackBatchAccumulator = new PlaybackBatchAccumulator<any>()
  private timelineDataPromise: Promise<TimelineTopicData[]> | null = null
  private nextPlotRequestId = 0
  private loadGeneration = 0
  private remoteProgressTimer: ReturnType<typeof setInterval> | null = null
  private remoteProgressSession = 0
  private isRemoteProgressPolling = false
  private isRemoteSource = false
  private isRemoteBuffering = false
  private remoteRangeBufferingAvailable: boolean | null = null
  private remotePlayableTimeRanges: RemoteTimeRange[] = []
  private isRemotePrefetching = false
  private isRemoteFullDownloadRunning = false

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', () => {
        // This is best-effort only: the cache worker clears any leftovers when a
        // future session starts, so an abrupt browser shutdown cannot revive data.
        void this.destroyRemoteCacheSession()
      })
    }
    globalMessagePipeline.onSubscriptionsChanged((panelId) => {
      this.pendingBackfillPanelIds.add(panelId)
      if (this.backfillScheduled) {
        return
      }
      this.backfillScheduled = true
      queueMicrotask(() => {
        this.backfillScheduled = false
        const panelIds = Array.from(this.pendingBackfillPanelIds)
        this.pendingBackfillPanelIds.clear()
        this.triggerBackfill(panelIds)
      })
    })
  }

  triggerBackfill(panelIds?: readonly string[]) {
    if (!this.clock || !this.fileSummary) {
      return
    }
    const ns = this.clock.get()
    const plan = globalMessagePipeline.getQueryPlan()
    const worker = this.getSeekWorker()
    if (plan.topics.length > 0 && worker) {
      this.invalidatePlaybackQuery()
      const version = this.queryVersion
      const isTargetedBackfill = Boolean(panelIds?.length)
      worker.getBackfillMessages(
        ns,
        plan.topics,
        isTargetedBackfill,
        undefined,
        'all',
        plan.processorsByTopic,
      ).then((messages: any[]) => {
        if (version !== this.queryVersion) {
          return
        }
        if (panelIds && panelIds.length > 0) {
          for (const panelId of panelIds) {
            globalMessagePipeline.dispatchToPanel(panelId, messages)
          }
        }
        else {
          globalMessagePipeline.dispatch(messages)
        }
      })
    }
  }

  private getWorker() {
    if (!this.worker) {
      const rawWorker = new Worker(
        new URL('./workers/mcap.worker.ts', import.meta.url),
        { type: 'module' },
      )
      this.worker = wrap(rawWorker)
    }
    return this.worker
  }

  /**
   * Random-access backfill has its own worker so timeline/plot scans and normal
   * playback cannot queue ahead of an interactive seek.
   */
  private getSeekWorker() {
    if (!this.seekWorker) {
      const rawWorker = new Worker(
        new URL('./workers/mcap.worker.ts', import.meta.url),
        { type: 'module' },
      )
      this.seekWorker = wrap(rawWorker)
    }
    return this.seekWorker
  }

  private getRemoteCacheWorker() {
    if (!this.remoteCacheWorker) {
      const rawWorker = new Worker(
        new URL('./workers/remote-cache.worker.ts', import.meta.url),
        { type: 'module' },
      )
      this.remoteCacheWorker = wrap(rawWorker)
    }
    return this.remoteCacheWorker
  }

  private async prepareRemoteCache(source: Extract<McapSource, { kind: 'remote' }>, workers: readonly any[]): Promise<McapSource> {
    await this.destroyRemoteCacheSession()
    const cacheWorker = this.getRemoteCacheWorker()
    const { sessionId, size } = await cacheWorker.createSession(source.url)
    this.remoteCacheSessionId = sessionId
    try {
      await Promise.all(workers.map(async (worker) => {
        const channel = new MessageChannel()
        await cacheWorker.connect(sessionId, transfer(channel.port1, [channel.port1]))
        await worker.setRemoteBlockCache(transfer({ port: channel.port2, size }, [channel.port2]))
      }))
    }
    catch (error) {
      await this.destroyRemoteCacheSession()
      throw error
    }
    return { ...source, knownSize: size }
  }

  private async destroyRemoteCacheSession(): Promise<void> {
    const sessionId = this.remoteCacheSessionId
    this.remoteCacheSessionId = null
    if (!sessionId || !this.remoteCacheWorker) {
      return
    }
    try {
      await this.remoteCacheWorker.destroySession(sessionId)
    }
    catch (error) {
      console.warn('Failed to clear the OPFS session cache:', error)
    }
  }

  async loadFile(file: File) {
    await this.loadSource({ kind: 'local', file })
  }

  async loadRemoteUrl(url: string) {
    await this.loadSource(createRemoteMcapSource(url))
  }

  async loadSource(source: McapSource) {
    const loadGeneration = ++this.loadGeneration
    this.stopRemoteProgressPolling()
    this.resetRemoteBufferState()
    this.pause()
    this.pendingSeekBackfill = null
    this.seekGeneration++
    this.invalidatePlaybackQuery()
    resetDatasetResources()
    setPlaybackElapsedNs(0n)
    this.pendingQueryEndTimeNs = null
    this.timelineDataPromise = null
    const worker = this.getWorker()
    const seekWorker = this.getSeekWorker()
    await this.destroyRemoteCacheSession()
    const workerSource = source.kind === 'remote'
      ? await this.prepareRemoteCache(source, [worker, seekWorker])
      : source
    let playbackSummary: any
    let seekSummary: any
    try {
      [playbackSummary, seekSummary] = await Promise.all([
        worker.initialize(workerSource, {
          buildSpatialIndex: false,
          remoteCacheBytes: PLAYBACK_REMOTE_CACHE_BYTES,
        }),
        seekWorker.initialize(workerSource, {
          buildSpatialIndex: workerSource.kind === 'local',
          remoteCacheBytes: SEEK_REMOTE_CACHE_BYTES,
        }),
      ])
    }
    catch (error) {
      if (loadGeneration !== this.loadGeneration) {
        return
      }
      await this.destroyRemoteCacheSession()
      throw error
    }
    if (loadGeneration !== this.loadGeneration) {
      return
    }
    const summary = workerSource.kind === 'local' ? seekSummary : playbackSummary
    this.fileSummary = summary
    this.clock = new PlaybackClock(summary.startNs, summary.endNs)
    this.lastTickTimeNs = summary.startNs

    // update Zustand store
    const store = usePlayerStore.getState()
    store.setFileSummary(summary)
    if (workerSource.kind === 'remote') {
      this.isRemoteSource = true
      this.startRemoteProgressPolling(loadGeneration)
      this.prefetchRemoteBuffer(summary.startNs)
    }
  }

  closeFile() {
    this.loadGeneration++
    this.stopRemoteProgressPolling()
    this.resetRemoteBufferState()
    this.pause()
    this.pendingSeekBackfill = null
    this.seekGeneration++
    this.fileSummary = null
    this.clock = null
    this.lastTickTimeNs = 0n
    this.pendingQueryEndTimeNs = null
    this.timelineDataPromise = null
    this.invalidatePlaybackQuery()
    resetDatasetResources()
    setPlaybackElapsedNs(0n)
    usePlayerStore.getState().setFileSummary(null)
    void this.destroyRemoteCacheSession()
    this.worker?.closeSource().catch((error: unknown) => {
      console.warn('Failed to close playback worker source:', error)
    })
    this.seekWorker?.closeSource().catch((error: unknown) => {
      console.warn('Failed to close seek worker source:', error)
    })
  }

  play() {
    if (!this.clock || !this.fileSummary || this.clock.getIsPlaying()) {
      return
    }

    // If at the end, seek back to start
    const current = this.clock.get()
    if (current >= this.fileSummary.endNs) {
      this.seek(this.fileSummary.startNs)
    }

    if (
      this.isSeekBackfillRunning
      || this.pendingSeekBackfill
      || (this.resumeAfterSeek && this.isQuerying)
    ) {
      this.resumeAfterSeek = true
      usePlayerStore.getState().setIsPlaying(true)
      return
    }

    this.resumeAfterSeek = false
    this.clock.play()
    this.lastTickTimeNs = this.clock.get()
    usePlayerStore.getState().setIsPlaying(true)
    this.startLoop()
  }

  pause() {
    this.resumeAfterSeek = false
    this.isRemoteBuffering = false
    usePlayerStore.getState().setIsRemoteBuffering(false)
    if (this.clock?.getIsPlaying()) {
      this.clock.pause()
    }
    usePlayerStore.getState().setIsPlaying(false)
    this.stopLoop()
  }

  seek(ns: bigint) {
    if (!this.clock || !this.fileSummary) {
      return
    }
    const shouldResume = this.clock.getIsPlaying() || this.resumeAfterSeek
    if (this.clock.getIsPlaying()) {
      this.clock.pause()
      this.stopLoop()
    }
    this.resumeAfterSeek = shouldResume
    this.invalidatePlaybackQuery()
    this.clock.seek(ns)
    this.lastTickTimeNs = ns
    this.pendingQueryEndTimeNs = null
    setPlaybackElapsedNs(ns - this.fileSummary.startNs)

    // Notify visible panel instances before their targeted backfill arrives.
    globalMessagePipeline.emitSeek(ns)

    const generation = ++this.seekGeneration
    const worker = this.getSeekWorker()
    worker?.setSeekGeneration(generation).catch((error: unknown) => {
      console.error('Error updating seek generation in worker:', error)
    })
    // Keep only the most recent queued target while one backfill is running.
    this.pendingSeekBackfill = { generation, timeNs: ns }
    this.isSeekBackfillRunning = true
    void this.processPendingSeekBackfills()
  }

  setSpeed(speed: number) {
    if (!this.clock) {
      return
    }
    this.clock.setSpeed(speed)
    usePlayerStore.getState().setPlaybackSpeed(speed)
  }

  private startLoop() {
    if (this.animationFrameId) {
      return
    }
    const tick = () => {
      if (!this.clock || !this.fileSummary) {
        return
      }
      const current = this.clock.get()
      const start = this.lastTickTimeNs

      // If we finished the file
      if (current >= this.fileSummary.endNs) {
        this.pause()
        this.seek(this.fileSummary.endNs)
        return
      }

      setPlaybackElapsedNs(current - this.fileSummary.startNs)

      if (this.isRemoteSource) {
        this.maintainRemoteBuffer(current)
      }

      const seekBackfillPending = this.isSeekBackfillRunning || this.pendingSeekBackfill !== null
      const plan = globalMessagePipeline.getQueryPlan()
      const worker = this.getWorker()
      const hasPendingQueryBatch = this.pendingQueryEndTimeNs !== null
      if (!seekBackfillPending && plan.topics.length > 0 && (hasPendingQueryBatch || current > start) && worker) {
        if (!this.isQuerying) {
          this.isQuerying = true
          const queryEnd = this.pendingQueryEndTimeNs ?? current
          const version = this.queryVersion
          worker.getMessages(start, queryEnd, plan.topics, plan.modeByTopic, plan.processorsByTopic)
            .then((batch: PlaybackMessageBatch) => {
              if (version !== this.queryVersion) {
                return
              }
              this.lastTickTimeNs = batch.readThroughTimeNs
              this.pendingQueryEndTimeNs = batch.hasMore ? queryEnd : null

              const messages = this.playbackBatchAccumulator.consume(
                batch.messages,
                plan.modeByTopic,
                !batch.hasMore,
              )
              if (messages.length > 0) {
                globalMessagePipeline.dispatch(messages)
              }
            })
            .catch((err: any) => {
              if (version === this.queryVersion) {
                this.playbackBatchAccumulator.clear()
                this.pendingQueryEndTimeNs = null
              }
              console.error('Error fetching messages in play loop:', err)
            })
            .finally(() => {
              this.isQuerying = false
              this.maybeResumeRemotePlayback()
              this.resumePlaybackAfterSeekIfReady()
            })
        }
      }
      else if (!seekBackfillPending) {
        this.lastTickTimeNs = current
      }

      this.animationFrameId = requestAnimationFrame(tick)
    }
    this.animationFrameId = requestAnimationFrame(tick)
  }

  private async processPendingSeekBackfills() {
    if (this.isSeekProcessorRunning) {
      return
    }

    this.isSeekProcessorRunning = true
    this.isSeekBackfillRunning = true
    try {
      while (this.pendingSeekBackfill) {
        const request = this.pendingSeekBackfill
        this.pendingSeekBackfill = null
        const plan = globalMessagePipeline.getSeekQueryPlan(request.timeNs)
        const worker = this.getSeekWorker()
        if (plan.topics.length === 0 || !worker) {
          if (request.generation === this.seekGeneration) {
            globalMessagePipeline.emitSeekComplete(request.timeNs)
            this.isSeekBackfillRunning = false
            this.resumePlaybackAfterSeekIfReady()
          }
          continue
        }

        try {
          this.isSeekBackfillRunning = true
          const topicsByPhase = this.groupSeekTopicsByPhase(plan.topics)
          const completedTopics = new Set<string>()
          const completedPanelIds = new Set<string>()

          for (const phase of SEEK_BACKFILL_PHASES) {
            const phaseTopics = topicsByPhase[phase]
            if (phaseTopics.length > 0) {
              const messages = await worker.getBackfillMessages(
                request.timeNs,
                plan.topics,
                false,
                request.generation,
                phase,
                plan.processorsByTopic,
              )
              if (request.generation !== this.seekGeneration) {
                break
              }
              globalMessagePipeline.dispatchSeekResult(messages)
            }

            phaseTopics.forEach(topic => completedTopics.add(topic))
            if (request.generation !== this.seekGeneration) {
              break
            }
            const readyPanelIds = globalMessagePipeline
              .getSeekReadyPanelIds(completedTopics, request.timeNs)
              .filter(panelId => !completedPanelIds.has(panelId))
            readyPanelIds.forEach(panelId => completedPanelIds.add(panelId))
            globalMessagePipeline.emitSeekComplete(request.timeNs, readyPanelIds)

            // Spatial state is the last dependency that must gate the playback
            // clock. Media repair continues on the dedicated seek worker.
            if (phase === 'spatial') {
              this.isSeekBackfillRunning = false
              this.resumePlaybackAfterSeekIfReady()
            }
          }

          if (request.generation === this.seekGeneration) {
            this.isSeekBackfillRunning = false
            this.resumePlaybackAfterSeekIfReady()
          }
        }
        catch (error) {
          if (request.generation === this.seekGeneration) {
            console.error('Error fetching messages after seek:', error)
            globalMessagePipeline.emitSeekComplete(request.timeNs)
          }
        }
      }
    }
    finally {
      this.isSeekProcessorRunning = false
      this.isSeekBackfillRunning = false
      this.resumePlaybackAfterSeekIfReady()
    }
  }

  private groupSeekTopicsByPhase(topics: readonly string[]): Record<BackfillClass, string[]> {
    const result: Record<BackfillClass, string[]> = {
      fast: [],
      spatial: [],
      media: [],
    }
    const channels = this.fileSummary?.channels || []
    for (const topic of topics) {
      let backfillClass: BackfillClass = 'fast'
      for (const channel of channels) {
        if (channel.topic !== topic) {
          continue
        }
        const candidate = getBackfillClass(topic, channel.schemaName || '')
        if (candidate === 'spatial' || backfillClass === 'fast') {
          backfillClass = candidate
        }
      }
      result[backfillClass].push(topic)
    }
    return result
  }

  private resumePlaybackAfterSeekIfReady() {
    if (
      this.resumeAfterSeek
      && !this.isSeekBackfillRunning
      && !this.pendingSeekBackfill
      && !this.isQuerying
    ) {
      this.play()
    }
  }

  private invalidatePlaybackQuery() {
    this.queryVersion++
    this.pendingQueryEndTimeNs = null
    this.playbackBatchAccumulator.clear()
  }

  private stopLoop() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }
  }

  private startRemoteProgressPolling(loadGeneration: number) {
    this.stopRemoteProgressPolling()
    const session = this.remoteProgressSession
    const poll = async () => {
      if (
        session !== this.remoteProgressSession
        || loadGeneration !== this.loadGeneration
        || this.isRemoteProgressPolling
      ) {
        return
      }
      this.isRemoteProgressPolling = true
      try {
        const progress = await this.getWorker().getLoadProgress()
        if (session === this.remoteProgressSession && loadGeneration === this.loadGeneration) {
          this.applyRemoteLoadProgress(progress)
        }
      }
      catch (error) {
        if (session === this.remoteProgressSession && loadGeneration === this.loadGeneration) {
          console.warn('Failed to read remote MCAP progress:', error)
        }
      }
      finally {
        if (session === this.remoteProgressSession) {
          this.isRemoteProgressPolling = false
        }
      }
    }

    void poll()
    this.remoteProgressTimer = setInterval(() => {
      void poll()
    }, 500)
  }

  private stopRemoteProgressPolling() {
    this.remoteProgressSession++
    this.isRemoteProgressPolling = false
    if (this.remoteProgressTimer !== null) {
      clearInterval(this.remoteProgressTimer)
      this.remoteProgressTimer = null
    }
    this.remotePlayableTimeRanges = []
    this.remoteRangeBufferingAvailable = null
    usePlayerStore.getState().setRemoteLoadProgress(null)
  }

  /**
   * Size the remote buffer from the recording duration so short recordings do
   * not incur a fixed, oversized initial download.
   */
  private getRemoteBufferDurationNs(percent: bigint): bigint {
    if (!this.fileSummary) {
      return 0n
    }
    const durationNs = BigInt(this.fileSummary.endNs) - BigInt(this.fileSummary.startNs)
    return durationNs > 0n ? (durationNs * percent) / 100n : 0n
  }

  private getRemotePlayableEnd(timeNs: bigint): bigint | null {
    return getPlayableRangeEnd(this.remotePlayableTimeRanges, timeNs)
  }

  private hasRemoteBuffer(timeNs: bigint, minimumDurationNs: bigint): boolean {
    const playableEnd = this.getRemotePlayableEnd(timeNs)
    const requiredEnd = this.fileSummary
      ? (timeNs + minimumDurationNs < this.fileSummary.endNs ? timeNs + minimumDurationNs : this.fileSummary.endNs)
      : timeNs + minimumDurationNs
    return playableEnd !== null && playableEnd >= requiredEnd
  }

  private maintainRemoteBuffer(currentTimeNs: bigint) {
    if (this.remoteRangeBufferingAvailable === false) {
      return
    }
    const lowWaterNs = this.getRemoteBufferDurationNs(REMOTE_BUFFER_LOW_WATER_PERCENT)
    const targetNs = this.getRemoteBufferDurationNs(REMOTE_BUFFER_TARGET_PERCENT)
    if (!this.hasRemoteBuffer(currentTimeNs, lowWaterNs)) {
      this.enterRemoteBuffering(currentTimeNs)
    }
    if (!this.hasRemoteBuffer(currentTimeNs, targetNs)) {
      this.prefetchRemoteBuffer(currentTimeNs)
    }
  }

  private enterRemoteBuffering(currentTimeNs: bigint) {
    if (!this.isRemoteBuffering) {
      this.isRemoteBuffering = true
      usePlayerStore.getState().setIsRemoteBuffering(true)
      this.clock?.pause()
      this.lastTickTimeNs = currentTimeNs
      setPlaybackElapsedNs(currentTimeNs - (this.fileSummary?.startNs ?? currentTimeNs))
    }
    this.prefetchRemoteBuffer(currentTimeNs)
  }

  private prefetchRemoteBuffer(startTimeNs: bigint) {
    if (this.isRemotePrefetching || !this.isRemoteSource || !this.fileSummary) {
      return
    }
    const targetTimeNs = startTimeNs + this.getRemoteBufferDurationNs(REMOTE_BUFFER_TARGET_PERCENT)
    const endTimeNs = targetTimeNs < this.fileSummary.endNs ? targetTimeNs : this.fileSummary.endNs
    if (endTimeNs <= startTimeNs) {
      return
    }
    const generation = this.loadGeneration
    this.isRemotePrefetching = true
    this.getWorker().prefetchTimeRange(startTimeNs, endTimeNs)
      .then((progress: RemoteLoadProgress | null) => {
        if (generation === this.loadGeneration) {
          this.applyRemoteLoadProgress(progress)
        }
      })
      .catch((error: unknown) => {
        if (generation === this.loadGeneration) {
          console.warn('Failed to prefetch remote MCAP data:', error)
        }
      })
      .finally(() => {
        if (generation === this.loadGeneration) {
          this.isRemotePrefetching = false
          this.maybeResumeRemotePlayback()
        }
      })
  }

  private applyRemoteLoadProgress(progress: RemoteLoadProgress | null) {
    if (progress) {
      this.remotePlayableTimeRanges = progress.playableTimeRanges
      this.remoteRangeBufferingAvailable = progress.hasIndexedChunkCoverage
    }
    usePlayerStore.getState().setRemoteLoadProgress(progress)
    this.maybeResumeRemotePlayback()
  }

  private maybeResumeRemotePlayback() {
    if (!this.isRemoteBuffering || !this.clock || !this.fileSummary || this.isQuerying) {
      return
    }
    if (this.remoteRangeBufferingAvailable === false) {
      this.resumeRemoteClock()
      return
    }
    const currentTimeNs = this.clock.get()
    if (!this.hasRemoteBuffer(currentTimeNs, this.getRemoteBufferDurationNs(REMOTE_BUFFER_RESUME_PERCENT))) {
      return
    }
    this.resumeRemoteClock()
  }

  private resumeRemoteClock() {
    if (!this.clock || !this.isRemoteBuffering) {
      return
    }
    this.clock.seek(this.lastTickTimeNs)
    this.clock.play()
    this.isRemoteBuffering = false
    usePlayerStore.getState().setIsRemoteBuffering(false)
  }

  private resetRemoteBufferState() {
    this.isRemoteSource = false
    this.isRemoteBuffering = false
    this.remoteRangeBufferingAvailable = null
    this.remotePlayableTimeRanges = []
    this.isRemotePrefetching = false
    this.isRemoteFullDownloadRunning = false
    usePlayerStore.getState().setIsRemoteBuffering(false)
    usePlayerStore.getState().setIsRemoteFullDownloadRunning(false)
  }

  async downloadAllRemoteBlocks(): Promise<void> {
    if (!this.isRemoteSource || this.isRemoteFullDownloadRunning) {
      return
    }
    const generation = this.loadGeneration
    this.isRemoteFullDownloadRunning = true
    usePlayerStore.getState().setIsRemoteFullDownloadRunning(true)
    try {
      const progress = await this.getWorker().downloadAllRemoteBlocks()
      if (generation === this.loadGeneration) {
        this.applyRemoteLoadProgress(progress)
      }
    }
    catch (error) {
      if (generation === this.loadGeneration) {
        console.warn('Failed to cache all remote MCAP blocks:', error)
      }
    }
    finally {
      if (generation === this.loadGeneration) {
        this.isRemoteFullDownloadRunning = false
        usePlayerStore.getState().setIsRemoteFullDownloadRunning(false)
      }
    }
  }

  async getFirstMessagePayload(topic: string) {
    const worker = this.getWorker()
    if (!worker) {
      return null
    }
    return worker.getFirstMessagePayload(topic)
  }

  async getImageTopicDeliveryMode(topic: string): Promise<'all' | 'latest'> {
    const worker = this.getWorker()
    if (!worker) {
      return 'latest'
    }
    return worker.getImageTopicDeliveryMode(topic)
  }

  getPlotSeriesData(
    requests: PlotSeriesRequest[],
    startTimeNs: bigint,
    endTimeNs: bigint,
  ): { requestId: number, promise: Promise<PlotSeriesData[]> } {
    const requestId = ++this.nextPlotRequestId
    const worker = this.getWorker()
    if (!worker) {
      return { requestId, promise: Promise.resolve([]) }
    }
    return {
      requestId,
      promise: worker.getPlotSeriesData(requestId, requests, startTimeNs, endTimeNs),
    }
  }

  cancelPlotSeriesData(requestId: number) {
    this.getWorker()?.cancelPlotSeriesData(requestId).catch((error: unknown) => {
      console.warn('Failed to cancel plot data request:', error)
    })
  }

  getMessageTimelineData(): Promise<TimelineTopicData[]> {
    if (!this.fileSummary) {
      return Promise.resolve([])
    }
    if (this.timelineDataPromise) {
      return this.timelineDataPromise
    }

    const worker = this.getWorker()
    if (!worker) {
      return Promise.resolve([])
    }

    const request = worker.getMessageTimelineData(
      this.fileSummary.startNs,
      this.fileSummary.endNs,
    ) as Promise<TimelineTopicData[]>
    this.timelineDataPromise = request
    request.catch(() => {
      if (this.timelineDataPromise === request) {
        this.timelineDataPromise = null
      }
    })
    return request
  }
}

export const globalPlaybackController = new PlaybackController()
