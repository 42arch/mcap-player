import type { PanelComponentProps, PlotPanelConfig } from '@/panels/core/types'
import { Loader2, Radio } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useCallback, useEffect, useRef, useState } from 'react'
import UPlot from 'uplot'
import { globalPlaybackController } from '@/core/playback-controller'
import { PanelContentHeader } from '@/panels/builtins/panel-content-header'
import { usePanelMessages } from '@/panels/runtime/use-panel-messages'
import { usePlayerStore } from '@/stores/use-player-store'
import 'uplot/dist/uPlot.min.css'

// Helper function to merge multiple series data sets into one aligned time series
function mergeTimeSeries(datasets: Array<{ times: number[], values: number[] }>): uPlot.AlignedData {
  if (datasets.length === 0) {
    return [[], []]
  }

  // 1. Collect all unique time points and sort them
  const allTimes = new Set<number>()
  for (const ds of datasets) {
    for (const t of ds.times) {
      allTimes.add(t)
    }
  }
  const globalTimes = Array.from(allTimes).sort((a, b) => a - b)

  if (globalTimes.length === 0) {
    return [[], ...datasets.map(() => [])]
  }

  // 2. Perform forward fill alignment for each series to match the globalTimes grid
  const alignedSeries = datasets.map((ds) => {
    const { times, values } = ds
    let lastVal: number | null = null
    let rawIdx = 0

    return globalTimes.map((t) => {
      while (rawIdx < times.length && times[rawIdx] <= t) {
        lastVal = values[rawIdx]
        rawIdx++
      }
      return lastVal
    })
  })

  return [
    globalTimes,
    ...alignedSeries,
  ] as UPlot.AlignedData
}

export default function PlotPanel({ panelId, config }: PanelComponentProps<PlotPanelConfig>) {
  const fileSummary = usePlayerStore(state => state.fileSummary)
  const plotSeries = config.series

  const elapsedNs = usePlayerStore(state => state.elapsedNs)
  const { resolvedTheme } = useTheme()

  const containerRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const uplotRef = useRef<UPlot | null>(null)
  const dataRef = useRef<UPlot.AlignedData>([[], []])

  const [loadingData, setLoadingData] = useState(false)

  // Filter series that are fully configured with topic and path
  const activeSeries = plotSeries.filter(s => s.topic && s.path)

  const activeSeriesSerialized = JSON.stringify(
    activeSeries.map(s => ({
      id: s.id,
      topic: s.topic,
      path: s.path,
      color: s.color,
      lineStyle: s.lineStyle,
      lineWidth: s.lineWidth,
    })),
  )

  const subscriptions = activeSeries.map(series => ({ topic: series.topic, mode: 'all' as const }))
  const ignorePlaybackMessage = useCallback(() => {}, [])
  usePanelMessages({
    panelId,
    subscriptionId: 'plot-series',
    topics: subscriptions,
    onMessage: ignorePlaybackMessage,
  })

  // Keep a reference of the current play time for the uPlot plugin to draw the timeline marker
  const currentPlayTime = useRef<number>(0)
  currentPlayTime.current = Number(elapsedNs) / 1e9

  // Redraw the chart when elapsedNs changes to reposition the time marker line
  useEffect(() => {
    if (uplotRef.current) {
      uplotRef.current.redraw()
    }
  }, [elapsedNs])

  // Fetch full data for all active series in parallel and merge them
  useEffect(() => {
    if (activeSeries.length === 0 || !fileSummary) {
      dataRef.current = [[], []]
      if (uplotRef.current) {
        uplotRef.current.setData([[], []])
      }
      return
    }

    let isCurrent = true
    setLoadingData(true)

    Promise.all(
      activeSeries.map(s =>
        globalPlaybackController.getTopicFieldValues(
          s.topic,
          s.path,
          fileSummary.startNs,
        ),
      ),
    ).then((results) => {
      if (!isCurrent) {
        return
      }

      const merged = mergeTimeSeries(results)
      dataRef.current = merged

      if (uplotRef.current) {
        uplotRef.current.setData(merged)
      }
      setLoadingData(false)
    }).catch((err) => {
      console.error('Error fetching series data:', err)
      if (isCurrent) {
        setLoadingData(false)
      }
    })

    return () => {
      isCurrent = false
    }
  }, [activeSeriesSerialized, fileSummary])

  // Effect to construct/destruct uPlot instance
  useEffect(() => {
    if (!containerRef.current || !fileSummary) {
      return
    }

    const width = containerRef.current.clientWidth || 300
    const height = containerRef.current.clientHeight || 200

    const isDark = resolvedTheme === 'dark'
    const textCol = isDark ? '#a1a1aa' : '#4b5563'
    const gridCol = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'

    // Marker plugin drawing the vertical elapsed play time line
    const timeMarkerPlugin = {
      hooks: {
        draw: (u: UPlot) => {
          const xVal = currentPlayTime.current
          if (xVal === null || xVal === undefined) {
            return
          }

          const ctx = u.ctx
          const xPx = u.valToPos(xVal, 'x', true)

          ctx.save()
          ctx.beginPath()
          ctx.strokeStyle = isDark ? '#f43f5e' : '#e11d48'
          ctx.lineWidth = 1.5
          ctx.setLineDash([3, 3])

          const top = u.bbox.top
          const bottom = u.bbox.top + u.bbox.height

          ctx.moveTo(xPx, top)
          ctx.lineTo(xPx, bottom)
          ctx.stroke()
          ctx.restore()
        },
      },
    }

    // Tooltip plugin rendering values for all active series in alignment
    const tooltipPlugin = {
      hooks: {
        setCursor: (u: UPlot) => {
          const { idx, left, top } = u.cursor
          const tooltipEl = tooltipRef.current
          if (!tooltipEl) {
            return
          }

          if (idx === null || idx === undefined || left === -10 || left === undefined || left === null || top === undefined || top === null) {
            tooltipEl.style.display = 'none'
            return
          }

          const xVal = u.data[0]?.[idx]
          if (xVal === undefined) {
            tooltipEl.style.display = 'none'
            return
          }

          const seriesRows = activeSeries.map((s, sIdx) => {
            const val = u.data[sIdx + 1]?.[idx]
            const valStr = val == null ? '-' : val.toFixed(4)
            return `
              <div class="flex items-center justify-between gap-6">
                <span class="flex items-center gap-1.5 min-w-0">
                  <span class="w-1.5 h-1.5 rounded-full shrink-0" style="background-color: ${s.color}"></span>
                  <span class="truncate max-w-36 font-semibold" title="${s.topic}.${s.path}">${s.topic}.${s.path}</span>
                </span>
                <span class="font-semibold text-right" style="color: ${s.color}">${valStr}</span>
              </div>
            `
          }).join('')

          tooltipEl.innerHTML = `
            <div class="border-b border-border/40 pb-1 mb-1 font-semibold text-foreground">
              Time: <span>${xVal.toFixed(2)}s</span>
            </div>
            <div class="space-y-0.5 min-w-36">
              ${seriesRows}
            </div>
          `

          const plotLeft = u.over.offsetLeft
          const plotTop = u.over.offsetTop

          const offset = 12
          const tooltipWidth = 150
          const isRightSide = left > (u.over.clientWidth / 2)

          const finalLeft = isRightSide
            ? (left + plotLeft - tooltipWidth - offset)
            : (left + plotLeft + offset)
          const finalTop = Math.max(top + plotTop - 45, 10)

          tooltipEl.style.left = `${finalLeft}px`
          tooltipEl.style.top = `${finalTop}px`
          tooltipEl.style.display = 'block'
        },
        destroy: () => {
          if (tooltipRef.current) {
            tooltipRef.current.style.display = 'none'
          }
        },
      },
    }

    const opts: UPlot.Options = {
      width,
      height,
      cursor: {
        drag: {
          x: false,
          y: false,
        },
      },
      scales: {
        x: {
          time: false,
          min: 0,
          max: Number(fileSummary.durationNs) / 1e9,
        },
      },
      legend: {
        show: false,
      },
      axes: [
        {
          grid: { stroke: gridCol },
          stroke: textCol,
          font: '10px monospace',
          values: (u, splits) => splits.map(val => `${val.toFixed(1)}s`),
        },
        {
          grid: { stroke: gridCol },
          stroke: textCol,
          font: '10px monospace',
        },
      ],
      series: [
        {
          label: 'Time',
          value: (u, v) => (v == null ? '-' : `${v.toFixed(2)}s`),
        },
        ...activeSeries.map(s => ({
          label: s.name || s.path,
          stroke: s.color,
          width: s.lineWidth || 2,
          dash: s.lineStyle === 'dashed' ? [6, 6] : undefined,
          value: (_: any, v: number | null) => (v == null ? '-' : v.toFixed(4)),
        })),
      ],
      plugins: [timeMarkerPlugin, tooltipPlugin],
    }

    const validDataLen = activeSeries.length + 1
    const initialData: UPlot.AlignedData = (dataRef.current && dataRef.current.length === validDataLen)
      ? dataRef.current
      : [[], ...activeSeries.map(() => [])] as UPlot.AlignedData

    const uplot = new UPlot(opts, initialData, containerRef.current)
    uplotRef.current = uplot
    uplot.over.style.cursor = 'grab'

    // Mouse drag-to-pan & click-to-seek logic
    let isDragging = false
    let dragStartX = 0
    let dragStartY = 0
    let panInitialMin = 0
    let panInitialMax = 0

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) {
        return
      }
      isDragging = true
      dragStartX = e.clientX
      dragStartY = e.clientY
      panInitialMin = uplot.scales.x.min!
      panInitialMax = uplot.scales.x.max!

      uplot.over.style.cursor = 'grabbing'
      document.body.style.cursor = 'grabbing'
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) {
        return
      }

      const dxPx = e.clientX - dragStartX
      const plotWidth = uplot.over.clientWidth
      if (plotWidth <= 0) {
        return
      }

      const xRange = panInitialMax - panInitialMin
      const valPerPx = xRange / plotWidth
      const newMin = panInitialMin - dxPx * valPerPx
      const newMax = panInitialMax - dxPx * valPerPx

      uplot.setScale('x', { min: newMin, max: newMax })
    }

    const handleMouseUp = (e: MouseEvent) => {
      if (!isDragging) {
        return
      }
      isDragging = false

      uplot.over.style.cursor = 'grab'
      document.body.style.cursor = ''

      // Prevent seeking during double-clicks
      if (e.detail > 1) {
        return
      }

      // Seek playback if mouse move distance is minimal (single click gesture)
      const dist = Math.sqrt((e.clientX - dragStartX) ** 2 + (e.clientY - dragStartY) ** 2)
      if (dist <= 4) {
        const { left } = uplot.cursor
        if (left !== null && left !== undefined && left >= 0) {
          const timeVal = uplot.posToVal(left, 'x')
          const seekNs = fileSummary.startNs + BigInt(Math.round(timeVal * 1e9))
          globalPlaybackController.seek(seekNs)
        }
      }
    }

    const handleDblClick = () => {
      const durationSec = Number(fileSummary.durationNs) / 1e9
      uplot.setScale('x', { min: 0, max: durationSec })
    }

    // Scroll wheel zoom centered at mouse pointer position
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()

      const { left } = uplot.cursor
      const plotWidth = uplot.over.clientWidth
      if (left === null || left === undefined || left < 0 || left > plotWidth) {
        return
      }

      const mouseXVal = uplot.posToVal(left, 'x')
      const xMin = uplot.scales.x.min!
      const xMax = uplot.scales.x.max!
      const xRange = xMax - xMin

      const factor = e.deltaY < 0 ? 0.85 : 1.15
      const newRange = xRange * factor

      // Bound minimum zoom range to 100ms and maximum to 2x file duration
      const durationSec = Number(fileSummary.durationNs) / 1e9
      if (newRange < 0.1 || newRange > durationSec * 2) {
        return
      }

      const pct = left / plotWidth
      const newMin = mouseXVal - pct * newRange
      const newMax = newMin + newRange

      uplot.setScale('x', { min: newMin, max: newMax })
    }

    uplot.over.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    uplot.over.addEventListener('dblclick', handleDblClick)
    uplot.over.addEventListener('wheel', handleWheel, { passive: false })

    // Resize Observer
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry && uplotRef.current) {
        const { width: rw, height: rh } = entry.contentRect
        uplotRef.current.setSize({
          width: Math.max(rw - 8, 100),
          height: Math.max(rh - 8, 100),
        })
      }
    })
    observer.observe(containerRef.current)

    return () => {
      observer.disconnect()
      if (uplot.over) {
        uplot.over.removeEventListener('mousedown', handleMouseDown)
        uplot.over.removeEventListener('dblclick', handleDblClick)
        uplot.over.removeEventListener('wheel', handleWheel)
      }
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      uplot.destroy()
      uplotRef.current = null
    }
  }, [resolvedTheme, activeSeriesSerialized, fileSummary])

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-background p-3">
      <div className="mcap-panel-card flex-1 flex flex-col border border-border bg-card rounded-lg overflow-hidden shadow-xs">
        <PanelContentHeader
          icon={Radio}
          title="Time-series plot"
          actions={activeSeries.length > 0 && (
            <div className="flex items-center gap-1.5">
              {activeSeries.map(s => (
                <div key={s.id} className="flex shrink-0 items-center gap-1.5 rounded-md border border-border/50 bg-muted/50 px-2 py-0.5 font-mono text-[9px] text-muted-foreground">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: s.color }}></span>
                  <span className="font-bold">{s.name}</span>
                </div>
              ))}
            </div>
          )}
        />

        {/* Chart Container Body */}
        <div className="flex-1 min-h-0 relative p-4 flex items-center justify-center bg-background overflow-hidden">
          {loadingData && (
            <div className="absolute inset-0 bg-background/50 flex flex-col items-center justify-center z-10 text-muted-foreground select-none">
              <Loader2 className="w-6 h-6 animate-spin text-primary mb-2" />
              <p className="text-[10px] font-semibold">Extracting full datasets...</p>
            </div>
          )}

          {plotSeries.length === 0
            ? (
                <div className="text-center text-muted-foreground p-8">
                  <p className="text-xs font-semibold">No Series Configured</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1 max-w-60 leading-relaxed">
                    Please add and configure a plot series in the left Settings tab to start visualization.
                  </p>
                </div>
              )
            : activeSeries.length === 0
              ? (
                  <div className="text-center text-muted-foreground p-8">
                    <p className="text-xs font-semibold">Series Incomplete</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-1 max-w-60 leading-relaxed">
                      Please specify both topic and value path for your configured series in the left Settings tab to render.
                    </p>
                  </div>
                )
              : (
                  <div className="w-full h-full min-h-0 relative flex items-center justify-center">
                    <div ref={containerRef} className="w-full h-full min-h-0 relative flex items-center justify-center" />
                    <div ref={tooltipRef} className="absolute hidden pointer-events-none bg-popover/90 border border-border text-popover-foreground text-[10px] px-2 py-1.5 rounded-md shadow-md z-30 font-mono backdrop-blur-xs select-none min-w-32 leading-normal" />
                  </div>
                )}
        </div>
      </div>
    </div>
  )
}
