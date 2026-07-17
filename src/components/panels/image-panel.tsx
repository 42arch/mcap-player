import { Image as ImageIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { globalMessageBus } from '@/core/message-bus'
import { scheduleFrame } from '@/lib/raf-scheduler'
import { cn } from '@/lib/utils'
import { usePlayerStore } from '@/stores/use-player-store'

interface ImageViewerProps {
  topic: string
  refreshRateHz: number
  imageFit: 'contain' | 'cover' | 'fill'
  brightness: number
}

function ImageViewer({ topic, refreshRateHz, imageFit, brightness }: ImageViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [renderType, setRenderType] = useState<'canvas' | 'img' | null>(null)
  const [showLoading, setShowLoading] = useState(false)
  const [msgReceived, setMsgReceived] = useState(false)

  useEffect(() => {
    setMsgReceived(false)
    setShowLoading(false)

    // Debounce loading indicator to prevent flashing on fast backfills
    const timer = setTimeout(() => {
      setShowLoading(true)
    }, 150)

    let latestMsg: any = null
    let hasNew = false
    let cancelRaf: (() => void) | null = null
    let objectUrlToRevoke: string | null = null

    const unsub = globalMessageBus.subscribe(topic, (newMsg) => {
      latestMsg = newMsg
      hasNew = true
    })

    const intervalMs = Math.round(1000 / refreshRateHz)
    const interval = setInterval(() => {
      if (hasNew) {
        const msg = latestMsg
        hasNew = false
        setMsgReceived(true)

        if (cancelRaf) {
          cancelRaf()
        }

        cancelRaf = scheduleFrame(() => {
          const payload = msg.payload
          if (!payload)
            return

          // Determine if compressed or raw
          const isCompressed = payload.format !== undefined && payload.data !== undefined

          if (isCompressed) {
            setRenderType('img')
            if (imgRef.current) {
              const uint8 = payload.data instanceof Uint8Array
                ? payload.data
                : new Uint8Array(payload.data)

              const formatVal = String(payload.format).split(';')[0]
              const blob = new Blob([uint8], { type: `image/${formatVal}` })
              const url = URL.createObjectURL(blob)

              imgRef.current.src = url

              if (objectUrlToRevoke) {
                URL.revokeObjectURL(objectUrlToRevoke)
              }
              objectUrlToRevoke = url
            }
          }
          else if (payload.width !== undefined && payload.height !== undefined && payload.data !== undefined) {
            setRenderType('canvas')
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
        })
      }
    }, intervalMs)

    return () => {
      unsub()
      clearInterval(interval)
      clearTimeout(timer)
      if (cancelRaf) {
        cancelRaf()
      }
      if (objectUrlToRevoke) {
        URL.revokeObjectURL(objectUrlToRevoke)
      }
    }
  }, [topic, refreshRateHz])

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
          renderType !== 'canvas' && 'hidden',
          imageFit === 'contain' && 'max-w-full max-h-full object-contain',
          imageFit === 'cover' && 'w-full h-full object-cover',
          imageFit === 'fill' && 'w-full h-full object-fill',
          '[filter:brightness(var(--image-brightness))]',
        )}
      />
      <img
        ref={imgRef}
        alt="camera frame"
        className={cn(
          renderType !== 'img' && 'hidden',
          imageFit === 'contain' && 'max-w-full max-h-full object-contain',
          imageFit === 'cover' && 'w-full h-full object-cover',
          imageFit === 'fill' && 'w-full h-full object-fill',
          '[filter:brightness(var(--image-brightness))]',
        )}
      />
    </div>
  )
}

export default function ImagePanel() {
  const fileSummary = usePlayerStore(state => state.fileSummary)
  const setSubscribedTopics = usePlayerStore(state => state.setSubscribedTopics)
  const subscribedTopics = usePlayerStore(state => state.subscribedTopics)
  const refreshRateHz = usePlayerStore(state => state.messagesSettings.refreshRateHz)
  const imageFit = usePlayerStore(state => state.imageSettings.imageFit)
  const brightness = usePlayerStore(state => state.imageSettings.brightness)
  const activeTopic = Array.from(subscribedTopics)[0]

  const channels = fileSummary?.channels || []
  const imageChannels = channels.filter((ch) => {
    if (!ch.schemaName)
      return false
    const lower = ch.schemaName.toLowerCase()
    return lower.includes('image')
  })

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background p-4">
      <div className="flex-1 flex flex-col border border-border bg-card rounded-xl overflow-hidden">
        {/* Stream Header */}
        <div className="flex items-center justify-between p-3 border-b border-border bg-card shrink-0 select-none">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-3.5 h-3.5 text-primary" />
            <span className="font-bold text-xs uppercase tracking-wide">
              Camera Image View
            </span>
          </div>

          {fileSummary && imageChannels.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                Topic:
              </span>
              <Select
                value={activeTopic || ''}
                onValueChange={(val) => {
                  if (val) {
                    setSubscribedTopics(new Set([val]))
                  }
                  else {
                    setSubscribedTopics(new Set())
                  }
                }}
              >
                <SelectTrigger size="sm" className="w-48 bg-background border-border/80 text-[10px] h-6 py-0.5 px-2 font-mono">
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
        </div>

        {/* Content Body */}
        {imageChannels.length === 0
          ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground bg-card">
                <p className="text-xs font-semibold">No Image Channels Available</p>
                <p className="text-[10px] text-muted-foreground/60 mt-1 max-w-[240px] leading-relaxed">
                  No topics with schema type matching sensor_msgs/Image or sensor_msgs/CompressedImage were found in this file.
                </p>
              </div>
            )
          : !activeTopic
              ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground bg-card">
                    <p className="text-xs font-semibold">No Topic Selected</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-1 max-w-[240px] leading-relaxed">
                      Please select an active camera topic from the dropdown selector in the header to view the frame.
                    </p>
                  </div>
                )
              : (
                  <ImageViewer topic={activeTopic} refreshRateHz={refreshRateHz} imageFit={imageFit} brightness={brightness} />
                )}
      </div>
    </div>
  )
}
