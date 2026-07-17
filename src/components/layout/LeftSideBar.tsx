import { CheckCircle, Circle, FileText, Info, Radio, Search } from 'lucide-react'
import { useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { usePlayerStore } from '@/stores/usePlayerStore'
import PanelSettings from './PanelSettings'

export default function LeftSideBar() {
  const {
    fileSummary,
    subscribedTopics,
    selectedTopic,
    toggleTopicSubscription,
    setSelectedTopic,
    setSubscribedTopics,
  } = usePlayerStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'topics' | 'settings'>('topics')

  if (!fileSummary) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center text-muted-foreground bg-card">
        <Radio className="w-8 h-8 mb-3 text-muted-foreground/30 animate-pulse" />
        <p className="text-xs font-semibold">No MCAP File Loaded</p>
        <p className="text-[10px] text-muted-foreground/60 mt-1.5 max-w-[185px] leading-relaxed">
          Select
          {' '}
          <strong>File &gt; Open File...</strong>
          {' '}
          to load and parse an MCAP file.
        </p>
      </div>
    )
  }

  const filteredChannels = fileSummary.channels.filter(
    ch =>
      ch.topic.toLowerCase().includes(searchQuery.toLowerCase())
      || (ch.schemaName
        && ch.schemaName.toLowerCase().includes(searchQuery.toLowerCase())),
  )

  const handleDeselectAll = () => {
    setSubscribedTopics(new Set())
  }

  const selectedChannel = fileSummary.channels.find(
    ch => ch.topic === selectedTopic,
  )
  const selectedSchema = selectedChannel
    ? fileSummary.schemas.find(s => s.id === selectedChannel.schemaId)
    : null

  return (
    <div className="w-full h-full flex flex-col bg-card text-foreground">
      {/* Switcher Tab Header */}
      <div className="flex border-b border-border bg-muted/30 p-1 shrink-0">
        <button
          onClick={() => setActiveTab('topics')}
          className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all cursor-pointer text-center ${
            activeTab === 'topics'
              ? 'bg-background text-foreground shadow-xs border border-border/50'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Topics
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all cursor-pointer text-center ${
            activeTab === 'settings'
              ? 'bg-background text-foreground shadow-xs border border-border/50'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Settings
        </button>
      </div>

      {activeTab === 'topics'
        ? (
            <div className="flex-1 min-h-0 flex flex-col">
              {/* Search Header */}
              <div className="p-3 border-b border-border space-y-2 shrink-0">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <Radio className="w-3.5 h-3.5 text-primary" />
                    Channels (
                    {fileSummary.channels.length}
                    )
                  </span>
                </div>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 w-3 h-3 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Filter topics..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-[11px] bg-background border border-border rounded-md placeholder-muted-foreground/70 focus:outline-hidden focus:ring-1 focus:ring-ring transition-all"
                  />
                </div>
                {/* Bulk select actions */}
                <div className="flex items-center gap-2 pt-1 text-[10px]">
                  <button
                    onClick={handleDeselectAll}
                    className="text-primary hover:underline cursor-pointer"
                  >
                    Clear Selection
                  </button>
                </div>
              </div>

              {/* Topic List */}
              <ScrollArea className="flex-1 min-h-0">
                <div className="p-2 space-y-1">
                  {filteredChannels.length === 0
                    ? (
                        <div className="text-center text-[10px] py-6 text-muted-foreground">
                          No matching channels found.
                        </div>
                      )
                    : (
                        filteredChannels.map((ch) => {
                          const isSubscribed = subscribedTopics.has(ch.topic)
                          const isSelected = selectedTopic === ch.topic
                          return (
                            <div
                              key={ch.id}
                              onClick={() => setSelectedTopic(ch.topic)}
                              className={`group flex items-start p-2 rounded-md transition-all cursor-pointer border ${
                                isSelected
                                  ? 'bg-accent/80 border-border/60 text-accent-foreground'
                                  : 'hover:bg-accent hover:text-accent-foreground border-transparent hover:border-border/30'
                              }`}
                            >
                              {/* Subscription Radio */}
                              <div
                                onClick={(e) => {
                                  e.stopPropagation()
                                  toggleTopicSubscription(ch.topic)
                                }}
                                className="p-0.5 hover:bg-muted rounded-full cursor-pointer mr-2 shrink-0 text-muted-foreground hover:text-primary transition-colors mt-0.5"
                                title={isSubscribed ? 'Selected' : 'Select'}
                              >
                                {isSubscribed
                                  ? (
                                      <CheckCircle className="w-3.5 h-3.5 text-primary" />
                                    )
                                  : (
                                      <Circle className="w-3.5 h-3.5 opacity-60" />
                                    )}
                              </div>

                              <div className="flex-1 min-h-0 flex flex-col">
                                <div className="flex items-start justify-between gap-2">
                                  <span className="font-mono text-[11px] text-foreground font-semibold break-all select-text leading-tight">
                                    {ch.topic}
                                  </span>
                                  <span className="shrink-0 inline-flex items-center justify-center bg-secondary/80 text-secondary-foreground text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold">
                                    {ch.messageCount}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 mt-1 text-[10px] text-muted-foreground group-hover:text-accent-foreground/75">
                                  <FileText className="w-3 h-3 opacity-60" />
                                  <span className="truncate select-text" title={ch.schemaName}>
                                    {ch.schemaName || 'No Schema'}
                                  </span>
                                  <span className="opacity-40 font-mono shrink-0">
                                    • ID
                                    {ch.id}
                                  </span>
                                </div>
                              </div>
                            </div>
                          )
                        })
                      )}
                </div>
              </ScrollArea>

              {/* Selected Channel Details Pane */}
              {selectedChannel && (
                <div className="border-t border-border bg-card/60 p-3 space-y-2 shrink-0 max-h-[220px] overflow-auto">
                  <div className="flex items-center gap-1.5 font-bold text-[9px] text-muted-foreground uppercase tracking-wide">
                    <Info className="w-3 h-3 text-primary" />
                    Channel Details
                  </div>
                  <div className="space-y-1.5 font-mono text-[10px]">
                    <div className="flex items-start gap-1">
                      <span className="text-muted-foreground shrink-0">Topic:</span>
                      <span className="text-foreground break-all select-all font-semibold">
                        {selectedChannel.topic}
                      </span>
                    </div>
                    <div className="flex items-start gap-1">
                      <span className="text-muted-foreground shrink-0">Schema:</span>
                      <span className="text-foreground break-all select-all">
                        {selectedChannel.schemaName || 'None'}
                      </span>
                    </div>
                    {selectedSchema && (
                      <>
                        <div className="flex items-center gap-1">
                          <span className="text-muted-foreground">Encoding:</span>
                          <span className="text-foreground">{selectedSchema.encoding}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-muted-foreground">Schema ID:</span>
                          <span className="text-foreground">{selectedSchema.id}</span>
                        </div>
                        {selectedSchema.dataText && (
                          <div className="mt-1 space-y-1">
                            <div className="text-muted-foreground text-[9px]">Schema Definition:</div>
                            <pre className="p-1.5 bg-background/80 border border-border/80 rounded-xs max-h-[85px] overflow-auto text-[9px] whitespace-pre-wrap break-all leading-tight text-muted-foreground font-mono select-all">
                              {selectedSchema.dataText}
                            </pre>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        : (
            <PanelSettings />
          )}
    </div>
  )
}
