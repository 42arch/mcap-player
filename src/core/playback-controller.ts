import { wrap } from 'comlink'
import { usePlayerStore } from '@/stores/use-player-store'
import { globalMessageBus } from './message-bus'
import { PlaybackClock } from './playback-clock'

export class PlaybackController {
  private worker: any = null
  private clock: PlaybackClock | null = null
  private animationFrameId: number | null = null
  private lastTickTimeNs: bigint = 0n
  private fileSummary: any = null
  private isQuerying = false
  private queryVersion = 0

  constructor() {
    if (typeof window !== 'undefined') {
      let prevSubscribed = new Set<string>()
      usePlayerStore.subscribe((state) => {
        const currentSubscribed = state.subscribedTopics
        const hasChanged = currentSubscribed.size !== prevSubscribed.size
          || !Array.from(currentSubscribed).every(t => prevSubscribed.has(t))

        if (hasChanged) {
          prevSubscribed = new Set(currentSubscribed)
          if (this.clock && !this.clock.getIsPlaying()) {
            this.triggerBackfill()
          }
        }
      })
    }
  }

  triggerBackfill() {
    if (!this.clock || !this.fileSummary) {
      return
    }
    const ns = this.clock.get()
    const subscribed = Array.from(usePlayerStore.getState().subscribedTopics)
    const worker = this.getWorker()
    if (subscribed.length > 0 && worker) {
      this.queryVersion++
      const version = this.queryVersion
      const binaryFormat = usePlayerStore.getState().messagesSettings.binaryFormat
      worker.getBackfillMessages(ns, subscribed, binaryFormat).then((messages: any[]) => {
        if (version !== this.queryVersion) {
          return
        }
        for (const msg of messages) {
          globalMessageBus.publish(msg.topic, msg)
        }
      })
    }
  }

  private getWorker() {
    if (typeof window === 'undefined') {
      return null
    }
    if (!this.worker) {
      const rawWorker = new Worker(
        new URL('../infra/workers/mcap.worker.ts', import.meta.url),
      )
      this.worker = wrap(rawWorker)
    }
    return this.worker
  }

  async loadFile(file: File) {
    this.pause()
    const worker = this.getWorker()
    if (!worker) {
      return
    }

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
    this.isQuerying = false
    this.clock.seek(ns)
    this.lastTickTimeNs = ns
    usePlayerStore.getState().setElapsedNs(ns - this.fileSummary.startNs)

    // Notify listeners that we seeked so they can clear buffers
    globalMessageBus.publish('__seek__', ns)

    // Trigger backfill
    const subscribed = Array.from(usePlayerStore.getState().subscribedTopics)
    const worker = this.getWorker()
    if (worker) {
      const version = this.queryVersion
      const binaryFormat = usePlayerStore.getState().messagesSettings.binaryFormat
      worker.getBackfillMessages(ns, subscribed, binaryFormat).then((messages: any[]) => {
        if (version !== this.queryVersion) {
          return
        }
        for (const msg of messages) {
          globalMessageBus.publish(msg.topic, msg)
        }
      })
    }
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

      const subscribed = Array.from(usePlayerStore.getState().subscribedTopics)
      const worker = this.getWorker()
      if (subscribed.length > 0 && current > start && worker) {
        if (!this.isQuerying) {
          this.isQuerying = true
          const queryEnd = current
          const version = this.queryVersion
          const binaryFormat = usePlayerStore.getState().messagesSettings.binaryFormat
          worker.getMessages(start, queryEnd, subscribed, binaryFormat)
            .then((messages: any[]) => {
              if (version !== this.queryVersion) {
                return
              }
              this.lastTickTimeNs = queryEnd
              for (const msg of messages) {
                globalMessageBus.publish(msg.topic, msg)
              }
            })
            .catch((err: any) => {
              console.error('Error fetching messages in play loop:', err)
            })
            .finally(() => {
              if (version === this.queryVersion) {
                this.isQuerying = false
              }
            })
        }
      }
      else {
        this.lastTickTimeNs = current
      }

      this.animationFrameId = requestAnimationFrame(tick)
    }
    this.animationFrameId = requestAnimationFrame(tick)
  }

  private stopLoop() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }
  }
}

export const globalPlaybackController = new PlaybackController()
