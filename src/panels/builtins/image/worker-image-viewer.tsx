import type { ImageRendererCommand, ImageRendererEvent, ImageRenderFrame } from './image-render-protocol'
import type { PlaybackMessage } from '@/panels/runtime/message-pipeline'
import { useEffect, useRef, useState } from 'react'
import { checkH264IsKeyframe, isH264Format } from '@/core/parsers/h264'
import { globalPlaybackController } from '@/core/playback-controller'
import { scheduleFrame } from '@/core/raf-scheduler'
import { cn } from '@/lib/utils'
import { globalMessagePipeline } from '@/panels/runtime/message-pipeline'
import { selectLatestCompleteH264Gop } from './h264-backpressure'

export interface WorkerImageViewerProps {
  panelId: string
  topic: string
  imageFit: 'contain' | 'cover' | 'fill'
  brightness: number
}

const MAX_WORKER_FRAMES_IN_FLIGHT = 4

function copyImageData(value: unknown): ArrayBuffer | null {
  if (value instanceof ArrayBuffer) {
    return value.slice(0)
  }
  if (ArrayBuffer.isView(value)) {
    const source = new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
    return source.slice().buffer
  }
  if (Array.isArray(value)) {
    return Uint8Array.from(value).buffer
  }
  if (value && typeof value === 'object' && Array.isArray((value as { data?: unknown }).data)) {
    return Uint8Array.from((value as { data: number[] }).data).buffer
  }
  return null
}

function toRenderFrame(message: PlaybackMessage, generation: number): ImageRenderFrame | null {
  const payload = message.payload as Record<string, unknown> | null
  if (!payload) {
    return null
  }
  const data = copyImageData(payload.data)
  if (!data) {
    return null
  }

  const format = typeof payload.format === 'string' ? payload.format : undefined
  const isH264 = isH264Format(format)
  const bytes = isH264 ? new Uint8Array(data) : null
  return {
    generation,
    timestampUs: Number(message.logTime / 1000n),
    format,
    width: typeof payload.width === 'number' ? payload.width : undefined,
    height: typeof payload.height === 'number' ? payload.height : undefined,
    encoding: typeof payload.encoding === 'string' ? payload.encoding : undefined,
    step: typeof payload.step === 'number'
      ? payload.step
      : typeof payload.row_step === 'number'
        ? payload.row_step
        : typeof payload.rowStep === 'number' ? payload.rowStep : undefined,
    isH264,
    isKeyframe: bytes ? checkH264IsKeyframe(bytes) : false,
    data,
  }
}

export function WorkerImageViewer({ panelId, topic, imageFit, brightness }: WorkerImageViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [showLoading, setShowLoading] = useState(false)
  const [msgReceived, setMsgReceived] = useState(false)

  useEffect(() => {
    setMsgReceived(false)
    setShowLoading(false)

    const loadingTimer = setTimeout(setShowLoading, 150, true)
    const worker = new Worker(
      new URL('./image-render.worker.ts', import.meta.url),
      { type: 'module' },
    )
    let disposed = false
    let generation = 0
    let inFlight = 0
    let renderedOnce = false
    let pendingFrames: ImageRenderFrame[] = []
    let pendingBitmap: ImageBitmap | null = null
    let cancelDraw: (() => void) | null = null
    let unsubscribeTopic: (() => void) | null = null

    const postCommand = (command: ImageRendererCommand, transferables: Transferable[] = []) => {
      worker.postMessage(command, transferables)
    }

    const drawPendingBitmap = () => {
      cancelDraw = null
      const bitmap = pendingBitmap
      pendingBitmap = null
      const canvas = canvasRef.current
      if (!bitmap || !canvas) {
        bitmap?.close()
        return
      }
      try {
        if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
          canvas.width = bitmap.width
          canvas.height = bitmap.height
        }
        canvas.getContext('2d', { alpha: false })?.drawImage(bitmap, 0, 0)
        if (!renderedOnce) {
          renderedOnce = true
          clearTimeout(loadingTimer)
          setMsgReceived(true)
        }
      }
      finally {
        bitmap.close()
      }
    }

    const flushPendingFrames = () => {
      if (disposed) {
        return
      }
      while (inFlight < MAX_WORKER_FRAMES_IN_FLIGHT && pendingFrames.length > 0) {
        const frame = pendingFrames.shift()!
        inFlight++
        postCommand({ type: 'frame', frame }, [frame.data])
      }
    }

    const enqueueFrame = (frame: ImageRenderFrame) => {
      if (frame.isH264) {
        pendingFrames = selectLatestCompleteH264Gop([...pendingFrames, frame])
      }
      else {
        pendingFrames = [frame]
      }
      flushPendingFrames()
    }

    worker.onmessage = (event: MessageEvent<ImageRendererEvent>) => {
      const message = event.data
      if (disposed || message.generation !== generation) {
        if (message.type === 'rendered') {
          message.bitmap.close()
        }
        return
      }
      if (message.type === 'accepted') {
        inFlight = Math.max(0, inFlight - 1)
        flushPendingFrames()
      }
      else if (message.type === 'rendered') {
        pendingBitmap?.close()
        pendingBitmap = message.bitmap
        cancelDraw ??= scheduleFrame(drawPendingBitmap)
      }
      else {
        console.warn(`Image renderer for topic "${topic}": ${message.message}`)
      }
    }

    worker.onerror = (event) => {
      if (!disposed) {
        console.error(`Image renderer Worker failed for topic "${topic}":`, event.error || event.message)
      }
    }

    const unsubscribeSeek = globalMessagePipeline.subscribeSeek(panelId, () => {
      generation++
      inFlight = 0
      pendingFrames = []
      pendingBitmap?.close()
      pendingBitmap = null
      cancelDraw?.()
      cancelDraw = null
      postCommand({ type: 'reset', generation })
    })

    void globalPlaybackController.getImageTopicDeliveryMode(topic)
      .then((mode) => {
        if (disposed) {
          return
        }
        unsubscribeTopic = globalMessagePipeline.subscribe({
          panelId,
          subscriptionId: 'image-frame',
          topics: [{ topic, mode, priority: 'high' }],
        }, (message) => {
          const frame = toRenderFrame(message, generation)
          if (frame) {
            enqueueFrame(frame)
          }
        })
      })
      .catch((error: unknown) => {
        if (!disposed) {
          console.error(`Failed to inspect image format for topic "${topic}":`, error)
        }
      })

    return () => {
      disposed = true
      unsubscribeTopic?.()
      unsubscribeSeek()
      clearTimeout(loadingTimer)
      cancelDraw?.()
      pendingBitmap?.close()
      pendingFrames = []
      postCommand({ type: 'dispose' })
      worker.terminate()
    }
  }, [panelId, topic])

  return (
    <div
      className="flex-1 min-h-0 relative flex items-center justify-center bg-black overflow-hidden select-none"
      style={{ '--image-brightness': brightness } as React.CSSProperties}
    >
      <canvas
        ref={canvasRef}
        className={cn(
          imageFit === 'contain' && 'max-w-full max-h-full object-contain',
          imageFit === 'cover' && 'w-full h-full object-cover',
          imageFit === 'fill' && 'w-full h-full object-fill',
          !msgReceived && 'invisible',
          '[filter:brightness(var(--image-brightness))]',
        )}
      />
      {!msgReceived && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-muted-foreground bg-background">
          {showLoading && (
            <>
              <div className="relative flex items-center justify-center mb-3">
                <div className="w-5 h-5 border-2 border-primary/25 border-t-primary rounded-full animate-spin" />
              </div>
              <p className="text-xs font-semibold">Waiting for image...</p>
              <p className="text-[10px] text-muted-foreground/60 mt-1">
                Play the MCAP file or drag the timeline to see decoded camera frame.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
