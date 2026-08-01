import { FastForward, Pause, Play, Rewind } from 'lucide-react'
import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { usePlaybackControls } from '@/hooks/use-playback'
import { formatDuration, formatNanoseconds } from '@/lib/time'

export default function Playback() {
  const [scrubSeconds, setScrubSeconds] = useState<number | null>(null)
  const [hoverInfo, setHoverInfo] = useState<{ x: number, seconds: number } | null>(null)
  const sliderContainerRef = useRef<HTMLDivElement>(null)
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
    startNs,
    fileSummary,
  } = usePlaybackControls()

  const displayedSeconds = scrubSeconds ?? elapsedSeconds
  const elapsedNs = BigInt(Math.round(displayedSeconds * 1_000_000_000))
  const durationNs = BigInt(Math.round(durationSeconds * 1_000_000_000))
  const realNs = fileSummary ? startNs + elapsedNs : 0n
  const endNs = fileSummary ? fileSummary.endNs : 0n

  const hoverElapsedNs = hoverInfo ? BigInt(Math.round(hoverInfo.seconds * 1_000_000_000)) : 0n
  const hoverRealNs = fileSummary && hoverInfo ? startNs + hoverElapsedNs : 0n

  const tooltipRef = useRef<HTMLDivElement>(null)
  const hoverRealTextRef = useRef<HTMLDivElement>(null)
  const hoverElapsedTextRef = useRef<HTMLDivElement>(null)

  const commitPointerScrub = (value: number) => {
    isPointerScrubbingRef.current = false
    setScrubSeconds(null)
    seekTo(value)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (durationSeconds === 0 || !sliderContainerRef.current) {
      return
    }
    const rect = sliderContainerRef.current.getBoundingClientRect()
    const offsetX = Math.max(0, Math.min(rect.width, e.clientX - rect.left))
    const ratio = rect.width > 0 ? offsetX / rect.width : 0
    const hoverSec = ratio * durationSeconds

    const currentHoverElapsedNs = BigInt(Math.round(hoverSec * 1_000_000_000))
    const currentHoverRealNs = fileSummary ? startNs + currentHoverElapsedNs : 0n

    // Directly update DOM position for 0ms latency responsiveness
    if (tooltipRef.current) {
      const leftPos = rect.left + offsetX
      const topPos = rect.top - 8
      tooltipRef.current.style.left = `${leftPos}px`
      tooltipRef.current.style.top = `${topPos}px`
    }
    if (hoverRealTextRef.current) {
      hoverRealTextRef.current.textContent = fileSummary ? formatNanoseconds(currentHoverRealNs) : '--'
    }
    if (hoverElapsedTextRef.current) {
      hoverElapsedTextRef.current.textContent = formatDuration(currentHoverElapsedNs)
    }

    if (!hoverInfo) {
      setHoverInfo({ x: offsetX, seconds: hoverSec })
    }
  }

  const handlePointerLeave = () => {
    setHoverInfo(null)
  }

  const getInitialTooltipPos = () => {
    if (!sliderContainerRef.current || !hoverInfo) {
      return null
    }
    const rect = sliderContainerRef.current.getBoundingClientRect()
    return {
      left: rect.left + hoverInfo.x,
      top: rect.top - 8,
    }
  }

  const tooltipPos = getInitialTooltipPos()

  return (
    <div className="h-full flex flex-col justify-center px-4 py-1.5 bg-card text-card-foreground gap-1.5">
      {/* Progress Slider (Top Row) */}
      <div
        ref={sliderContainerRef}
        className="relative w-full flex items-center py-1 cursor-pointer"
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
        <Slider
          value={[displayedSeconds]}
          min={0}
          max={durationSeconds || 1}
          step={0.001}
          onValueChange={(values) => {
            isPointerScrubbingRef.current = true
            setScrubSeconds(values[0])
          }}
          onValueCommit={(values) => {
            commitPointerScrub(values[0])
          }}
          disabled={durationSeconds === 0}
          className="w-full cursor-pointer"
        />

        {/* Zero-latency Hover Time Tooltip via Direct DOM & Portal */}
        {hoverInfo && durationSeconds > 0 && tooltipPos && createPortal(
          <div
            ref={tooltipRef}
            className="fixed -translate-x-1/2 -translate-y-full pointer-events-none z-9999 flex flex-col items-center bg-popover/95 text-popover-foreground border border-border shadow-xl backdrop-blur-md px-2.5 py-1.5 rounded-md font-mono text-[10px] leading-tight tracking-tight whitespace-nowrap will-change-transform"
            style={{
              left: `${tooltipPos.left}px`,
              top: `${tooltipPos.top}px`,
            }}
          >
            <div ref={hoverRealTextRef} className="text-foreground/90 font-medium">
              {fileSummary ? formatNanoseconds(hoverRealNs) : '--'}
            </div>
            <div ref={hoverElapsedTextRef} className="text-muted-foreground text-[9px]">
              {formatDuration(hoverElapsedNs)}
            </div>
            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-popover/95" />
          </div>,
          document.body,
        )}
      </div>

      {/* Controls & Time (Bottom Row) */}
      <div className="flex items-center justify-between w-full min-w-0">
        {/* Left: Speed Selector */}
        <div className="flex-1 flex items-center justify-start">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
            <span className="text-[10px] text-muted-foreground/60 uppercase">Speed:</span>
            <Select
              value={String(playbackSpeed)}
              onValueChange={val => setPlaybackSpeed(Number.parseFloat(val))}
              disabled={durationSeconds === 0}
            >
              <SelectTrigger size="sm" className="font-mono text-[11px] h-7 min-w-16.25">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start" className="min-w-18.75 font-mono text-[11px]">
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
        </div>

        {/* Center: Playback Control Buttons */}
        <div className="flex items-center justify-center gap-1">
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
            onClick={() => stepForward(1)}
            disabled={durationSeconds === 0}
            title="Forward 1s"
          >
            <FastForward className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Right: Time Text */}
        <div className="flex-1 flex flex-col items-end text-right text-[10px] leading-tight font-mono tracking-tight gap-0.5 select-none">
          <div className="text-foreground/90">
            {fileSummary ? formatNanoseconds(realNs, 3) : '--'}
            {' / '}
            {fileSummary ? formatNanoseconds(endNs, 3) : '--'}
          </div>
          <div className="text-muted-foreground">
            {formatDuration(elapsedNs, 3)}
            {' / '}
            {formatDuration(durationNs, 3)}
          </div>
        </div>
      </div>
    </div>
  )
}
