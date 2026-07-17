import { CheckCircle, Circle } from 'lucide-react'
import { usePlayerStore } from '@/stores/usePlayerStore'

export default function PanelSettings() {
  const {
    activePanel,
    messagesSettings,
    updateMessagesSettings,
    fileSummary,
    subscribedTopics,
    toggleTopicSubscription,
  } = usePlayerStore()

  if (activePanel === 'overview') {
    return (
      <div className="p-4 flex flex-col items-center justify-center text-center text-muted-foreground h-48 space-y-2">
        <span className="text-xs font-semibold">No Settings Available</span>
        <span className="text-[10px] text-muted-foreground/60 max-w-[200px] leading-relaxed">
          The Overview panel displays static metadata definitions and does not require runtime configurations.
        </span>
      </div>
    )
  }

  const hzOptions = [1, 5, 10, 15, 30, 60]
  const formatOptions = [
    { value: 'placeholder', label: 'Placeholder', desc: 'e.g. <Uint8Array: 12 bytes>' },
    { value: 'hex', label: 'Hex Dump', desc: 'e.g. 01 f2 0c ... (max 64b)' },
    { value: 'raw', label: 'Raw Numbers', desc: 'e.g. [1, 242, 12, ...] (max 64b)' },
  ] as const

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-card text-foreground">
      {/* Scroll Container */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Refresh Rate Selector */}
        <div className="space-y-2.5">
          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
            UI Refresh Rate
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            {hzOptions.map((hz) => {
              const isActive = messagesSettings.refreshRateHz === hz
              return (
                <button
                  key={hz}
                  onClick={() => updateMessagesSettings({ refreshRateHz: hz })}
                  className={`py-1.5 text-[10px] font-mono font-semibold rounded-md border transition-all cursor-pointer ${
                    isActive
                      ? 'bg-primary border-primary text-primary-foreground shadow-xs font-bold'
                      : 'bg-background border-border text-muted-foreground hover:text-foreground hover:bg-accent/40'
                  }`}
                >
                  {hz}
                  {' '}
                  Hz
                </button>
              )
            })}
          </div>
          <span className="text-[9px] text-muted-foreground/60 block leading-tight">
            Limits the rendering frequency of the log rows to save CPU cycles.
          </span>
        </div>

        {/* Binary Format Selector */}
        <div className="space-y-2.5">
          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
            Binary Byte Array Format
          </label>
          <div className="space-y-2">
            {formatOptions.map((opt) => {
              const isActive = messagesSettings.binaryFormat === opt.value
              return (
                <button
                  key={opt.value}
                  onClick={() => updateMessagesSettings({ binaryFormat: opt.value })}
                  className={`w-full text-left p-2.5 rounded-lg border transition-all cursor-pointer ${
                    isActive
                      ? 'bg-accent/40 border-border/80 text-foreground font-semibold shadow-inner'
                      : 'bg-background border-border/40 text-muted-foreground hover:text-foreground hover:bg-accent/10'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-foreground">{opt.label}</span>
                    <span className="text-[9px] text-muted-foreground/60">{opt.desc}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Topic Subscription Panel Settings */}
        {fileSummary && (
          <div className="space-y-2.5 pt-4 border-t border-border/45">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block flex items-center justify-between">
              <span>Topic Selection</span>
              <span className="text-[9px] bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded-full font-mono font-bold">
                {subscribedTopics.size}
                {' '}
                active
              </span>
            </label>
            <div className="space-y-1 bg-background border border-border/40 rounded-lg p-2 max-h-48 overflow-y-auto">
              {fileSummary.channels.map((ch) => {
                const isSubscribed = subscribedTopics.has(ch.topic)
                return (
                  <div
                    key={ch.id}
                    onClick={() => toggleTopicSubscription(ch.topic)}
                    className="flex items-center justify-between p-1.5 rounded-md hover:bg-accent/40 cursor-pointer select-none text-[10px] font-mono"
                  >
                    <span className="truncate pr-2 text-foreground font-medium flex items-center gap-1.5" title={ch.topic}>
                      {ch.topic}
                    </span>
                    <span className="shrink-0 text-muted-foreground">
                      {isSubscribed
                        ? (
                            <CheckCircle className="w-4 h-4 text-primary" />
                          )
                        : (
                            <Circle className="w-4 h-4 text-muted-foreground/45" />
                          )}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
