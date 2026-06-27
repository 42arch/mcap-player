import type { MouseEvent } from 'react'
import { PauseIcon, PlayIcon, SkipBackIcon, SkipForwardIcon } from '@phosphor-icons/react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

export interface PlaybackControlProps {
  currentTime: number
  duration: number
  isPlaying: boolean
  playbackSpeed: number
  onPlayPause: (playing: boolean) => void
  onSeek: (time: number) => void
  onSpeedChange: (speed: number) => void
  eventMarkers?: Array<{ time: number, label: string, type: string }>
}

export default function PlaybackControl({
  currentTime,
  duration,
  isPlaying,
  playbackSpeed,
  onPlayPause,
  onSeek,
  onSpeedChange,
  eventMarkers = [],
}: PlaybackControlProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [hoverTime, setHoverTime] = useState<number | null>(null)
  const timelineRef = useRef<HTMLDivElement>(null)

  const updateTimeFromClientX = (clientX: number) => {
    if (!timelineRef.current)
      return 0
    const rect = timelineRef.current.getBoundingClientRect()
    const x = clientX - rect.left
    const percentage = Math.max(0, Math.min(1, x / rect.width))
    return percentage * duration
  }

  // Click & Drag on timeline to seek
  const handleTimelineMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0)
      return
    setIsDragging(true)
    const t = updateTimeFromClientX(e.clientX)
    onSeek(t)
    setHoverTime(t)

    const handleMouseMove = (moveEvent: globalThis.MouseEvent) => {
      const newTime = updateTimeFromClientX(moveEvent.clientX)
      onSeek(newTime)
      setHoverTime(newTime)
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      setHoverTime(null)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  // Hover timeline to preview time
  const handleTimelineMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (isDragging)
      return
    const t = updateTimeFromClientX(e.clientX)
    setHoverTime(t)
  }

  const handleTimelineMouseLeave = () => {
    if (!isDragging) {
      setHoverTime(null)
    }
  }

  // Helper to format seconds to time string (MM:SS.ms)
  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60)
    const remainingSecs = (secs % 60).toFixed(3)
    return `${mins.toString().padStart(2, '0')}:${remainingSecs.padStart(6, '0')}`
  }

  const progressPercentage = (currentTime / duration) * 100

  return (
    <div className="w-full h-full flex flex-col bg-bottompanel text-text-main overflow-hidden border border-layout-border select-none font-mono text-xs">
      {/* Control bar */}
      <div className="h-[34px] bg-titlebar border-b border-layout-border flex items-center justify-between px-3 shrink-0">
        {/* Left Side: Playback Controls */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => onPlayPause(!isPlaying)}
            className="text-layout-primary hover:scale-105 transition-all cursor-pointer"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <PauseIcon size={14} weight="fill" /> : <PlayIcon size={14} weight="fill" />}
          </Button>

          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => onSeek(Math.max(0, currentTime - 10))}
            className="text-text-secondary hover:text-text-main cursor-pointer"
            title="Backward 10s"
          >
            <SkipBackIcon size={13} />
          </Button>

          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => onSeek(Math.min(duration, currentTime + 10))}
            className="text-text-secondary hover:text-text-main cursor-pointer"
            title="Forward 10s"
          >
            <SkipForwardIcon size={13} />
          </Button>

          <div className="h-4 w-px bg-layout-border/80 mx-1"></div>

          {/* Time Counter */}
          <div className="text-[11px] font-semibold text-text-main flex items-center gap-1.5">
            <span className="text-layout-primary">{formatTime(currentTime)}</span>
            <span className="text-text-secondary">/</span>
            <span className="text-text-secondary">{formatTime(duration)}</span>
          </div>
        </div>

        {/* Center: Metadata */}
        <div className="hidden sm:flex items-center gap-2 text-[10px] text-text-secondary">
          <span className="bg-layout-hover px-1.5 py-0.5 rounded-[1px] border border-layout-border/40">
            Source: demo_robot_run.mcap
          </span>
          <span className="bg-layout-hover px-1.5 py-0.5 rounded-[1px] border border-layout-border/40">
            FPS: 60Hz
          </span>
        </div>

        {/* Right Side: Speed */}
        <div className="flex items-center gap-2">
          {/* Speed Selector */}
          <div className="flex items-center gap-1">
            {[0.5, 1.0, 2.0].map(speed => (
              <Button
                key={speed}
                variant={playbackSpeed === speed ? 'outline' : 'ghost'}
                size="xs"
                onClick={() => onSpeedChange(speed)}
                className={`text-[10px] cursor-pointer transition-colors ${
                  playbackSpeed === speed
                    ? 'bg-layout-active border-layout-primary/30 text-layout-primary font-bold'
                    : 'text-text-secondary hover:text-text-main'
                }`}
              >
                {speed.toFixed(1)}
                x
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Timeline Ruler & Track */}
      <div className="flex-1 flex flex-col justify-center px-4 bg-panel py-2 overflow-hidden relative">
        <div
          ref={timelineRef}
          onMouseDown={handleTimelineMouseDown}
          onMouseMove={handleTimelineMouseMove}
          onMouseLeave={handleTimelineMouseLeave}
          className="h-10 bg-layout-hover border border-layout-border/80 relative rounded-[2px] cursor-pointer overflow-visible flex items-end pb-1.5 select-none"
        >
          {/* Progress fill */}
          <div
            className="absolute left-0 top-0 bottom-0 bg-layout-primary/10 border-r border-layout-primary/30 pointer-events-none"
            style={{ width: `${progressPercentage}%` }}
          />

          {/* Time Tick Ruler Marks */}
          {Array.from({ length: 13 }).map((_, idx) => {
            const timeVal = (idx / 12) * duration
            const leftPerc = (idx / 12) * 100
            return (
              <div
                key={idx}
                className="absolute flex flex-col items-center pointer-events-none"
                style={{ left: `${leftPerc}%`, transform: 'translateX(-50%)' }}
              >
                <div className="w-px h-3 bg-layout-border"></div>
                <span className="text-[9px] text-text-secondary mt-1 select-none">
                  {timeVal.toFixed(0)}
                  s
                </span>
              </div>
            )
          })}

          {/* Event markers on timeline */}
          {eventMarkers.map((marker, idx) => {
            const leftPerc = (marker.time / duration) * 100
            return (
              <div
                key={idx}
                className={`absolute w-2 h-2 rounded-full border border-panel pointer-events-none transform -translate-x-1/2 -translate-y-1/2 top-1/2 shadow-sm ${
                  marker.type === 'error'
                    ? 'bg-red-500'
                    : marker.type === 'warning'
                      ? 'bg-yellow-500'
                      : 'bg-blue-500'
                }`}
                style={{ left: `${leftPerc}%` }}
                title={`${marker.label} (${marker.time}s)`}
              />
            )
          })}

          {/* Playhead Marker */}
          <div
            className="absolute top-0 bottom-0 w-[2px] bg-layout-primary pointer-events-none overflow-visible"
            style={{ left: `${progressPercentage}%` }}
          >
            <div className="absolute top-0 transform -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-layout-primary rounded-full shadow-md border-2 border-panel" />
          </div>

          {/* Hover Preview Tooltip */}
          {hoverTime !== null && (
            <div
              className="absolute bg-[#1E1E1E] text-white text-[9px] px-1.5 py-0.5 rounded-[1px] shadow-md border border-[#3C3C3C] pointer-events-none transform -translate-x-1/2 bottom-12 z-50 font-bold font-mono"
              style={{ left: `${(hoverTime / duration) * 100}%` }}
            >
              {formatTime(hoverTime)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
