import { FastForward, Pause, Play, Rewind } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { usePlaybackControls } from '@/hooks/use-playback'
import { formatDuration } from '@/lib/time'

export default function PlayBack() {
  const [scrubSeconds, setScrubSeconds] = useState<number | null>(null)
  const isPointerScrubbingRef = useRef(false)
  const {
    isPlaying,
    setIsPlaying,
    seekTo,
    stepBackward,
    stepForward,
    setPlaybackSpeed,
    playbackSpeed,
    elapsedSeconds,
    durationSeconds,
  } = usePlaybackControls()

  const displayedSeconds = scrubSeconds ?? elapsedSeconds
  const elapsedNs = BigInt(Math.round(displayedSeconds * 1_000_000_000))
  const durationNs = BigInt(Math.round(durationSeconds * 1_000_000_000))

  const commitPointerScrub = (value: string) => {
    if (!isPointerScrubbingRef.current) {
      return
    }
    isPointerScrubbingRef.current = false
    setScrubSeconds(null)
    seekTo(Number.parseFloat(value))
  }

  return (
    <div className="h-full flex items-center justify-between px-4 bg-card text-card-foreground">
      {/* Playback Controls */}
      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsPlaying(!isPlaying)}
          disabled={durationSeconds === 0}
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying
            ? (
                <Pause className="w-3.5 h-3.5 text-primary" />
              )
            : (
                <Play className="w-3.5 h-3.5" />
              )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => stepBackward(1)}
          disabled={durationSeconds === 0}
          title="Backward 1s"
        >
          <Rewind className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => stepForward(1)}
          disabled={durationSeconds === 0}
          title="Forward 1s"
        >
          <FastForward className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Progress Slider */}
      <div className="flex-1 flex items-center px-2 max-w-4xl min-w-0">
        <input
          type="range"
          min={0}
          max={durationSeconds || 1}
          step={0.001}
          value={displayedSeconds}
          onPointerDown={(event) => {
            isPointerScrubbingRef.current = true
            setScrubSeconds(Number.parseFloat(event.currentTarget.value))
          }}
          onPointerUp={event => commitPointerScrub(event.currentTarget.value)}
          onPointerCancel={() => {
            isPointerScrubbingRef.current = false
            setScrubSeconds(null)
          }}
          onChange={(event) => {
            const value = Number.parseFloat(event.currentTarget.value)
            if (isPointerScrubbingRef.current) {
              setScrubSeconds(value)
            }
            else {
              seekTo(value)
            }
          }}
          disabled={durationSeconds === 0}
          className="w-full h-1 bg-border rounded-lg appearance-none cursor-pointer accent-primary focus:outline-hidden disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        />
      </div>

      {/* Speed and Time display */}
      <div className="flex items-center gap-4 shrink-0 text-xs text-muted-foreground font-mono">
        {/* Speed Selector */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground/60 uppercase">Speed:</span>
          <Select
            value={String(playbackSpeed)}
            onValueChange={val => setPlaybackSpeed(Number.parseFloat(val))}
            disabled={durationSeconds === 0}
          >
            <SelectTrigger size="sm" className="font-mono text-[11px] min-w-16.25">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="end" className="min-w-18.75 font-mono text-[11px]">
              <SelectItem value="0.1">0.1x</SelectItem>
              <SelectItem value="0.25">0.25x</SelectItem>
              <SelectItem value="0.5">0.5x</SelectItem>
              <SelectItem value="1">1.0x</SelectItem>
              <SelectItem value="2">2.0x</SelectItem>
              <SelectItem value="5">5.0x</SelectItem>
              <SelectItem value="10">10.0x</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Time Text */}
        <div className="select-none tracking-tight">
          {formatDuration(elapsedNs)}
          {' '}
          /
          {' '}
          {formatDuration(durationNs)}
        </div>
      </div>
    </div>
  )
}
