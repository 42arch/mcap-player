import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
          <Select
            value={String(messagesSettings.refreshRateHz)}
            onValueChange={val => updateMessagesSettings({ refreshRateHz: Number(val) })}
          >
            <SelectTrigger className="w-full bg-background border-border text-[11px] h-8 px-2 font-mono">
              <SelectValue placeholder="Select refresh rate..." />
            </SelectTrigger>
            <SelectContent position="popper" className="bg-popover text-popover-foreground">
              {hzOptions.map(hz => (
                <SelectItem key={hz} value={String(hz)} className="font-mono text-[11px] py-1 h-8">
                  {hz}
                  {' '}
                  Hz
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-[9px] text-muted-foreground/60 block leading-tight">
            Limits the rendering frequency of the log rows to save CPU cycles.
          </span>
        </div>

        {/* Binary Format Selector */}
        <div className="space-y-2.5">
          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
            Binary Byte Array Format
          </label>
          <Select
            value={messagesSettings.binaryFormat}
            onValueChange={val => updateMessagesSettings({ binaryFormat: val as any })}
          >
            <SelectTrigger className="w-full bg-background border-border text-[11px] h-8 px-2">
              <span>
                {formatOptions.find(o => o.value === messagesSettings.binaryFormat)?.label || 'Select binary format...'}
              </span>
            </SelectTrigger>
            <SelectContent position="popper" className="bg-popover text-popover-foreground">
              {formatOptions.map(opt => (
                <SelectItem key={opt.value} value={opt.value} className="text-[11px] py-1.5 min-h-8">
                  <div className="flex flex-col items-start leading-tight">
                    <span className="font-medium text-[11px] text-foreground">{opt.label}</span>
                    <span className="text-[9px] text-muted-foreground/60">{opt.desc}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

      </div>
    </div>
  )
}
