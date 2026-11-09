import type { ImagePanelConfig, PanelComponentProps } from '@/panels/core/types'
import { useEffect, useRef, useState } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { isH264Format, processH264Frame } from '@/core/parsers/h264'
import { scheduleFrame } from '@/core/raf-scheduler'
import { cn } from '@/lib/utils'
import { PanelContentHeader } from '@/panels/builtins/panel-content-header'
import { isSelectableImageChannel } from '@/panels/core/default-topic'
import { usePanelConfig } from '@/panels/core/panel-context'
import { globalMessagePipeline } from '@/panels/runtime/message-pipeline'
import { usePlayerStore } from '@/stores/use-player-store'
import { WorkerImageViewer } from './worker-image-viewer'

interface ImageViewerProps {
  panelId: string
  topic: string
  imageFit: 'contain' | 'cover' | 'fill'
  brightness: number
}

function MainThreadImageViewer({ panelId, topic, imageFit, brightness }: ImageViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [showLoading, setShowLoading] = useState(false)
  const [msgReceived, setMsgReceived] = useState(false)

  useEffect(() => {
    setMsgReceived(false)
    setShowLoading(false)

    // Debounce loading indicator to prevent flashing on fast backfills
    const timer = setTimeout(() => {
      setShowLoading(true)
    }, 150)

    let cancelRaf: (() => void) | null = null
    let videoDecoder: VideoDecoder | null = null
    let hasSeenKeyframe = false
    let cachedSpsPps: Uint8Array | null = null
    const msgQueue: any[] = []
    let isScheduled = false

    const initVideoDecoder = () => {
      if (!('VideoDecoder' in window)) {
        console.warn('WebCodecs VideoDecoder is not supported in this browser environment.')
        return null
      }

      try {
        hasSeenKeyframe = false
        const decoder = new VideoDecoder({
          output: (frame: VideoFrame) => {
            if (canvasRef.current) {
              const canvas = canvasRef.current
              if (canvas.width !== frame.displayWidth || canvas.height !== frame.displayHeight) {
                canvas.width = frame.displayWidth
                canvas.height = frame.displayHeight
              }
              const ctx = canvas.getContext('2d')
              if (ctx) {
                ctx.drawImage(frame, 0, 0, canvas.width, canvas.height)
              }
            }
            frame.close()
          },
          error: (err) => {
            console.error('VideoDecoder runtime error:', err)
          },
        })

        const codecsToTry = ['avc1.42E01E', 'avc1.4D401E', 'avc1.64001E']
        for (const codec of codecsToTry) {
          try {
            decoder.configure({ codec, optimizeForLatency: true })
            break
          }
          catch {
            // Try next codec profile if unsupported
          }
        }

        return decoder
      }
      catch (e) {
        console.error('Failed to initialize VideoDecoder:', e)
        return null
      }
    }

    const unsubSeek = globalMessagePipeline.subscribeSeek(panelId, () => {
      msgQueue.length = 0
      if (videoDecoder && videoDecoder.state === 'configured') {
        try {
          videoDecoder.reset()
          videoDecoder.configure({ codec: 'avc1.42E01E', optimizeForLatency: true })
          hasSeenKeyframe = false
        }
        catch (e) {
          console.error('Error resetting VideoDecoder on seek:', e)
        }
      }
    })

    const processQueue = () => {
      isScheduled = false
      while (msgQueue.length > 0) {
        const newMsg = msgQueue.shift()
        const payload = newMsg.payload
        if (!payload)
          continue

        const isCompressed = payload.format !== undefined && payload.data !== undefined

        if (isCompressed) {
          const isH264 = isH264Format(payload.format)

          const uint8 = payload.data instanceof Uint8Array
            ? payload.data
            : new Uint8Array(payload.data)

          if (isH264) {
            if (!videoDecoder || videoDecoder.state === 'closed') {
              videoDecoder = initVideoDecoder()
            }

            if (videoDecoder && videoDecoder.state === 'configured') {
              const { bytes: parsedBytes, isKeyframe, spsPps } = processH264Frame(uint8)
              let bytes = parsedBytes

              if (spsPps) {
                cachedSpsPps = spsPps
              }

              if (!hasSeenKeyframe) {
                if (!isKeyframe) {
                  continue
                }
                hasSeenKeyframe = true
                if (!spsPps && cachedSpsPps) {
                  const combined = new Uint8Array(cachedSpsPps.length + bytes.length)
                  combined.set(cachedSpsPps, 0)
                  combined.set(bytes, cachedSpsPps.length)
                  bytes = combined
                }
              }

              try {
                const chunk = new EncodedVideoChunk({
                  type: isKeyframe ? 'key' : 'delta',
                  timestamp: Number(newMsg.logTime / 1000n),
                  data: bytes,
                })
                videoDecoder.decode(chunk)
              }
              catch (err) {
                console.error('Error decoding H.264 video chunk:', err)
              }
            }
          }
          else {
            // Render standard compressed formats (JPEG, PNG, WebP) on Canvas via createImageBitmap
            const formatVal = String(payload.format || 'jpeg').split(';')[0].toLowerCase().trim()
            const blob = new Blob([uint8], { type: `image/${formatVal}` })
            createImageBitmap(blob).then((bitmap) => {
              if (canvasRef.current) {
                const canvas = canvasRef.current
                if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
                  canvas.width = bitmap.width
                  canvas.height = bitmap.height
                }
                const ctx = canvas.getContext('2d')
                if (ctx) {
                  ctx.drawImage(bitmap, 0, 0)
                }
              }
              bitmap.close()
            }).catch((err) => {
              console.error('Error decoding compressed image bitmap:', err)
            })
          }
        }
        else if (payload.width !== undefined && payload.height !== undefined && payload.data !== undefined) {
          if (canvasRef.current) {
            const canvas = canvasRef.current
            const ctx = canvas.getContext('2d')
            if (ctx) {
              const { width, height, encoding, data } = payload
              canvas.width = width
              canvas.height = height

              const imageData = ctx.createImageData(width, height)
              const rgba = imageData.data
              const uint8 = data instanceof Uint8Array ? data : new Uint8Array(data)

              if (encoding === 'rgb8') {
                for (let i = 0, j = 0; i < uint8.length; i += 3, j += 4) {
                  rgba[j] = uint8[i]
                  rgba[j + 1] = uint8[i + 1]
                  rgba[j + 2] = uint8[i + 2]
                  rgba[j + 3] = 255
                }
              }
              else if (encoding === 'bgr8') {
                for (let i = 0, j = 0; i < uint8.length; i += 3, j += 4) {
                  rgba[j] = uint8[i + 2]
                  rgba[j + 1] = uint8[i + 1]
                  rgba[j + 2] = uint8[i]
                  rgba[j + 3] = 255
                }
              }
              else if (encoding === 'mono8') {
                for (let i = 0, j = 0; i < uint8.length; i++, j += 4) {
                  const val = uint8[i]
                  rgba[j] = val
                  rgba[j + 1] = val
                  rgba[j + 2] = val
                  rgba[j + 3] = 255
                }
              }
              else if (encoding === 'rgba8' || encoding === 'rgba') {
                rgba.set(uint8)
              }
              else if (encoding === 'bgra8' || encoding === 'bgra') {
                for (let i = 0, j = 0; i < uint8.length; i += 4, j += 4) {
                  rgba[j] = uint8[i + 2]
                  rgba[j + 1] = uint8[i + 1]
                  rgba[j + 2] = uint8[i]
                  rgba[j + 3] = uint8[i + 3]
                }
              }

              ctx.putImageData(imageData, 0, 0)
            }
          }
        }
      }
    }

    const unsub = globalMessagePipeline.subscribe({
      panelId,
      subscriptionId: 'image-frame',
      topics: [{ topic, mode: 'latest', priority: 'high' }],
    }, (newMsg) => {
      setMsgReceived(true)
      msgQueue.push(newMsg)

      if (!isScheduled) {
        isScheduled = true
        cancelRaf = scheduleFrame(() => {
          processQueue()
        })
      }
    })

    return () => {
      unsub()
      unsubSeek()
      clearTimeout(timer)
      if (cancelRaf) {
        cancelRaf()
      }
      if (videoDecoder) {
        if (videoDecoder.state !== 'closed') {
          try {
            videoDecoder.close()
          }
          catch {}
        }
        videoDecoder = null
      }
    }
  }, [panelId, topic])

  if (!msgReceived) {
    if (!showLoading) {
      return <div className="flex-1 bg-background" />
    }
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-muted-foreground bg-background">
        <div className="relative flex items-center justify-center mb-3">
          <div className="w-5 h-5 border-2 border-primary/25 border-t-primary rounded-full animate-spin" />
        </div>
        <p className="text-xs font-semibold">Waiting for image...</p>
        <p className="text-[10px] text-muted-foreground/60 mt-1">
          Play the MCAP file or drag the timeline to see decoded camera frame.
        </p>
      </div>
    )
  }

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
          '[filter:brightness(var(--image-brightness))]',
        )}
      />
    </div>
  )
}

function ImageViewer(props: ImageViewerProps) {
  const supportsWorkerRenderer = typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined'
  return supportsWorkerRenderer
    ? <WorkerImageViewer {...props} />
    : <MainThreadImageViewer {...props} />
}

export default function ImagePanel({ panelId }: PanelComponentProps<ImagePanelConfig>) {
  const fileSummary = usePlayerStore(state => state.fileSummary)
  const [config, updateConfig] = usePanelConfig<ImagePanelConfig>()
  const activeTopic = config.topic

  const channels = fileSummary?.channels || []
  const imageChannels = channels.filter(isSelectableImageChannel)

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-card overflow-hidden">
      <PanelContentHeader
        actions={fileSummary && imageChannels.length > 0 && (
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-[9px] font-semibold tracking-wider uppercase text-muted-foreground shrink-0 hidden @[460px]:inline-block">Topic</span>
            <Select
              value={activeTopic || ''}
              onValueChange={(val) => {
                updateConfig({ topic: val || null })
              }}
            >
              <SelectTrigger size="sm" className="w-48 max-w-full @[460px]:w-48 @[340px]:w-36 bg-background border-border/80 text-[10px] h-6 py-0.5 px-2 font-mono">
                <SelectValue placeholder="Select image topic..." />
              </SelectTrigger>
              <SelectContent position="popper" className="bg-popover text-popover-foreground">
                {imageChannels.map(ch => (
                  <SelectItem key={ch.id} value={ch.topic} className="font-mono text-[10px] py-1 h-6 min-h-0">
                    {ch.topic}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      />

      {/* Content Body */}
      {imageChannels.length === 0
        ? (
            <div className="flex-1 flex flex-col h-full items-center justify-center p-8 text-center text-muted-foreground bg-card">
              <p className="text-xs font-semibold">No Image Channels Available</p>
              <p className="text-[10px] text-muted-foreground/60 mt-1 max-w-60 leading-relaxed">
                No topics with schema type matching sensor_msgs/Image or sensor_msgs/CompressedImage were found in this file.
              </p>
            </div>
          )
        : !activeTopic
            ? (
                <div className="flex-1 flex flex-col h-full items-center justify-center p-8 text-center text-muted-foreground bg-card">
                  <p className="text-xs font-semibold">No Topic Selected</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1 max-w-60 leading-relaxed">
                    Please select an active camera topic from the dropdown selector in the header to view the frame.
                  </p>
                </div>
              )
            : (
                <ImageViewer panelId={panelId} topic={activeTopic} imageFit={config.imageFit} brightness={config.brightness} />
              )}
    </div>
  )
}
