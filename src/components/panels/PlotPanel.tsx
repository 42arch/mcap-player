import { ChartLineIcon, PauseIcon, PlayIcon, SlidersIcon } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

export default function PlotPanel() {
  const [isPlaying, setIsPlaying] = useState(true)
  const [points, setPoints] = useState<number[]>([40, 45, 42, 50, 58, 55, 60, 68, 62, 58, 65, 70, 75, 72, 80, 85, 78, 82, 90, 88])

  useEffect(() => {
    if (!isPlaying)
      return
    const interval = setInterval(() => {
      setPoints((prev) => {
        const next = [...prev.slice(1)]
        const last = prev[prev.length - 1]
        const change = (Math.random() - 0.5) * 15
        const newVal = Math.max(10, Math.min(95, last + change))
        next.push(newVal)
        return next
      })
    }, 500)
    return () => clearInterval(interval)
  }, [isPlaying])

  // Convert points to SVG polyline coordinates
  const svgWidth = 500
  const svgHeight = 200
  const padding = 20
  const chartWidth = svgWidth - padding * 2
  const chartHeight = svgHeight - padding * 2

  const pointsString = points
    .map((val, idx) => {
      const x = padding + (idx / (points.length - 1)) * chartWidth
      const y = padding + chartHeight - (val / 100) * chartHeight
      return `${x},${y}`
    })
    .join(' ')

  return (
    <div className="w-full h-full bg-panel text-text-main flex flex-col font-mono text-xs overflow-hidden">
      {/* Plot Panel Controls */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-layout-border bg-titlebar h-8 text-[11px]">
        <div className="flex items-center gap-2">
          <ChartLineIcon size={13} className="text-layout-primary" />
          <span className="font-semibold">/diagnostics/velocity</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setIsPlaying(!isPlaying)}
            className="text-text-secondary hover:text-text-main cursor-pointer"
          >
            {isPlaying ? <PauseIcon size={12} /> : <PlayIcon size={12} />}
          </Button>
          <Button variant="ghost" size="icon-xs" className="text-text-secondary hover:text-text-main cursor-pointer">
            <SlidersIcon size={12} />
          </Button>
        </div>
      </div>

      {/* Plot Graph Area */}
      <div className="flex-1 p-3 flex flex-col justify-between overflow-hidden bg-panel select-none">
        <div className="w-full flex-1 relative min-h-[80px]">
          <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} width="100%" height="100%" preserveAspectRatio="none" className="overflow-visible">
            {/* Grid Lines */}
            <line x1={padding} y1={padding} x2={svgWidth - padding} y2={padding} stroke="var(--border-color)" strokeWidth="0.5" strokeDasharray="3 3" />
            <line x1={padding} y1={padding + chartHeight / 2} x2={svgWidth - padding} y2={padding + chartHeight / 2} stroke="var(--border-color)" strokeWidth="0.5" strokeDasharray="3 3" />
            <line x1={padding} y1={padding + chartHeight} x2={svgWidth - padding} y2={padding + chartHeight} stroke="var(--border-color)" strokeWidth="0.5" strokeDasharray="3 3" />

            {/* Line Path */}
            <polyline
              fill="none"
              stroke="var(--primary-color)"
              strokeWidth="1.5"
              points={pointsString}
              className="transition-all duration-300 ease-in-out"
            />

            {/* Area Fill */}
            <path
              d={`M ${padding},${padding + chartHeight} 
                  L ${points.map((val, idx) => `${padding + (idx / (points.length - 1)) * chartWidth},${padding + chartHeight - (val / 100) * chartHeight}`).join(' L ')} 
                  L ${svgWidth - padding},${padding + chartHeight} Z`}
              fill="var(--primary-color)"
              opacity="0.05"
            />
          </svg>

          {/* Current Value Indicator */}
          <div className="absolute top-2 right-2 bg-layout-active/50 border border-layout-primary/20 text-layout-primary px-1.5 py-0.5 rounded-[2px] text-[10px] font-semibold">
            VAL:
            {' '}
            {points[points.length - 1].toFixed(1)}
            {' '}
            m/s
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-[10px] text-text-secondary border-t border-layout-border/50 pt-2 mt-2">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-[#1677FF] inline-block rounded-[1px]"></span>
            <span>Velocity (x)</span>
          </div>
          <div>Min: 10.0</div>
          <div>Max: 95.0</div>
          <div>Avg: 61.3</div>
        </div>
      </div>
    </div>
  )
}
