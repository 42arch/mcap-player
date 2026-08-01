import type { TimelineTopicData } from '@/core/workers/timeline-data'
import { wrap } from 'comlink'
import { globalMessagePipeline } from '@/panels/runtime/message-pipeline'
import { usePlayerStore } from '@/stores/use-player-store'
import { PlaybackClock } from './playback-clock'

interface PendingSeekBackfill {
  generation: number
  timeNs: bigint
}

export class PlaybackController {
  private worker: any = null
  private clock: PlaybackClock | null = null
  private animationFrameId: number | null = null
  private lastTickTimeNs: bigint = 0n
  private fileSummary: any = null
  private isQuerying = false
  private queryVersion = 0
  private pendingBackfillPanelIds = new Set<string>()
  private backfillScheduled = false
  private seekGeneration = 0
  private pendingSeekBackfill: PendingSeekBackfill | null = null
  private isSeekBackfillRunning = false
  private timelineDataPromise: Promise<TimelineTopicData[]> | null = null

  constructor() {
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
    const worker = this.getWorker()
    if (plan.topics.length > 0 && worker) {
      this.queryVersion++
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

  async loadFile(file: File) {
    this.pause()
    this.timelineDataPromise = null
    const worker = this.getWorker()
    const summary = await worker.initialize(file)
    this.fileSummary = summary
    this.clock = new PlaybackClock(summary.startNs, summary.endNs)
    this.lastTickTimeNs = summary.startNs

    // update Zustand store
    const store = usePlayerStore.getState()
    store.setFileSummary(summary)
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

    this.clock.play()
    this.lastTickTimeNs = this.clock.get()
    usePlayerStore.getState().setIsPlaying(true)
    this.startLoop()
  }

  pause() {
    if (!this.clock || !this.clock.getIsPlaying()) {
      return
    }
    this.clock.pause()
    usePlayerStore.getState().setIsPlaying(false)
    this.stopLoop()
  }

  seek(ns: bigint) {
    if (!this.clock || !this.fileSummary) {
      return
    }
    this.queryVersion++
    this.clock.seek(ns)
    this.lastTickTimeNs = ns
    usePlayerStore.getState().setElapsedNs(ns - this.fileSummary.startNs)

    // Notify visible panel instances before their targeted backfill arrives.
    globalMessagePipeline.emitSeek(ns)

    const generation = ++this.seekGeneration
    const worker = this.getWorker()
    worker?.setSeekGeneration(generation).catch((error: unknown) => {
      console.error('Error updating seek generation in worker:', error)
    })
    // Keep only the most recent queued target while one backfill is running.
    this.pendingSeekBackfill = { generation, timeNs: ns }
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

      usePlayerStore.getState().setElapsedNs(current - this.fileSummary.startNs)

      const seekBackfillPending = this.isSeekBackfillRunning || this.pendingSeekBackfill !== null
      const plan = globalMessagePipeline.getQueryPlan()
      const worker = this.getWorker()
      if (!seekBackfillPending && plan.topics.length > 0 && current > start && worker) {
        if (!this.isQuerying) {
          this.isQuerying = true
          const queryEnd = current
          const version = this.queryVersion
          worker.getMessages(start, queryEnd, plan.topics, plan.modeByTopic, plan.processorsByTopic)
            .then((messages: any[]) => {
              if (version !== this.queryVersion) {
                return
              }
              this.lastTickTimeNs = queryEnd

              globalMessagePipeline.dispatch(messages)
            })
            .catch((err: any) => {
              console.error('Error fetching messages in play loop:', err)
            })
            .finally(() => {
              this.isQuerying = false
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
    if (this.isSeekBackfillRunning) {
      return
    }

    this.isSeekBackfillRunning = true
    try {
      while (this.pendingSeekBackfill) {
        const request = this.pendingSeekBackfill
        this.pendingSeekBackfill = null
        const plan = globalMessagePipeline.getSeekQueryPlan(request.timeNs)
        const worker = this.getWorker()
        if (plan.topics.length === 0 || !worker) {
          if (request.generation === this.seekGeneration) {
            globalMessagePipeline.emitSeekComplete(request.timeNs)
          }
          continue
        }

        try {
          const fastMessages = await worker.getBackfillMessages(
            request.timeNs,
            plan.topics,
            false,
            request.generation,
            'fast',
            plan.processorsByTopic,
          )
          if (request.generation !== this.seekGeneration) {
            continue
          }
          globalMessagePipeline.dispatchSeekResult(fastMessages)

          const slowMessages = await worker.getBackfillMessages(
            request.timeNs,
            plan.topics,
            false,
            request.generation,
            'slow',
            plan.processorsByTopic,
          )
          if (request.generation === this.seekGeneration) {
            globalMessagePipeline.dispatchSeekResult(slowMessages)
            globalMessagePipeline.emitSeekComplete(request.timeNs)
          }
        }
        catch (error) {
          if (request.generation === this.seekGeneration) {
            console.error('Error fetching messages after seek:', error)
          }
        }
      }
    }
    finally {
      this.isSeekBackfillRunning = false
    }
  }

  private stopLoop() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }
  }

  async getFirstMessagePayload(topic: string) {
    const worker = this.getWorker()
    if (!worker) {
      return null
    }
    return worker.getFirstMessagePayload(topic)
  }

  async getTopicFieldValues(topic: string, path: string, startNs: bigint) {
    const worker = this.getWorker()
    if (!worker) {
      return { times: [], values: [] }
    }
    return worker.getTopicFieldValues(topic, path, startNs)
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

    const request = worker.getMessageTimelineData(this.fileSummary.startNs) as Promise<TimelineTopicData[]>
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
