import { Radio } from 'lucide-react'
import { useEffect, useState } from 'react'
import { JsonViewer } from '@/components/ui/json-viewer'
import { globalMessageBus } from '@/core/MessageBus'
import { formatBytes, formatNanoseconds } from '@/lib/time'
import { usePlayerStore } from '@/stores/usePlayerStore'

interface MessageViewerProps {
  topic: string
  refreshRateHz: number
}

function MessageViewer({ topic, refreshRateHz }: MessageViewerProps) {
  const [msg, setMsg] = useState<any | null>(null)

  useEffect(() => {
    let latestMsg: any = null
    let hasNew = false

    // Clear state on seek
    const unsubSeek = globalMessageBus.subscribe('__seek__', () => {
      latestMsg = null
      hasNew = false
      setMsg(null)
    })

    // Listen to topic message bus
    const unsub = globalMessageBus.subscribe(topic, (newMsg) => {
      latestMsg = newMsg
      hasNew = true
    })

    // Throttle UI update dynamically based on config
    const intervalMs = Math.round(1000 / refreshRateHz)
    const interval = setInterval(() => {
      if (hasNew) {
        setMsg(latestMsg)
        hasNew = false
      }
    }, intervalMs)

    return () => {
      unsubSeek()
      unsub()
      clearInterval(interval)
    }
  }, [topic, refreshRateHz])

  if (!msg) {
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
        <JsonViewer data={msg.payload} />
      </div>
    </div>
  )
}

export default function RawMessageStream() {
  const subscribedTopics = usePlayerStore(state => state.subscribedTopics)
  const refreshRateHz = usePlayerStore(state => state.messagesSettings.refreshRateHz)
  const activeTopic = Array.from(subscribedTopics)[0]

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
          {activeTopic && (
            <span className="font-mono text-[10px] bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full font-bold">
              {activeTopic}
            </span>
          )}
        </div>

        {/* Content Body */}
        {!activeTopic
          ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground bg-card">
                <p className="text-xs font-semibold">No Topic Selected</p>
                <p className="text-[10px] text-muted-foreground/60 mt-1 max-w-[240px] leading-relaxed">
                  Please select a topic under the **Topics** tab or in **Settings** in the LeftSideBar to inspect its payload details.
                </p>
              </div>
            )
          : (
              <MessageViewer topic={activeTopic} refreshRateHz={refreshRateHz} />
            )}
      </div>
    </div>
  )
}
