import { Download, FastForward, Pause, Play, Rewind } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FormattedMessage, useIntl } from 'react-intl'
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
import { formatBytes, formatDuration, formatNanoseconds } from '@/lib/time'
import { usePlayerStore } from '@/stores/use-player-store'

interface RemoteLoadTrackOverlayProps {
  ranges: ReadonlyArray<{ startNs: bigint, endNs: bigint }>
  startNs: bigint
  endNs: bigint
}

function getTrackPercent(valueNs: bigint, startNs: bigint, durationNs: bigint): number {
  if (durationNs <= 0n) {
    return 0
  }
  const scaled = ((valueNs - startNs) * 100_000n) / durationNs
  return Math.max(0, Math.min(100, Number(scaled) / 1000))
}

function RemoteLoadTrackOverlay({ ranges, startNs, endNs }: RemoteLoadTrackOverlayProps) {
  const durationNs = endNs - startNs
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {ranges.map((range) => {
        const rangeStart = range.startNs > startNs ? range.startNs : startNs
        const rangeEnd = range.endNs < endNs ? range.endNs : endNs
        const left = getTrackPercent(rangeStart, startNs, durationNs)
        const right = getTrackPercent(rangeEnd, startNs, durationNs)
        if (right <= left) {
          return null
        }
        return (
          <div
            key={`${range.startNs}:${range.endNs}`}
            className="absolute inset-y-0 rounded-sm bg-primary/35"
            style={{ left: `${left}%`, width: `${right - left}%` }}
          />
        )
      })}
    </div>
  )
}

export default function Playback() {
  const intl = useIntl()
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
    downloadAllRemoteBlocks,
    playbackSpeed,
    elapsedSeconds,
    durationSeconds,
    startNs,
    fileSummary,
  } = usePlaybackControls()
  const remoteLoadProgress = usePlayerStore(state => state.remoteLoadProgress)
  const isRemoteBuffering = usePlayerStore(state => state.isRemoteBuffering)
  const isRemoteFullDownloadRunning = usePlayerStore(state => state.isRemoteFullDownloadRunning)

  const displayedSeconds = scrubSeconds ?? elapsedSeconds
  const elapsedNs = BigInt(Math.round(displayedSeconds * 1_000_000_000))
  const durationNs = BigInt(Math.round(durationSeconds * 1_000_000_000))
  const realNs = fileSummary ? startNs + elapsedNs : 0n
  const endNs = fileSummary ? fileSummary.endNs : 0n

  const hoverElapsedNs = hoverInfo ? BigInt(Math.round(hoverInfo.seconds * 1_000_000_000)) : 0n
  const hoverRealNs = fileSummary && hoverInfo ? startNs + hoverElapsedNs : 0n
  const remoteTrackOverlay = useMemo(() => {
    if (!remoteLoadProgress || !fileSummary || fileSummary.endNs <= fileSummary.startNs) {
      return undefined
    }
    return (
      <RemoteLoadTrackOverlay
        ranges={remoteLoadProgress.playableTimeRanges}
        startNs={fileSummary.startNs}
        endNs={fileSummary.endNs}
      />
    )
  }, [fileSummary, remoteLoadProgress])

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
        className="relative flex min-h-5 w-full shrink-0 items-center py-1 cursor-pointer"
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
          trackOverlay={remoteTrackOverlay}
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
            <span className="text-[10px] text-muted-foreground/60 uppercase">
              <FormattedMessage id="playback.speed" defaultMessage="Speed:" />
            </span>
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
            title={intl.formatMessage({ id: 'playback.stepBackward', defaultMessage: 'Backward 1s' })}
          >
            <Rewind className="w-3.5 h-3.5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsPlaying(!isPlaying)}
            disabled={durationSeconds === 0}
            title={isPlaying
              ? intl.formatMessage({ id: 'playback.pause', defaultMessage: 'Pause' })
              : intl.formatMessage({ id: 'playback.play', defaultMessage: 'Play' })}
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
            title={intl.formatMessage({ id: 'playback.stepForward', defaultMessage: 'Forward 1s' })}
          >
            <FastForward className="w-3.5 h-3.5" />
          </Button>

          {remoteLoadProgress ? (
            <Button
              variant="ghost"
              size="icon"
              className={isRemoteBuffering ? 'text-amber-500' : remoteLoadProgress.isPersistedComplete ? 'text-emerald-500' : undefined}
              onClick={() => void downloadAllRemoteBlocks()}
              disabled={isRemoteFullDownloadRunning || remoteLoadProgress.isPersistedComplete}
              title={`${intl.formatMessage({
                id: remoteLoadProgress.isPersistedComplete
                  ? 'playback.remoteAvailableOffline'
                  : isRemoteFullDownloadRunning
                    ? 'playback.remoteCachingAll'
                    : 'playback.remoteCacheAll',
                defaultMessage: remoteLoadProgress.isPersistedComplete
                  ? 'Session cache complete'
                  : isRemoteFullDownloadRunning
                    ? 'Caching all data…'
                    : 'Cache all data',
              })}\n${intl.formatMessage(
                { id: 'playback.remoteLoadProgress', defaultMessage: 'Fetched {fetched} / {total} ({fetchedPercent}%) · Session cache {stored} ({storedPercent}%)' },
                {
                  fetched: formatBytes(remoteLoadProgress.downloadedBytes),
                  total: formatBytes(remoteLoadProgress.totalBytes),
                  fetchedPercent: Math.round(remoteLoadProgress.percent),
                  stored: formatBytes(remoteLoadProgress.persistedBytes),
                  storedPercent: Math.round(remoteLoadProgress.persistedPercent),
                },
              )}\n${intl.formatMessage(
                { id: 'playback.remoteMemoryCache', defaultMessage: 'Memory cache {resident}' },
                { resident: formatBytes(remoteLoadProgress.residentBytes) },
              )}`}
            >
              <Download className="w-3.5 h-3.5" />
            </Button>
          ) : null}
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
