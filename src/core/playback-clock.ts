export class PlaybackClock {
  private startNs: bigint = 0n
  private endNs: bigint = 0n
  private currentNs: bigint = 0n
  private isPlaying: boolean = false
  private speed: number = 1.0
  private lastWallTimeMs: number = 0
  private lastBagTimeNs: bigint = 0n

  constructor(startNs: bigint, endNs: bigint) {
    this.startNs = startNs
    this.endNs = endNs
    this.currentNs = startNs
    this.lastBagTimeNs = startNs
  }

  play() {
    if (this.isPlaying) {
      return
    }
    this.isPlaying = true
    this.lastWallTimeMs = performance.now()
    this.lastBagTimeNs = this.currentNs
  }

  pause() {
    if (!this.isPlaying) {
      return
    }
    this.currentNs = this.get()
    this.isPlaying = false
  }

  seek(ns: bigint) {
    let target = ns
    if (target < this.startNs) {
      target = this.startNs
    }
    if (target > this.endNs) {
      target = this.endNs
    }
    this.currentNs = target
    if (this.isPlaying) {
      this.lastWallTimeMs = performance.now()
      this.lastBagTimeNs = target
    }
  }

  setSpeed(speed: number) {
    const wasPlaying = this.isPlaying
    if (wasPlaying) {
      this.pause()
    }
    this.speed = speed
    if (wasPlaying) {
      this.play()
    }
  }

  get(): bigint {
    if (!this.isPlaying) {
      return this.currentNs
    }
    const nowMs = performance.now()
    const elapsedWallNs = BigInt(Math.round((nowMs - this.lastWallTimeMs) * 1_000_000))
    const elapsedBagNs = BigInt(Math.round(Number(elapsedWallNs) * this.speed))
    let time = this.lastBagTimeNs + elapsedBagNs
    if (time > this.endNs) {
      time = this.endNs
    }
    return time
  }

  getSpeed() {
    return this.speed
  }

  getIsPlaying() {
    return this.isPlaying
  }
}
