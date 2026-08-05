import type { Ref } from 'react'
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import UPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'

export interface UPlotChartHandle {
  getInstance: () => UPlot | null
  redraw: () => void
}

export type UPlotChartOptions = Omit<UPlot.Options, 'height' | 'width'>
  & Partial<Pick<UPlot.Options, 'height' | 'width'>>

export interface UPlotChartProps {
  options: UPlotChartOptions
  data: UPlot.AlignedData
  className?: string
  cursor?: 'crosshair' | 'grab'
  ref?: Ref<UPlotChartHandle>
  resetScalesKey?: any
  sizePadding?: {
    height?: number
    width?: number
  }
  wheelZoom?: {
    maxRange: number
    minRange: number
  }
  onClick?: (uplot: UPlot) => void
  onData?: (uplot: UPlot) => void
  onDoubleClick?: (uplot: UPlot) => void
  onMouseLeave?: () => void
}

const MIN_CHART_SIZE = 100

function UPlotChart({
  className,
  cursor = 'grab',
  data,
  onClick,
  onData,
  onDoubleClick,
  onMouseLeave,
  options,
  ref,
  resetScalesKey,
  sizePadding,
  wheelZoom,
}: UPlotChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const uplotRef = useRef<UPlot | null>(null)
  const optionsRef = useRef(options)
  const dataRef = useRef(data)
  const onClickRef = useRef(onClick)
  const onDataRef = useRef(onData)
  const onDoubleClickRef = useRef(onDoubleClick)
  const onMouseLeaveRef = useRef(onMouseLeave)
  const wheelZoomRef = useRef(wheelZoom)
  const savedScalesRef = useRef<{
    xMin?: number
    xMax?: number
    yMin?: number
    yMax?: number
  } | null>(null)
  const resetScalesKeyRef = useRef(resetScalesKey)
  const [layoutReady, setLayoutReady] = useState(false)

  if (resetScalesKeyRef.current !== resetScalesKey) {
    resetScalesKeyRef.current = resetScalesKey
    savedScalesRef.current = null
  }

  optionsRef.current = options
  dataRef.current = data
  onClickRef.current = onClick
  onDataRef.current = onData
  onDoubleClickRef.current = onDoubleClick
  onMouseLeaveRef.current = onMouseLeave
  wheelZoomRef.current = wheelZoom

  useImperativeHandle(ref, () => ({
    getInstance: () => uplotRef.current,
    redraw: () => {
      uplotRef.current?.redraw()
    },
  }), [])

  const widthPadding = sizePadding?.width ?? 0
  const heightPadding = sizePadding?.height ?? 0

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const resizeChart = (width: number, height: number) => {
      if (width <= 0 || height <= 0) {
        setLayoutReady(false)
        return
      }

      setLayoutReady(true)
      uplotRef.current?.setSize({
        width: Math.max(Math.round(width - widthPadding), MIN_CHART_SIZE),
        height: Math.max(Math.round(height - heightPadding), MIN_CHART_SIZE),
      })
    }

    const rect = container.getBoundingClientRect()
    resizeChart(rect.width, rect.height)

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        resizeChart(entry.contentRect.width, entry.contentRect.height)
      }
    })
    resizeObserver.observe(container)

    return () => {
      resizeObserver.disconnect()
    }
  }, [heightPadding, widthPadding])

  useEffect(() => {
    if (!layoutReady) {
      return
    }

    const container = containerRef.current
    if (!container) {
      return
    }

    const rect = container.getBoundingClientRect()
    const chart = new UPlot({
      ...optionsRef.current,
      width: Math.max(Math.round(rect.width - widthPadding), MIN_CHART_SIZE),
      height: Math.max(Math.round(rect.height - heightPadding), MIN_CHART_SIZE),
    }, dataRef.current, container)
    uplotRef.current = chart

    if (savedScalesRef.current) {
      const { xMin, xMax, yMin, yMax } = savedScalesRef.current
      chart.batch(() => {
        if (xMin != null && xMax != null) {
          chart.setScale('x', { min: xMin, max: xMax })
        }
        if (yMin != null && yMax != null) {
          chart.setScale('y', { min: yMin, max: yMax })
        }
      })
    }

    const defaultCursor = cursor
    chart.over.style.cursor = defaultCursor

    let isDragging = false
    let dragStartX = 0
    let dragStartY = 0
    let initialXMin = 0
    let initialXMax = 0
    let initialYMin = 0
    let initialYMax = 0
    let previousBodyCursor = ''

    const restoreCursor = () => {
      chart.over.style.cursor = defaultCursor
      document.body.style.cursor = previousBodyCursor
    }

    const saveCurrentScales = () => {
      if (chart.scales.x?.min != null && chart.scales.x?.max != null) {
        savedScalesRef.current = {
          xMin: chart.scales.x.min,
          xMax: chart.scales.x.max,
          yMin: chart.scales.y?.min,
          yMax: chart.scales.y?.max,
        }
      }
    }

    const handleMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) {
        return
      }

      isDragging = true
      dragStartX = event.clientX
      dragStartY = event.clientY
      initialXMin = chart.scales.x.min ?? 0
      initialXMax = chart.scales.x.max ?? 1
      initialYMin = chart.scales.y.min ?? 0
      initialYMax = chart.scales.y.max ?? 1
      previousBodyCursor = document.body.style.cursor
      chart.over.style.cursor = 'grabbing'
      document.body.style.cursor = 'grabbing'
    }

    const handleMouseMove = (event: MouseEvent) => {
      if (!isDragging) {
        return
      }

      const plotWidth = chart.over.clientWidth
      const plotHeight = chart.over.clientHeight
      if (plotWidth <= 0 || plotHeight <= 0) {
        return
      }

      const deltaX = event.clientX - dragStartX
      const deltaY = event.clientY - dragStartY
      const xRange = initialXMax - initialXMin
      const yRange = initialYMax - initialYMin
      const nextXMin = initialXMin - deltaX * xRange / plotWidth
      const nextXMax = initialXMax - deltaX * xRange / plotWidth
      const yShift = (chart.scales.y.dir ?? 1) * deltaY * yRange / plotHeight
      const nextYMin = initialYMin + yShift
      const nextYMax = initialYMax + yShift

      chart.batch(() => {
        chart.setScale('x', { min: nextXMin, max: nextXMax })
        chart.setScale('y', { min: nextYMin, max: nextYMax })
      })
      saveCurrentScales()
    }

    const handleMouseUp = (event: MouseEvent) => {
      if (!isDragging) {
        return
      }

      isDragging = false
      restoreCursor()
      saveCurrentScales()

      if (event.detail > 1) {
        return
      }

      const distance = Math.hypot(event.clientX - dragStartX, event.clientY - dragStartY)
      if (distance <= 4) {
        onClickRef.current?.(chart)
      }
    }

    const handleDoubleClick = () => {
      onDoubleClickRef.current?.(chart)
      saveCurrentScales()
    }

    const handleWheel = (event: WheelEvent) => {
      const zoom = wheelZoomRef.current
      if (!zoom) {
        return
      }

      event.preventDefault()
      const overlayRect = chart.over.getBoundingClientRect()
      const left = event.clientX - overlayRect.left
      const plotWidth = chart.over.clientWidth
      if (left < 0 || left > plotWidth || plotWidth <= 0) {
        return
      }

      const currentMin = chart.scales.x.min ?? 0
      const currentMax = chart.scales.x.max ?? 1
      const currentRange = currentMax - currentMin
      const nextRange = currentRange * (event.deltaY < 0 ? 0.85 : 1.15)
      if (nextRange < zoom.minRange || nextRange > zoom.maxRange) {
        return
      }

      const cursorValue = chart.posToVal(left, 'x')
      const cursorRatio = left / plotWidth
      const nextMin = cursorValue - cursorRatio * nextRange
      chart.setScale('x', { min: nextMin, max: nextMin + nextRange })
      saveCurrentScales()
    }

    const handleMouseLeave = () => {
      onMouseLeaveRef.current?.()
    }

    chart.over.addEventListener('mousedown', handleMouseDown)
    chart.over.addEventListener('dblclick', handleDoubleClick)
    chart.over.addEventListener('wheel', handleWheel, { passive: false })
    chart.over.addEventListener('mouseleave', handleMouseLeave)
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    onDataRef.current?.(chart)

    return () => {
      saveCurrentScales()
      chart.over.removeEventListener('mousedown', handleMouseDown)
      chart.over.removeEventListener('dblclick', handleDoubleClick)
      chart.over.removeEventListener('wheel', handleWheel)
      chart.over.removeEventListener('mouseleave', handleMouseLeave)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      restoreCursor()
      chart.destroy()
      uplotRef.current = null
    }
  }, [cursor, heightPadding, layoutReady, widthPadding, options])

  useEffect(() => {
    const chart = uplotRef.current
    if (!chart) {
      return
    }

    chart.setData(data)
    onDataRef.current?.(chart)
  }, [data])

  return <div ref={containerRef} className={className} />
}

export default UPlotChart
