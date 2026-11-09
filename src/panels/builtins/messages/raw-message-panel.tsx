import type { PanelComponentProps, RawMessagePanelConfig } from '@/panels/core/types'
import { useEffect, useState } from 'react'
import { FormattedMessage, useIntl } from 'react-intl'
import { MessageViewer } from '@/components/common/message-viewer'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { scheduleFrame } from '@/core/raf-scheduler'
import { formatBytes, formatNanoseconds } from '@/lib/time'
import { PanelContentHeader } from '@/panels/builtins/panel-content-header'
import { usePanelConfig } from '@/panels/core/panel-context'
import { globalMessagePipeline } from '@/panels/runtime/message-pipeline'
import { usePlayerStore } from '@/stores/use-player-store'

interface RawMessageViewerProps {
  panelId: string
  topic: string
  refreshRateHz: number
  binaryFormat: RawMessagePanelConfig['binaryFormat']
}

function RawMessageViewer({ panelId, topic, refreshRateHz, binaryFormat }: RawMessageViewerProps) {
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

    const unsub = globalMessagePipeline.subscribe({
      panelId,
      subscriptionId: 'raw-message',
      topics: [{ topic, mode: 'all' }],
    }, (newMsg) => {
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
  }, [panelId, topic, refreshRateHz])

  if (!msg) {
    if (!showLoading) {
      return <div className="flex-1 bg-background" /> // Clean blank placeholder to prevent flickering
    }

    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-muted-foreground bg-background">
        <div className="relative flex items-center justify-center mb-3">
          <div className="w-5 h-5 border-2 border-primary/25 border-t-primary rounded-full animate-spin" />
        </div>
        <p className="text-xs font-semibold">
          <FormattedMessage id="panel.messages.waiting" defaultMessage="Waiting for message..." />
        </p>
        <p className="text-[10px] text-muted-foreground/60 mt-1">
          <FormattedMessage
            id="panel.messages.waitingDesc"
            defaultMessage="Play the MCAP file or drag the timeline to see decoded topic payload."
          />
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
            <FormattedMessage id="panel.messages.sequence" defaultMessage="Sequence:" />
            <span className="font-semibold text-foreground ml-1">{msg.sequence}</span>
          </span>
          <span className="text-border/40 select-none">|</span>
          <span>
            <FormattedMessage id="panel.messages.size" defaultMessage="Size:" />
            <span className="font-semibold text-foreground ml-1">{formatBytes(msg.dataLength)}</span>
          </span>
        </div>
        <div>
          <span>
            <FormattedMessage id="panel.messages.logTime" defaultMessage="Log Time:" />
            <span className="font-semibold text-foreground ml-1">{formatNanoseconds(msg.logTime)}</span>
          </span>
        </div>
      </div>

      {/* JSON Viewer fills the remaining container height */}
      <div className="flex-1 min-h-0 relative overflow-hidden bg-background">
        <MessageViewer data={msg.payload} binaryFormat={binaryFormat} />
      </div>
    </div>
  )
}

export default function RawMessagePanel({ panelId }: PanelComponentProps<RawMessagePanelConfig>) {
  const intl = useIntl()
  const fileSummary = usePlayerStore(state => state.fileSummary)
  const [config, updateConfig] = usePanelConfig<RawMessagePanelConfig>()
  const activeTopic = config.topic

  const channels = fileSummary?.channels || []

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-card overflow-hidden">
      <PanelContentHeader
        actions={fileSummary && channels.length > 0 && (
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-[9px] font-semibold tracking-wider uppercase text-muted-foreground shrink-0 hidden @[460px]:inline-block">
              <FormattedMessage id="panel.messages.topic" defaultMessage="Topic" />
            </span>
            <Select
              value={activeTopic || ''}
              onValueChange={(val) => {
                updateConfig({ topic: val || null })
              }}
            >
              <SelectTrigger size="sm" className="w-48 max-w-full @[460px]:w-48 @[340px]:w-36 bg-background border-border/80 text-[10px] h-6 py-0.5 px-2 font-mono">
                <SelectValue placeholder={intl.formatMessage({ id: 'panel.messages.selectTopic', defaultMessage: 'Select topic...' })} />
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
      />

      {/* Content Body */}
      {!activeTopic
        ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground bg-card">
              <p className="text-xs font-semibold">
                <FormattedMessage id="panel.messages.noTopicSelected" defaultMessage="No Topic Selected" />
              </p>
              <p className="text-[10px] text-muted-foreground/60 mt-1 max-w-[240px] leading-relaxed">
                <FormattedMessage
                  id="panel.messages.selectTopicHint"
                  defaultMessage="Please select an active topic from the dropdown selector in the header to inspect its payload details."
                />
              </p>
            </div>
          )
        : (
            <RawMessageViewer panelId={panelId} topic={activeTopic} refreshRateHz={config.refreshRateHz} binaryFormat={config.binaryFormat} />
          )}
    </div>
  )
}
