import type { OverviewPanelConfig, PanelComponentProps } from '@/panels/core/types'
import {
  Boxes,
  Clock,
  Code2,
  Cpu,
  Database,
  FileText,
  Layers,
  Paperclip,
  Radio,
  Search,
  Tag,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { FormattedMessage, useIntl } from 'react-intl'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { formatBytes, formatDuration, formatNanoseconds } from '@/lib/time'
import { usePlayerStore } from '@/stores/use-player-store'

export default function OverviewPanel(_props: PanelComponentProps<OverviewPanelConfig>) {
  const intl = useIntl()
  const fileSummary = usePlayerStore(state => state.fileSummary)
  const [channelSearch, setChannelSearch] = useState('')
  const [schemaSearch, setSchemaSearch] = useState('')

  const filteredChannels = useMemo(() => {
    if (!fileSummary?.channels) {
      return []
    }
    const q = channelSearch.trim().toLowerCase()
    if (!q) {
      return fileSummary.channels
    }
    return fileSummary.channels.filter(ch =>
      ch.topic.toLowerCase().includes(q)
      || (ch.schemaName && ch.schemaName.toLowerCase().includes(q))
      || (ch.messageEncoding && ch.messageEncoding.toLowerCase().includes(q)),
    )
  }, [fileSummary?.channels, channelSearch])

  const filteredSchemas = useMemo(() => {
    if (!fileSummary?.schemas) {
      return []
    }
    const q = schemaSearch.trim().toLowerCase()
    if (!q) {
      return fileSummary.schemas
    }
    return fileSummary.schemas.filter(schema =>
      schema.name.toLowerCase().includes(q)
      || schema.encoding.toLowerCase().includes(q)
      || String(schema.id) === q,
    )
  }, [fileSummary?.schemas, schemaSearch])

  if (!fileSummary) {
    return null
  }

  const hasMetadata = Boolean(fileSummary.metadataItems && fileSummary.metadataItems.length > 0)
  const hasAttachments = Boolean(fileSummary.attachments && fileSummary.attachments.length > 0)

  return (
    <ScrollArea className="size-full bg-background">
      <div className="p-4 sm:p-6 space-y-6 min-w-175 max-w-7xl mx-auto">
        {/* Overview Stats Summary Grid */}
        <div className="grid grid-cols-5 gap-3">
          <div className="p-3 bg-card border border-border/80 rounded-xl flex items-center gap-3 shadow-2xs">
            <Database className="w-4 h-4 text-primary shrink-0" />
            <div className="min-w-0">
              <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wide truncate">
                <FormattedMessage id="overview.fileSize" defaultMessage="File Size" />
              </div>
              <div className="text-xs font-semibold mt-0.5 font-mono truncate">{formatBytes(fileSummary.size)}</div>
            </div>
          </div>

          <div className="p-3 bg-card border border-border/80 rounded-xl flex items-center gap-3 shadow-2xs">
            <Radio className="w-4 h-4 text-primary shrink-0" />
            <div className="min-w-0">
              <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wide truncate">
                <FormattedMessage id="overview.messages" defaultMessage="Messages" />
              </div>
              <div className="text-xs font-semibold mt-0.5 font-mono truncate">{fileSummary.messageCount.toLocaleString()}</div>
            </div>
          </div>

          <div className="p-3 bg-card border border-border/80 rounded-xl flex items-center gap-3 shadow-2xs">
            <Layers className="w-4 h-4 text-primary shrink-0" />
            <div className="min-w-0">
              <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wide truncate">
                <FormattedMessage id="overview.totalChannels" defaultMessage="Total Channels" />
              </div>
              <div className="text-xs font-semibold mt-0.5 font-mono truncate">{fileSummary.channels.length}</div>
            </div>
          </div>

          <div className="p-3 bg-card border border-border/80 rounded-xl flex items-center gap-3 shadow-2xs">
            <Code2 className="w-4 h-4 text-primary shrink-0" />
            <div className="min-w-0">
              <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wide truncate">
                <FormattedMessage id="overview.totalSchemas" defaultMessage="Total Schemas" />
              </div>
              <div className="text-xs font-semibold mt-0.5 font-mono truncate">{fileSummary.schemas.length}</div>
            </div>
          </div>

          <div className="p-3 bg-card border border-border/80 rounded-xl flex items-center gap-3 shadow-2xs">
            <Boxes className="w-4 h-4 text-primary shrink-0" />
            <div className="min-w-0">
              <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wide truncate">
                <FormattedMessage id="overview.chunks" defaultMessage="Chunks" />
              </div>
              <div className="text-xs font-semibold mt-0.5 font-mono truncate">
                {fileSummary.chunkCount ?? 0}
              </div>
            </div>
          </div>
        </div>

        {/* Time Ranges Banner */}
        <div className="p-3 bg-card border border-border/70 rounded-xl text-[11px] text-muted-foreground font-mono flex items-center gap-x-6 shadow-2xs">
          <div className="flex items-center gap-1.5 shrink-0">
            <Clock className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="font-semibold text-foreground">
              <FormattedMessage id="overview.startTime" defaultMessage="Start Time:" />
            </span>
            <span className="text-foreground select-all">{formatNanoseconds(fileSummary.startNs)}</span>
          </div>
          <span className="text-border select-none">|</span>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="font-semibold text-foreground">
              <FormattedMessage id="overview.endTime" defaultMessage="End Time:" />
            </span>
            <span className="text-foreground select-all">{formatNanoseconds(fileSummary.endNs)}</span>
          </div>
          <span className="text-border select-none">|</span>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="font-semibold text-foreground">
              <FormattedMessage id="overview.duration" defaultMessage="Duration:" />
            </span>
            <span className="text-foreground select-all">{formatDuration(fileSummary.durationNs)}</span>
          </div>
        </div>

        {/* Specifications & Metadata Grid Row */}
        <div className={hasMetadata ? 'grid grid-cols-2 gap-4' : 'grid grid-cols-1 gap-4'}>
          {/* Specifications & System Info Card */}
          <div className="p-4 bg-card border border-border/80 rounded-xl space-y-3 shadow-2xs flex flex-col justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 text-foreground shrink-0">
              <Cpu className="w-3.5 h-3.5 text-primary" />
              <FormattedMessage id="overview.specification" defaultMessage="File Specifications" />
            </h2>
            <div className="p-2.5 bg-background border border-border/60 rounded-lg font-mono text-[11px] space-y-1.5 divide-y divide-border/40 flex-1 flex flex-col justify-center">
              <div className="pt-1.5 first:pt-0 flex items-center justify-between gap-2">
                <span className="text-muted-foreground shrink-0">
                  <FormattedMessage id="overview.profile" defaultMessage="Profile:" />
                </span>
                <span className="font-semibold text-foreground select-all truncate">
                  {fileSummary.header?.profile || 'default'}
                </span>
              </div>
              <div className="pt-1.5 flex items-center justify-between gap-2">
                <span className="text-muted-foreground shrink-0">
                  <FormattedMessage id="overview.library" defaultMessage="Library:" />
                </span>
                <span className="font-semibold text-foreground select-all truncate">
                  {fileSummary.header?.library || 'Unknown'}
                </span>
              </div>
              <div className="pt-1.5 flex items-center justify-between gap-2">
                <span className="text-muted-foreground shrink-0">
                  <FormattedMessage id="overview.compression" defaultMessage="Compression:" />
                </span>
                <span className="font-semibold text-foreground select-all truncate">
                  {fileSummary.compressions && fileSummary.compressions.length > 0
                    ? fileSummary.compressions.join(', ')
                    : 'none'}
                </span>
              </div>
              <div className="pt-1.5 flex items-center justify-between gap-2">
                <span className="text-muted-foreground shrink-0">
                  <FormattedMessage id="overview.metadataRecords" defaultMessage="Metadata Records" />
                  {' / '}
                  <FormattedMessage id="overview.attachments" defaultMessage="Attachments" />
                  :
                </span>
                <span className="font-semibold text-foreground select-all truncate">
                  {fileSummary.metadataCount ?? fileSummary.metadataItems?.length ?? 0}
                  {' / '}
                  {fileSummary.attachmentCount ?? fileSummary.attachments?.length ?? 0}
                </span>
              </div>
            </div>
          </div>

          {/* MCAP Metadata Records (if present) */}
          {hasMetadata && (
            <div className="p-4 bg-card border border-border rounded-xl space-y-3 shadow-2xs flex flex-col">
              <h2 className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 text-foreground shrink-0">
                <FileText className="w-3.5 h-3.5 text-primary" />
                <FormattedMessage id="overview.metadataRecords" defaultMessage="Metadata Records" />
                <span className="text-muted-foreground text-[10px]">
                  (
                  {fileSummary.metadataItems?.length}
                  )
                </span>
              </h2>
              <div className="grid grid-cols-1 gap-2.5 max-h-60 overflow-y-auto pr-1">
                {fileSummary.metadataItems?.map((meta, idx) => (
                  <div key={`${meta.name}-${idx}`} className="p-2.5 bg-background border border-border/60 rounded-lg space-y-1.5 text-xs">
                    <div className="font-semibold text-primary font-mono flex items-center gap-1.5">
                      <Tag className="w-3 h-3 shrink-0" />
                      <span>{meta.name}</span>
                    </div>
                    <div className="space-y-1 font-mono text-[11px] divide-y divide-border/40">
                      {Object.entries(meta.metadata).map(([k, v]) => (
                        <div key={k} className="pt-1 flex items-start justify-between gap-2">
                          <span className="text-muted-foreground shrink-0">
                            {k}
                            :
                          </span>
                          <span className="text-foreground select-all text-right font-medium break-all">{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* MCAP Attachments (if present) */}
        {hasAttachments && (
          <div className="p-4 bg-card border border-border rounded-xl space-y-3 shadow-2xs">
            <h2 className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 text-foreground">
              <Paperclip className="w-3.5 h-3.5 text-primary" />
              <FormattedMessage id="overview.attachments" defaultMessage="Attachments" />
              <span className="text-muted-foreground text-[10px]">
                (
                {fileSummary.attachments?.length}
                )
              </span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {fileSummary.attachments?.map((att, idx) => (
                <div key={`${att.name}-${idx}`} className="p-3 bg-background border border-border/60 rounded-lg flex items-center justify-between gap-3 font-mono text-xs">
                  <div className="min-w-0">
                    <span className="font-semibold text-foreground block truncate select-all">{att.name}</span>
                    <span className="text-[10px] text-muted-foreground block truncate">{att.mediaType}</span>
                  </div>
                  <span className="text-[11px] font-semibold text-primary shrink-0">{formatBytes(att.size)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Main Grid: Channels & Schemas */}
        <div className="grid grid-cols-5 gap-6">
          {/* Left 3/5 Area - Channels definitions */}
          <div className="col-span-3 flex flex-col border border-border bg-card rounded-xl overflow-hidden shadow-2xs">
            <div className="p-3 border-b border-border bg-card flex flex-col gap-2">
              <h2 className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 shrink-0">
                <Radio className="w-3.5 h-3.5 text-primary" />
                <FormattedMessage id="overview.channelDefinitions" defaultMessage="Channel Definitions & Metadata" />
                <span className="text-muted-foreground text-[10px] font-mono">
                  (
                  {filteredChannels.length}
                  /
                  {fileSummary.channels.length}
                  )
                </span>
              </h2>
              {/* Channel Search Input */}
              <div className="relative w-full">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground z-10 pointer-events-none" />
                <Input
                  type="text"
                  value={channelSearch}
                  onChange={e => setChannelSearch(e.target.value)}
                  placeholder={intl.formatMessage({
                    id: 'overview.searchChannels',
                    defaultMessage: 'Filter channels by topic or schema...',
                  })}
                  className="pl-8"
                />
              </div>
            </div>

            <ScrollArea className="max-h-125">
              <div className="divide-y divide-border/60 p-3">
                {filteredChannels.length === 0
                  ? (
                      <div className="text-center py-10 text-muted-foreground text-xs font-mono">
                        <FormattedMessage id="overview.noChannels" defaultMessage="No channels found matching filter." />
                      </div>
                    )
                  : (
                      filteredChannels.map(ch => (
                        <div key={ch.id} className="py-2.5 first:pt-0 last:pb-0 space-y-1.5 font-mono text-[11px]">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <span className="font-semibold text-foreground text-[11px] select-all">{ch.topic}</span>
                              <div className="text-[10px] text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                <span>
                                  Schema:
                                  {' '}
                                  <span className="text-foreground">{ch.schemaName || 'None'}</span>
                                  {' '}
                                  (
                                  <FormattedMessage id="overview.schemaId" defaultMessage="Schema ID:" />
                                  {' '}
                                  {ch.schemaId}
                                  )
                                </span>
                                {ch.messageEncoding && (
                                  <>
                                    <span className="text-border">|</span>
                                    <span>
                                      <FormattedMessage id="overview.messageEncoding" defaultMessage="Message Encoding:" />
                                      {' '}
                                      <span className="text-foreground">{ch.messageEncoding}</span>
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="text-foreground font-bold">
                                {ch.messageCount.toLocaleString()}
                                {' '}
                                msg
                              </div>
                              <div className="text-[9px] text-muted-foreground">
                                Ch ID:
                                {ch.id}
                              </div>
                            </div>
                          </div>

                          {/* Channel Metadata if present */}
                          {ch.metadata && Object.keys(ch.metadata).length > 0 && (
                            <div className="mt-1">
                              <details className="group">
                                <summary className="text-[9px] text-primary cursor-pointer select-none hover:underline flex items-center gap-1">
                                  <span className="group-open:rotate-90 transition-transform inline-block">▸</span>
                                  <FormattedMessage id="overview.viewChannelMetadata" defaultMessage="View channel metadata" />
                                  <span className="text-muted-foreground text-[9px]">
                                    (
                                    {Object.keys(ch.metadata).length}
                                    )
                                  </span>
                                </summary>
                                <div className="mt-1.5 p-2.5 bg-background border border-border/60 rounded-lg text-[10px] space-y-1 font-mono">
                                  <div className="space-y-1 divide-y divide-border/40 text-muted-foreground">
                                    {Object.entries(ch.metadata).map(([mk, mv]) => (
                                      <div key={mk} className="pt-1 first:pt-0 flex items-start justify-between gap-3">
                                        <span className="shrink-0 font-medium">
                                          {mk}
                                          :
                                        </span>
                                        <span className="text-foreground select-all font-semibold text-right break-all">{mv}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </details>
                            </div>
                          )}
                        </div>
                      ))
                    )}
              </div>
            </ScrollArea>
          </div>

          {/* Right 2/5 Area - Schemas list */}
          <div className="col-span-2 flex flex-col border border-border bg-card rounded-xl overflow-hidden shadow-2xs">
            <div className="p-3 border-b border-border bg-card flex flex-col gap-2">
              <h2 className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 shrink-0">
                <Code2 className="w-3.5 h-3.5 text-primary" />
                <FormattedMessage id="overview.schemas" defaultMessage="Schemas" />
                <span className="text-muted-foreground text-[10px] font-mono">
                  (
                  {filteredSchemas.length}
                  /
                  {fileSummary.schemas.length}
                  )
                </span>
              </h2>
              {/* Schema Search Input */}
              <div className="relative w-full">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground z-10 pointer-events-none" />
                <Input
                  type="text"
                  value={schemaSearch}
                  onChange={e => setSchemaSearch(e.target.value)}
                  placeholder={intl.formatMessage({
                    id: 'overview.searchSchemas',
                    defaultMessage: 'Filter schemas by name or encoding...',
                  })}
                  className="pl-8"
                />
              </div>
            </div>

            <ScrollArea className="max-h-125">
              <div className="p-3 space-y-3">
                {filteredSchemas.length === 0
                  ? (
                      <div className="text-center py-12 text-muted-foreground text-xs font-mono">
                        <FormattedMessage id="overview.noSchemas" defaultMessage="No schema records defined in this file." />
                      </div>
                    )
                  : (
                      filteredSchemas.map(schema => (
                        <div key={schema.id} className="p-3 bg-background border border-border rounded-lg space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <span className="font-semibold text-[11px] text-foreground block truncate select-text" title={schema.name}>
                                {schema.name}
                              </span>
                              <span className="text-[9px] text-muted-foreground font-mono mt-0.5 block truncate select-text">
                                <FormattedMessage id="overview.encoding" defaultMessage="Encoding:" />
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
                                  <FormattedMessage id="overview.viewDefinition" defaultMessage="View definition text" />
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
    </ScrollArea>
  )
}
