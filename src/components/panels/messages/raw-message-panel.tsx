import { Radio } from 'lucide-react'
import { useEffect, useState } from 'react'
import { MessageViewer } from '@/components/common/message-viewer'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { globalMessageBus } from '@/core/message-bus'
import { scheduleFrame } from '@/lib/raf-scheduler'
import { formatBytes, formatNanoseconds } from '@/lib/time'
import { usePlayerStore } from '@/stores/use-player-store'

interface RawMessageViewerProps {
  topic: string
  refreshRateHz: number
}

function RawMessageViewer({ topic, refreshRateHz }: RawMessageViewerProps) {
  const [msg, setMsg] = useState<any | null>(null)
  const [showLoading, setShowLoading] = useState(false)

  useEffect(() => {
    // Clear message when topic changes to prevent showing stale data of previous topic
    setMsg(null)
    setShowLoading(false)

    // Debounce loading indicator to prevent flashing on fast backfills
    const loadingTimer = setTimeout(() => {
      setShowLoading(true)
    }, 150)

    let latestMsg: any = null
    let hasNew = false
    let cancelRaf: (() => void) | null = null

    // Listen to topic message bus
    const unsub = globalMessageBus.subscribe(topic, (newMsg) => {
      latestMsg = newMsg
      hasNew = true
    })

    // Throttle UI update dynamically based on config
    const intervalMs = Math.round(1000 / refreshRateHz)
    const interval = setInterval(() => {
      if (hasNew) {
        if (cancelRaf) {
          cancelRaf()
        }
        cancelRaf = scheduleFrame(() => {
          setMsg(latestMsg)
        })
        hasNew = false
      }
    }, intervalMs)

    return () => {
      unsub()
      clearInterval(interval)
      clearTimeout(loadingTimer)
      if (cancelRaf) {
        cancelRaf()
      }
    }
  }, [topic, refreshRateHz])

  if (!msg) {
    if (!showLoading) {
      return <div className="flex-1 bg-background" /> // Clean blank placeholder to prevent flickering
    }

    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-muted-foreground bg-background">
        <div className="relative flex items-center justify-center mb-3">
          <div className="w-5 h-5 border-2 border-primary/25 border-t-primary rounded-full animate-spin" />
        </div>
        <p className="text-xs font-semibold">Waiting for message...</p>
        <p className="text-[10px] text-muted-foreground/60 mt-1">
          Play the MCAP file or drag the timeline to see decoded topic payload.
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background text-foreground">
      {/* Message Info Header */}
      <div className="px-4 py-2 border-b border-border bg-muted/20 flex flex-wrap items-center justify-between gap-4 font-mono text-[10px] text-muted-foreground select-none">
        <div className="flex items-center gap-3">
          <span>
            Sequence:
            <span className="font-semibold text-foreground ml-1">{msg.sequence}</span>
          </span>
          <span className="text-border/40 select-none">|</span>
          <span>
            Size:
            <span className="font-semibold text-foreground ml-1">{formatBytes(msg.dataLength)}</span>
          </span>
        </div>
        <div>
          <span>
            Log Time:
            <span className="font-semibold text-foreground ml-1">{formatNanoseconds(msg.logTime)}</span>
          </span>
        </div>
      </div>

      {/* JSON Viewer fills the remaining container height */}
      <div className="flex-1 min-h-0 relative overflow-hidden bg-background">
        <MessageViewer data={msg.payload} />
      </div>
    </div>
  )
}

export default function RawMessagePanel() {
  const fileSummary = usePlayerStore(state => state.fileSummary)
  const setSubscribedTopics = usePlayerStore(state => state.setSubscribedTopics)
  const subscribedTopics = usePlayerStore(state => state.subscribedTopics)
  const refreshRateHz = usePlayerStore(state => state.messagesSettings.refreshRateHz)
  const activeTopic = Array.from(subscribedTopics)[0]

  const channels = fileSummary?.channels || []

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background p-4">
      <div className="flex-1 flex flex-col border border-border bg-card rounded-xl overflow-hidden">
        {/* Stream Header */}
        <div className="flex items-center justify-between p-3 border-b border-border bg-card shrink-0 select-none">
          <div className="flex items-center gap-2">
            <Radio className="w-3.5 h-3.5 text-primary" />
            <span className="font-bold text-xs uppercase tracking-wide">
              Raw Message Inspector
            </span>
          </div>

          {fileSummary && channels.length > 0 && (
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
                  <SelectValue placeholder="Select topic..." />
                </SelectTrigger>
                <SelectContent position="popper" className="bg-popover text-popover-foreground">
                  {channels.map(ch => (
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
        {!activeTopic
          ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground bg-card">
                <p className="text-xs font-semibold">No Topic Selected</p>
                <p className="text-[10px] text-muted-foreground/60 mt-1 max-w-[240px] leading-relaxed">
                  Please select an active topic from the dropdown selector in the header to inspect its payload details.
                </p>
              </div>
            )
          : (
              <RawMessageViewer topic={activeTopic} refreshRateHz={refreshRateHz} />
            )}
      </div>
    </div>
  )
}
