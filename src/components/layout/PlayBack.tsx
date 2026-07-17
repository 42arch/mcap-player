import { Pause, Play, SkipBack, SkipForward } from 'lucide-react'
import { usePlaybackControls } from '@/hooks/usePlayback'
import { formatDuration } from '@/lib/time'

export default function PlayBack() {
  const {
    isPlaying,
    setIsPlaying,
    seekTo,
    setPlaybackSpeed,
    playbackSpeed,
    elapsedSeconds,
    durationSeconds,
  } = usePlaybackControls()

  const elapsedNs = BigInt(Math.round(elapsedSeconds * 1_000_000_000))
  const durationNs = BigInt(Math.round(durationSeconds * 1_000_000_000))

  return (
    <div className="h-full flex items-center justify-between px-4 bg-card text-card-foreground">
      {/* Playback Controls */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => seekTo(0)}
          disabled={durationSeconds === 0}
          className="p-1.5 hover:bg-accent rounded-md text-muted-foreground hover:text-foreground cursor-pointer transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
          title="Back to start"
        >
          <SkipBack className="w-4 h-4" />
        </button>
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          disabled={durationSeconds === 0}
          className="p-1.5 hover:bg-accent rounded-md text-muted-foreground hover:text-foreground cursor-pointer transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying
            ? (
                <Pause className="w-4 h-4 text-primary" />
              )
            : (
                <Play className="w-4 h-4" />
              )}
        </button>
        <button
          onClick={() => seekTo(durationSeconds)}
          disabled={durationSeconds === 0}
          className="p-1.5 hover:bg-accent rounded-md text-muted-foreground hover:text-foreground cursor-pointer transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
          title="Skip to end"
        >
          <SkipForward className="w-4 h-4" />
        </button>
      </div>

      {/* Progress Slider */}
      <div className="flex-1 flex items-center px-4 max-w-4xl min-w-0">
        <input
          type="range"
          min={0}
          max={durationSeconds || 1}
          step={0.001}
          value={elapsedSeconds}
          onChange={e => seekTo(Number.parseFloat(e.target.value))}
          disabled={durationSeconds === 0}
          className="w-full h-1 bg-border rounded-lg appearance-none cursor-pointer accent-primary focus:outline-hidden disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        />
      </div>

      {/* Speed and Time display */}
      <div className="flex items-center gap-4 shrink-0 text-xs text-muted-foreground font-mono">
        {/* Speed Selector */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground/60 uppercase">Speed:</span>
          <select
            value={playbackSpeed}
            onChange={e => setPlaybackSpeed(Number.parseFloat(e.target.value))}
            disabled={durationSeconds === 0}
            className="bg-background border border-border rounded-md px-1.5 py-0.5 text-[11px] font-mono text-foreground focus:outline-hidden focus:ring-1 focus:ring-ring disabled:opacity-40 cursor-pointer"
          >
            <option value={0.1}>0.1x</option>
            <option value={0.25}>0.25x</option>
            <option value={0.5}>0.5x</option>
            <option value={1.0}>1.0x</option>
            <option value={2.0}>2.0x</option>
            <option value={5.0}>5.0x</option>
            <option value={10.0}>10.0x</option>
          </select>
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
