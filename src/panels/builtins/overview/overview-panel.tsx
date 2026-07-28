import type { OverviewPanelConfig, PanelComponentProps } from '@/panels/core/types'
import { Clock, Code2, Database, Info, Radio } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { formatBytes, formatDuration, formatNanoseconds } from '@/lib/time'
import { usePlayerStore } from '@/stores/use-player-store'

export default function OverviewPanel(_props: PanelComponentProps<OverviewPanelConfig>) {
  const fileSummary = usePlayerStore(state => state.fileSummary)
  if (!fileSummary) {
    return null
  }
  return (
    <div className="flex-1 min-h-0 p-4 flex flex-col gap-4 overflow-hidden bg-background">
      {/* Stats Summary Section */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
        <div className="p-3 bg-card border border-border/80 rounded-xl flex items-center gap-3 shadow-xs">
          <Database className="w-4 h-4 text-primary shrink-0" />
          <div>
            <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wide">File Size</div>
            <div className="text-xs font-semibold mt-1 font-mono">{formatBytes(fileSummary.size)}</div>
          </div>
        </div>
        <div className="p-3 bg-card border border-border/80 rounded-xl flex items-center gap-3 shadow-xs">
          <Radio className="w-4 h-4 text-primary shrink-0" />
          <div>
            <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wide">Messages</div>
            <div className="text-xs font-semibold mt-1 font-mono">{fileSummary.messageCount.toLocaleString()}</div>
          </div>
        </div>
        <div className="p-3 bg-card border border-border/80 rounded-xl flex items-center gap-3 shadow-xs">
          <Clock className="w-4 h-4 text-primary shrink-0" />
          <div>
            <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wide">Duration</div>
            <div className="text-xs font-semibold mt-1 font-mono">{formatDuration(fileSummary.durationNs)}</div>
          </div>
        </div>
        <div className="p-3 bg-card border border-border/80 rounded-xl flex items-center gap-3 shadow-xs">
          <Info className="w-4 h-4 text-primary shrink-0" />
          <div>
            <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wide">Total Channels</div>
            <div className="text-xs font-semibold mt-1 font-mono">{fileSummary.channels.length}</div>
          </div>
        </div>
      </div>

      {/* Time Ranges banner */}
      <div className="p-3 bg-card border border-border/60 rounded-xl text-[10px] text-muted-foreground font-mono flex flex-wrap gap-x-6 gap-y-1.5 shrink-0 shadow-2xs">
        <span>
          Start Time:
          <span className="font-semibold text-foreground select-all ml-1">{formatNanoseconds(fileSummary.startNs)}</span>
        </span>
        <span className="text-border/40 select-none">|</span>
        <span>
          End Time:
          <span className="font-semibold text-foreground select-all ml-1">{formatNanoseconds(fileSummary.endNs)}</span>
        </span>
      </div>

      {/* Grid Layout below */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left 2/3 Area - Channels definitions */}
        <div className="lg:col-span-2 flex flex-col border border-border bg-card rounded-xl overflow-hidden min-h-[300px]">
          <div className="p-3 border-b border-border bg-card shrink-0 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-primary" />
              Channel Definitions & Metadata
            </h2>
          </div>
          <ScrollArea className="flex-1 min-h-0">
            <div className="p-3 divide-y divide-border/60">
              {fileSummary.channels.map(ch => (
                <div key={ch.id} className="py-2 flex items-start justify-between gap-4 font-mono text-[11px]">
                  <div className="min-w-0">
                    <span className="font-semibold text-foreground">{ch.topic}</span>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      Schema:
                      {' '}
                      {ch.schemaName || 'None'}
                      {' '}
                      (Schema ID:
                      {' '}
                      {ch.schemaId}
                      )
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-foreground font-bold">
                      {ch.messageCount}
                      {' '}
                      msg
                    </div>
                    <div className="text-[9px] text-muted-foreground">
                      Ch ID:
                      {ch.id}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Right 1/3 Area - Schemas list */}
        <div className="flex flex-col border border-border bg-card rounded-xl overflow-hidden min-h-[300px]">
          <div className="p-3 border-b border-border bg-card shrink-0">
            <h2 className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
              <Code2 className="w-3.5 h-3.5 text-primary" />
              Schemas (
              {fileSummary.schemas.length}
              )
            </h2>
          </div>

          <ScrollArea className="flex-1 min-h-0">
            <div className="p-3 space-y-3">
              {fileSummary.schemas.length === 0
                ? (
                    <div className="text-center py-12 text-muted-foreground text-xs">
                      No schema records defined in this file.
                    </div>
                  )
                : (
                    fileSummary.schemas.map(schema => (
                      <div key={schema.id} className="p-3 bg-background border border-border rounded-lg space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <span className="font-semibold text-xs text-foreground block truncate select-text" title={schema.name}>
                              {schema.name}
                            </span>
                            <span className="text-[9px] text-muted-foreground font-mono mt-0.5 block truncate select-text">
                              Encoding:
                              {' '}
                              {schema.encoding}
                            </span>
                          </div>
                          <span className="shrink-0 text-[10px] font-mono font-bold bg-secondary px-1.5 py-0.5 rounded text-muted-foreground">
                            ID:
                            {' '}
                            {schema.id}
                          </span>
                        </div>

                        {schema.dataText && (
                          <div className="mt-1">
                            <details className="group">
                              <summary className="text-[10px] text-primary cursor-pointer select-none hover:underline flex items-center gap-1">
                                <span className="group-open:rotate-90 transition-transform inline-block">▸</span>
                                View definition text
                              </summary>
                              <pre className="mt-1.5 p-2 bg-card rounded border border-border/40 font-mono text-[9px] text-muted-foreground select-text overflow-auto max-h-48 whitespace-pre-wrap leading-tight break-all">
                                {schema.dataText}
                              </pre>
                            </details>
                          </div>
                        )}
                      </div>
                    ))
                  )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  )
}
