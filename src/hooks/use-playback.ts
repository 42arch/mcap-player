import { globalPlaybackController } from '@/core/playback-controller'
import { usePlaybackElapsedNs } from '@/core/playback-time-store'
import { usePlayerStore } from '@/stores/use-player-store'

export function usePlaybackControls() {
  const isPlaying = usePlayerStore(state => state.isPlaying)
  const playbackSpeed = usePlayerStore(state => state.playbackSpeed)
  const elapsedNs = usePlaybackElapsedNs()
  const fileSummary = usePlayerStore(state => state.fileSummary)

  const durationNs = fileSummary ? fileSummary.durationNs : 0n
  const startNs = fileSummary ? fileSummary.startNs : 0n
  const elapsedSeconds = Number(elapsedNs) / 1_000_000_000
  const durationSeconds = Number(durationNs) / 1_000_000_000

  const setIsPlaying = (playing: boolean) => {
    if (playing) {
      globalPlaybackController.play()
    }
    else {
      globalPlaybackController.pause()
    }
  }

  const seekTo = (seconds: number) => {
    if (!fileSummary) {
      return
    }
    const ns = BigInt(Math.round(seconds * 1_000_000_000)) + fileSummary.startNs
    globalPlaybackController.seek(ns)
  }

  const setPlaybackSpeed = (speed: number) => {
    globalPlaybackController.setSpeed(speed)
  }

  const stepBackward = (seconds = 5) => {
    if (!fileSummary) {
      return
    }
    const target = Math.max(0, elapsedSeconds - seconds)
    seekTo(target)
  }

  const stepForward = (seconds = 5) => {
    if (!fileSummary) {
      return
    }
    const target = Math.min(durationSeconds, elapsedSeconds + seconds)
    seekTo(target)
  }

  return {
    isPlaying,
    setIsPlaying,
    scrubTo: seekTo,
    seekTo,
    stepBackward,
    stepForward,
    setPlaybackSpeed,
    playbackSpeed,
    elapsedSeconds,
    durationSeconds,
    startNs,
    fileSummary,
  }
}
