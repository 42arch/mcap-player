import { useEffect } from 'react'
import { useMcapStore } from '@/stores/mcap'
import PlaybackControl from './PlaybackControl'

export default function BottomArea() {
  const isPlaying = useMcapStore(state => state.isPlaying)
  const setIsPlaying = useMcapStore(state => state.setIsPlaying)
  const currentTime = useMcapStore(state => state.elapsedSeconds)
  const setCurrentTime = useMcapStore(state => state.setElapsedSeconds)
  const playbackSpeed = useMcapStore(state => state.playbackSpeed)
  const setPlaybackSpeed = useMcapStore(state => state.setPlaybackSpeed)
  const duration = useMcapStore(state => state.durationSeconds)

  // Playback timer effect using requestAnimationFrame for smooth, precise updates
  useEffect(() => {
    if (!isPlaying)
      return

    let animationFrameId: number
    let lastTime = performance.now()

    const tick = (now: number) => {
      const delta = (now - lastTime) / 1000
      lastTime = now

      setCurrentTime((prev) => {
        const next = prev + delta * playbackSpeed
        if (next >= duration) {
          return 0
        }
        return next
      })

      animationFrameId = requestAnimationFrame(tick)
    }

    animationFrameId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animationFrameId)
  }, [isPlaying, playbackSpeed, duration, setCurrentTime])

  // Mock event markers on the timeline
  const eventMarkers = [
    { time: 10.2, label: 'ROS Started', type: 'info' },
    { time: 31.0, label: 'Lidars Calibrated', type: 'info' },
    { time: 82.1, label: 'Controller Warning', type: 'warning' },
    { time: 105.5, label: 'Planner Error', type: 'error' },
  ]

  const effectiveDuration = duration > 0 ? duration : 0.001

  return (
    <PlaybackControl
      currentTime={currentTime}
      duration={effectiveDuration}
      isPlaying={isPlaying}
      playbackSpeed={playbackSpeed}
      onPlayPause={setIsPlaying}
      onSeek={setCurrentTime}
      onSpeedChange={setPlaybackSpeed}
      eventMarkers={duration > 0 ? eventMarkers : []}
    />
  )
}
