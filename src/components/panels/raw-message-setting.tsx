import { usePlayerStore } from '@/stores/use-player-store'

export default function RawMessageSetting() {
  const messagesSettings = usePlayerStore(state => state.messagesSettings)
  const updateMessagesSettings = usePlayerStore(state => state.updateMessagesSettings)

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

      </div>
    </div>
  )
}
