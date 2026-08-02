import type UPlot from 'uplot'
import type { UPlotChartHandle, UPlotChartOptions } from '@/components/common/uplot-chart'
import type { PlotSeriesData, PlotSeriesRequest } from '@/core/workers/plot-data'
import type { PanelComponentProps, PlotPanelConfig } from '@/panels/core/types'
import { Loader2 } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import UPlotChart from '@/components/common/uplot-chart'
import { globalPlaybackController } from '@/core/playback-controller'
import { getPlaybackElapsedNs, subscribePlaybackTime } from '@/core/playback-time-store'
import { cancelFrame, scheduleFrame } from '@/core/raf-scheduler'
import { PanelContentHeader } from '@/panels/builtins/panel-content-header'
import { usePlayerStore } from '@/stores/use-player-store'
import 'uplot/dist/uPlot.min.css'

// Helper function to merge multiple series data sets into one aligned time series
function mergeTimeSeries(datasets: Array<Pick<PlotSeriesData, 'times' | 'values'>>): uPlot.AlignedData {
  if (datasets.length === 0) {
    return [[], []]
  }

  // 1. Collect all unique time points and sort them
  const allTimes = new Set<number>()
  for (const ds of datasets) {
    for (let index = 0; index < ds.times.length; index++) {
      allTimes.add(ds.times[index])
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

export default function PlotPanel({ config }: PanelComponentProps<PlotPanelConfig>) {
  const fileSummary = usePlayerStore(state => state.fileSummary)
  const plotSeries = config.series

  const { resolvedTheme } = useTheme()

  const tooltipRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<UPlotChartHandle>(null)
  const defaultYRangeRef = useRef<{ min: number, max: number } | null>(null)

  const [loadingData, setLoadingData] = useState(false)

  // Filter series that are fully configured with topic and path
  const activeSeries = useMemo(
    () => plotSeries.filter(s => s.topic && s.path),
    [plotSeries],
  )

  const emptyChartData = useMemo(
    () => [[], ...Array.from({ length: activeSeries.length }, () => [])] as UPlot.AlignedData,
    [activeSeries.length],
  )
  const [chartData, setChartData] = useState<UPlot.AlignedData>(emptyChartData)

  const dataSeriesKey = JSON.stringify(
    activeSeries.map(series => ({
      id: series.id,
      topic: series.topic,
      path: series.path,
    })),
  )
  const dataRequests = useMemo<PlotSeriesRequest[]>(
    () => JSON.parse(dataSeriesKey) as PlotSeriesRequest[],
    [dataSeriesKey],
  )

  // Keep a reference of the current play time for the uPlot plugin to draw the timeline marker
  const currentPlayTimeRef = useRef<number>(Number(getPlaybackElapsedNs()) / 1e9)

  // Playback time is transient: update the imperative chart without re-rendering React.
  useEffect(() => {
    const redraw = () => chartRef.current?.redraw()
    const unsubscribe = subscribePlaybackTime((elapsedNs) => {
      currentPlayTimeRef.current = Number(elapsedNs) / 1e9
      scheduleFrame(redraw)
    })
    return () => {
      unsubscribe()
      cancelFrame(redraw)
    }
  }, [])

  // Scan all selected topics once in the worker and return fixed-budget series.
  useEffect(() => {
    if (dataRequests.length === 0 || !fileSummary) {
      setChartData(emptyChartData)
      defaultYRangeRef.current = null
      return
    }

    let isCurrent = true
    setChartData(emptyChartData)
    setLoadingData(true)

    const request = globalPlaybackController.getPlotSeriesData(
      dataRequests,
      fileSummary.startNs,
      fileSummary.endNs,
    )
    request.promise.then((results) => {
      if (!isCurrent) {
        return
      }

      const resultById = new Map(results.map(result => [result.id, result]))
      const orderedResults = dataRequests.map(({ id }) => resultById.get(id) ?? {
        times: new Float64Array(),
        values: new Float64Array(),
      })
      const merged = mergeTimeSeries(orderedResults)
      setChartData(merged)
      setLoadingData(false)
    }).catch((err) => {
      console.error('Error fetching series data:', err)
      if (isCurrent) {
        setLoadingData(false)
      }
    })

    return () => {
      isCurrent = false
      globalPlaybackController.cancelPlotSeriesData(request.requestId)
    }
  }, [dataRequests, emptyChartData, fileSummary])

  const chartOptions = useMemo<UPlotChartOptions | null>(() => {
    if (!fileSummary) {
      return null
    }

    const isDark = resolvedTheme === 'dark'
    const textCol = isDark ? '#a1a1aa' : '#4b5563'
    const gridCol = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'

    // Marker plugin drawing the vertical elapsed play time line
    const timeMarkerPlugin = {
      hooks: {
        draw: (u: UPlot) => {
          const xVal = currentPlayTimeRef.current
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

    return {
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
          values: (_, splits) => splits.map(val => `${val.toFixed(1)}s`),
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
          value: (_, v) => (v == null ? '-' : `${v.toFixed(2)}s`),
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
  }, [activeSeries, fileSummary, resolvedTheme])

  const handleChartData = useCallback((uplot: UPlot) => {
    const yScale = uplot.scales.y
    if (typeof yScale.min === 'number' && typeof yScale.max === 'number') {
      defaultYRangeRef.current = { min: yScale.min, max: yScale.max }
    }
  }, [])

  const handleChartClick = useCallback((uplot: UPlot) => {
    if (!fileSummary) {
      return
    }

    const { left } = uplot.cursor
    if (left !== null && left !== undefined && left >= 0) {
      const timeVal = uplot.posToVal(left, 'x')
      const seekNs = fileSummary.startNs + BigInt(Math.round(timeVal * 1e9))
      globalPlaybackController.seek(seekNs)
    }
  }, [fileSummary])

  const handleChartDoubleClick = useCallback((uplot: UPlot) => {
    if (!fileSummary) {
      return
    }

    const durationSec = Number(fileSummary.durationNs) / 1e9
    uplot.batch(() => {
      uplot.setScale('x', { min: 0, max: durationSec })
      if (defaultYRangeRef.current) {
        uplot.setScale('y', defaultYRangeRef.current)
      }
    })
  }, [fileSummary])

  const wheelZoom = useMemo(() => {
    if (!fileSummary) {
      return undefined
    }
    return {
      maxRange: Number(fileSummary.durationNs) / 1e9 * 2,
      minRange: 0.1,
    }
  }, [fileSummary])

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-card overflow-hidden">
      <PanelContentHeader
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
            <p className="text-[10px] font-semibold">Extracting optimized datasets...</p>
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
                  {chartOptions && (
                    <UPlotChart
                      ref={chartRef}
                      className="w-full h-full min-h-0 relative flex items-center justify-center"
                      data={chartData}
                      onClick={handleChartClick}
                      onData={handleChartData}
                      onDoubleClick={handleChartDoubleClick}
                      options={chartOptions}
                      sizePadding={{ height: 8, width: 8 }}
                      wheelZoom={wheelZoom}
                    />
                  )}
                  <div ref={tooltipRef} className="absolute hidden pointer-events-none bg-popover/90 border border-border text-popover-foreground text-[10px] px-2 py-1.5 rounded-md shadow-md z-30 font-mono backdrop-blur-xs select-none min-w-32 leading-normal" />
                </div>
              )}
      </div>
    </div>
  )
}
