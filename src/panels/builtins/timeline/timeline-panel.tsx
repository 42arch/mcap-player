import type UPlot from 'uplot'
import type { UPlotChartHandle, UPlotChartOptions } from '@/components/common/uplot-chart'
import type { TimelineTopicData } from '@/core/workers/timeline-data'
import type { PanelComponentProps, TimelinePanelConfig } from '@/panels/core/types'
import { ChartNoAxesGantt, TriangleAlert } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FormattedMessage, useIntl } from 'react-intl'
import UPlotChart from '@/components/common/uplot-chart'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Spinner } from '@/components/ui/spinner'
import { globalPlaybackController } from '@/core/playback-controller'
import { getPlaybackElapsedNs, subscribePlaybackTime } from '@/core/playback-time-store'
import { cancelFrame, scheduleFrame } from '@/core/raf-scheduler'
import {
  findNearestTimelineTimestamp,
  findVisibleTimelineBucketRange,
} from '@/core/workers/timeline-data'
import { formatDuration, formatNanoseconds } from '@/lib/time'
import { PanelContentHeader } from '@/panels/builtins/panel-content-header'
import { usePlayerStore } from '@/stores/use-player-store'

const ROW_HEIGHT = 24
const X_AXIS_HEIGHT = 36
const MIN_CHART_HEIGHT = 140
const POINT_SIZE = 3
const TOOLTIP_DISTANCE_PX = 8
const TOPIC_COLOR_GOLDEN_ANGLE = 137.508

function secondsToNanoseconds(seconds: number, rounding: 'floor' | 'ceil' | 'round'): bigint {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0
  return BigInt(Math[rounding](safeSeconds * 1e9))
}

function formatAxisTime(seconds: number, durationSeconds: number): string {
  if (durationSeconds < 1) {
    return `${Math.round(seconds * 1000)}ms`
  }
  if (durationSeconds < 120) {
    return `${seconds.toFixed(durationSeconds < 10 ? 1 : 0)}s`
  }

  const wholeSeconds = Math.round(seconds)
  const hours = Math.floor(wholeSeconds / 3600)
  const minutes = Math.floor((wholeSeconds % 3600) / 60)
  const remainingSeconds = wholeSeconds % 60
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
  }
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`
}

function smartTruncateTopic(topic: string, maxLength: number = 18): string {
  if (!topic || topic.length <= maxLength) {
    return topic
  }

  const parts = topic.split('/')
  if (parts.length >= 4) {
    const firstPart = parts[1]
    const lastPart = parts[parts.length - 1]
    const condensed = `/${firstPart}/…/${lastPart}`
    if (condensed.length <= maxLength) {
      return condensed
    }
  }

  const keepHead = Math.floor((maxLength - 1) / 2)
  const keepTail = maxLength - 1 - keepHead
  return `${topic.slice(0, keepHead)}…${topic.slice(-keepTail)}`
}

function TimelineEmptyState({
  error,
  hasSelection,
}: {
  error: string | null
  hasSelection: boolean
}) {
  const intl = useIntl()
  const Icon = error ? TriangleAlert : ChartNoAxesGantt
  const title = error
    ? intl.formatMessage({ id: 'panel.timeline.unavailable', defaultMessage: 'Timeline unavailable' })
    : hasSelection
      ? intl.formatMessage({ id: 'panel.timeline.noMessages', defaultMessage: 'No messages found' })
      : intl.formatMessage({ id: 'panel.timeline.noTopics', defaultMessage: 'No topics selected' })
  const description = error
    ?? (hasSelection
      ? intl.formatMessage({ id: 'panel.timeline.noMessagesDesc', defaultMessage: 'The selected topics do not contain any messages.' })
      : intl.formatMessage({ id: 'panel.timeline.noTopicsDesc', defaultMessage: 'Select one or more topics from the panel settings.' }))

  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

export default function TimelinePanel({
  config,
}: PanelComponentProps<TimelinePanelConfig>) {
  const fileSummary = usePlayerStore(state => state.fileSummary)
  const { resolvedTheme } = useTheme()

  const chartRef = useRef<UPlotChartHandle>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const tooltipTopicRef = useRef<HTMLDivElement>(null)
  const tooltipRelativeTimeRef = useRef<HTMLSpanElement>(null)
  const tooltipAbsoluteTimeRef = useRef<HTMLSpanElement>(null)
  const tooltipBucketCountRef = useRef<HTMLSpanElement>(null)
  const currentPlayTimeRef = useRef(Number(getPlaybackElapsedNs()) / 1e9)

  const [timelineData, setTimelineData] = useState<TimelineTopicData[] | null>(null)
  const [loadingData, setLoadingData] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const visibleTimelineData = useMemo(() => {
    if (!timelineData || config.visibleTopics === null) {
      return timelineData ?? []
    }
    const visibleTopics = new Set(config.visibleTopics)
    return timelineData.filter(topic => visibleTopics.has(topic.topic))
  }, [config.visibleTopics, timelineData])

  const visibleMessageCount = useMemo(
    () => visibleTimelineData.reduce((count, topic) => count + topic.messageCount, 0),
    [visibleTimelineData],
  )

  useEffect(() => {
    if (!fileSummary) {
      setTimelineData(null)
      return
    }

    let isCurrent = true
    setLoadingData(true)
    setError(null)

    globalPlaybackController.getMessageTimelineData()
      .then((data) => {
        if (isCurrent) {
          setTimelineData(data)
        }
      })
      .catch((reason: unknown) => {
        if (isCurrent) {
          const message = reason instanceof Error ? reason.message : 'Failed to index message timestamps.'
          setError(message)
        }
      })
      .finally(() => {
        if (isCurrent) {
          setLoadingData(false)
        }
      })

    return () => {
      isCurrent = false
    }
  }, [fileSummary])

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

  const durationSeconds = Math.max(Number(fileSummary?.durationNs ?? 0) / 1e9, 0.000_001)
  const topicCount = visibleTimelineData.length
  const topicColors = useMemo(
    () => visibleTimelineData.map((_, index) => `hsl(${(index * TOPIC_COLOR_GOLDEN_ANGLE) % 360} 72% 50%)`),
    [visibleTimelineData],
  )

  const yAxisWidth = useMemo(() => {
    if (visibleTimelineData.length === 0) {
      return 90
    }
    const maxCharCount = Math.max(
      ...visibleTimelineData.map((item) => {
        const truncated = smartTruncateTopic(item.topic, 18)
        return truncated.length
      }),
    )
    const estimatedWidth = Math.round(maxCharCount * 6.2 + 14)
    return Math.min(Math.max(estimatedWidth, 75), 130)
  }, [visibleTimelineData])

  const hideTooltip = useCallback(() => {
    if (tooltipRef.current) {
      tooltipRef.current.style.display = 'none'
    }
  }, [])

  const chartOptions = useMemo<UPlotChartOptions | null>(() => {
    if (!fileSummary || topicCount === 0) {
      return null
    }

    const rootStyles = getComputedStyle(document.documentElement)
    const isDark = resolvedTheme === 'dark'
    const gridColor = rootStyles.getPropertyValue('--border').trim()
      || (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)')
    const textColor = rootStyles.getPropertyValue('--muted-foreground').trim()
      || (isDark ? '#a1a1aa' : '#4b5563')
    const playheadColor = rootStyles.getPropertyValue('--destructive').trim()
      || (isDark ? '#fb7185' : '#e11d48')

    const scatterPlugin: UPlot.Plugin = {
      hooks: {
        draw: (u) => {
          const xMin = u.scales.x.min ?? 0
          const xMax = u.scales.x.max ?? durationSeconds
          const minTimeNs = secondsToNanoseconds(xMin, 'floor')
          const maxTimeNs = secondsToNanoseconds(xMax, 'ceil')
          const { ctx, bbox } = u

          ctx.save()
          ctx.beginPath()
          ctx.rect(bbox.left, bbox.top, bbox.width, bbox.height)
          ctx.clip()

          ctx.strokeStyle = gridColor
          ctx.globalAlpha = 0.45
          ctx.lineWidth = 1
          for (let topicIndex = 0; topicIndex < topicCount; topicIndex++) {
            const y = Math.round(u.valToPos(topicIndex + 0.5, 'y', true))
            ctx.beginPath()
            ctx.moveTo(bbox.left, y)
            ctx.lineTo(bbox.left + bbox.width, y)
            ctx.stroke()
          }

          ctx.globalAlpha = 0.78
          for (let topicIndex = 0; topicIndex < topicCount; topicIndex++) {
            ctx.fillStyle = topicColors[topicIndex]
            const topicData = visibleTimelineData[topicIndex]
            const [startIndex, endIndex] = findVisibleTimelineBucketRange(topicData, minTimeNs, maxTimeNs)
            const y = Math.round(u.valToPos(topicIndex, 'y', true))

            for (let bucketIndex = startIndex; bucketIndex < endIndex; bucketIndex++) {
              const startSeconds = Number(topicData.bucketStartTimes[bucketIndex]) / 1e9
              const endSeconds = Number(topicData.bucketEndTimes[bucketIndex]) / 1e9
              const startX = Math.round(u.valToPos(startSeconds, 'x', true))
              const endX = Math.round(u.valToPos(endSeconds, 'x', true))
              const width = Math.max(POINT_SIZE, endX - startX + 1)
              const density = Math.log2(topicData.bucketCounts[bucketIndex] + 1)
              ctx.globalAlpha = Math.min(0.45 + density * 0.06, 0.92)
              ctx.fillRect(startX - Math.floor(POINT_SIZE / 2), y - 1, width, 3)
            }
          }

          const playTime = currentPlayTimeRef.current
          if (playTime >= xMin && playTime <= xMax) {
            const x = u.valToPos(playTime, 'x', true)
            ctx.globalAlpha = 0.9
            ctx.strokeStyle = playheadColor
            ctx.lineWidth = 1.5
            ctx.setLineDash([3, 3])
            ctx.beginPath()
            ctx.moveTo(x, bbox.top)
            ctx.lineTo(x, bbox.top + bbox.height)
            ctx.stroke()
          }

          ctx.restore()
        },
        setCursor: (u) => {
          const { left, top } = u.cursor
          const tooltip = tooltipRef.current
          if (
            !tooltip
            || left === undefined
            || left === null
            || top === undefined
            || top === null
            || left < 0
            || top < 0
          ) {
            hideTooltip()
            return
          }

          const topicIndex = Math.round(u.posToVal(top, 'y'))
          const topicData = visibleTimelineData[topicIndex]
          if (!topicData || topicData.bucketStartTimes.length === 0) {
            hideTooltip()
            return
          }

          const targetTimeNs = secondsToNanoseconds(u.posToVal(left, 'x'), 'round')
          const nearest = findNearestTimelineTimestamp(topicData, targetTimeNs)
          if (!nearest) {
            hideTooltip()
            return
          }
          const relativeTimeNs = nearest.timeNs
          const bucketStartLeft = u.valToPos(Number(topicData.bucketStartTimes[nearest.bucketIndex]) / 1e9, 'x')
          const bucketEndLeft = u.valToPos(Number(topicData.bucketEndTimes[nearest.bucketIndex]) / 1e9, 'x')
          const minBucketLeft = Math.min(bucketStartLeft, bucketEndLeft)
          const maxBucketLeft = Math.max(bucketStartLeft, bucketEndLeft)
          const distanceToBucket = left < minBucketLeft
            ? minBucketLeft - left
            : left > maxBucketLeft ? left - maxBucketLeft : 0
          if (distanceToBucket > TOOLTIP_DISTANCE_PX) {
            hideTooltip()
            return
          }

          if (tooltipTopicRef.current) {
            tooltipTopicRef.current.textContent = topicData.topic
          }
          if (tooltipRelativeTimeRef.current) {
            tooltipRelativeTimeRef.current.textContent = formatDuration(relativeTimeNs)
          }
          if (tooltipAbsoluteTimeRef.current) {
            tooltipAbsoluteTimeRef.current.textContent = formatNanoseconds(
              fileSummary.startNs + relativeTimeNs,
            )
          }
          if (tooltipBucketCountRef.current) {
            tooltipBucketCountRef.current.textContent = topicData.bucketCounts[nearest.bucketIndex].toLocaleString()
          }

          const offset = 12
          const tooltipWidth = tooltip.offsetWidth || 240
          const plotLeft = u.over.offsetLeft
          const plotTop = u.over.offsetTop
          const placeOnLeft = left > u.over.clientWidth / 2
          tooltip.style.left = `${placeOnLeft
            ? left + plotLeft - tooltipWidth - offset
            : left + plotLeft + offset}px`
          tooltip.style.top = `${Math.max(top + plotTop - 36, 8)}px`
          tooltip.style.display = 'block'
        },
        destroy: hideTooltip,
      },
    }

    const topicSplits = visibleTimelineData.map((_, index) => index)
    return {
      cursor: {
        drag: { x: false, y: false },
        points: { show: false },
      },
      legend: { show: false },
      scales: {
        x: {
          time: false,
        },
        y: {
          auto: false,
          dir: -1,
          range: [-0.5, topicCount - 0.5],
        },
      },
      axes: [
        {
          stroke: textColor,
          grid: { stroke: gridColor },
          font: '10px monospace',
          size: X_AXIS_HEIGHT,
          values: (_u, splits) => splits.map(value => formatAxisTime(value, durationSeconds)),
        },
        {
          stroke: textColor,
          grid: { show: false },
          ticks: { show: false },
          font: '10px monospace',
          size: yAxisWidth,
          splits: topicSplits,
          values: (_u, splits) => splits.map((value) => {
            const topic = visibleTimelineData[Math.round(value)]?.topic ?? ''
            return smartTruncateTopic(topic, 18)
          }),
        },
      ],
      series: [
        {},
        {
          show: false,
          scale: 'y',
        },
      ],
      plugins: [scatterPlugin],
    }
  }, [durationSeconds, fileSummary, hideTooltip, resolvedTheme, topicColors, topicCount, visibleTimelineData, yAxisWidth])

  const chartData = useMemo<UPlot.AlignedData>(() => [
    [0, durationSeconds],
    [0, Math.max(topicCount - 1, 0)],
  ], [durationSeconds, topicCount])

  const handleChartClick = useCallback((uplot: UPlot) => {
    if (!fileSummary) {
      return
    }

    const left = uplot.cursor.left
    if (left !== undefined && left !== null && left >= 0) {
      const relativeTimeNs = secondsToNanoseconds(uplot.posToVal(left, 'x'), 'round')
      globalPlaybackController.seek(fileSummary.startNs + relativeTimeNs)
    }
  }, [fileSummary])

  const handleChartDoubleClick = useCallback((uplot: UPlot) => {
    uplot.batch(() => {
      uplot.setScale('x', { min: 0, max: durationSeconds })
      uplot.setScale('y', { min: -0.5, max: topicCount - 0.5 })
    })
  }, [durationSeconds, topicCount])

  const wheelZoom = useMemo(() => ({
    maxRange: durationSeconds * 2,
    minRange: Math.min(0.1, durationSeconds),
  }), [durationSeconds])

  const chartHeight = Math.max(
    MIN_CHART_HEIGHT,
    visibleTimelineData.length * ROW_HEIGHT + X_AXIS_HEIGHT,
  )
  const hasSelection = config.visibleTopics === null || config.visibleTopics.length > 0
  const showEmptyState = !loadingData && (error !== null || visibleMessageCount === 0)

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-card">
      <PanelContentHeader />

      <div className="relative flex min-h-0 flex-1 bg-background">
        {timelineData && visibleTimelineData.length > 0 && !showEmptyState && (
          <div className="absolute top-3 right-3 z-20 pointer-events-none select-none font-mono text-[10px]">
            <div className="bg-popover/90 border border-border/80 text-muted-foreground px-2 py-1 rounded-md shadow-xs backdrop-blur-xs">
              <FormattedMessage
                id="panel.timeline.summary"
                defaultMessage="{topics} topics · {messages} messages"
                values={{
                  topics: visibleTimelineData.length,
                  messages: visibleMessageCount.toLocaleString(),
                }}
              />
            </div>
          </div>
        )}

        {loadingData
          ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
                <Spinner />
                <span className="text-xs">
                  <FormattedMessage id="panel.timeline.indexing" defaultMessage="Indexing message timestamps…" />
                </span>
              </div>
            )
          : showEmptyState
            ? <TimelineEmptyState error={error} hasSelection={hasSelection} />
            : (
                <div className="min-h-0 flex-1 overflow-auto p-2">
                  <div
                    className="relative min-h-full w-full"
                    style={{ height: chartHeight }}
                  >
                    {chartOptions && (
                      <UPlotChart
                        ref={chartRef}
                        className="size-full"
                        cursor="crosshair"
                        data={chartData}
                        onClick={handleChartClick}
                        onDoubleClick={handleChartDoubleClick}
                        onMouseLeave={hideTooltip}
                        options={chartOptions}
                        wheelZoom={wheelZoom}
                      />
                    )}
                    <div
                      ref={tooltipRef}
                      className="pointer-events-none absolute hidden min-w-56 rounded-md border border-border bg-popover/95 px-2.5 py-2 font-mono text-[10px] leading-normal text-popover-foreground shadow-md backdrop-blur-xs"
                    >
                      <div
                        ref={tooltipTopicRef}
                        className="mb-1 max-w-72 truncate border-b border-border pb-1 font-semibold"
                      />
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground">
                          <FormattedMessage id="panel.timeline.relative" defaultMessage="Relative" />
                        </span>
                        <span ref={tooltipRelativeTimeRef} />
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground">
                          <FormattedMessage id="panel.timeline.logTime" defaultMessage="Log time" />
                        </span>
                        <span ref={tooltipAbsoluteTimeRef} />
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground">
                          <FormattedMessage id="panel.timeline.bucketCount" defaultMessage="Messages in bucket" />
                        </span>
                        <span ref={tooltipBucketCountRef} />
                      </div>
                    </div>
                  </div>
                </div>
              )}
      </div>
    </div>
  )
}
