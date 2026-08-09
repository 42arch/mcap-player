import { Code2, Info, Radio, Search, SlidersHorizontal, X } from 'lucide-react'
import { useState } from 'react'
import { FormattedMessage, useIntl } from 'react-intl'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { usePanelStore } from '@/stores/use-panel-store'
import { usePlayerStore } from '@/stores/use-player-store'
import PanelSettingsHost from './panel-settings-host'

export default function SideBar() {
  const intl = useIntl()
  const fileSummary = usePlayerStore(state => state.fileSummary)
  const selectedTopic = usePlayerStore(state => state.selectedTopic)
  const setSelectedTopic = usePlayerStore(state => state.setSelectedTopic)
  const activeTab = usePanelStore(state => state.sidebarTab)
  const setActiveTab = usePanelStore(state => state.setSidebarTab)
  const [searchQuery, setSearchQuery] = useState('')

  if (!fileSummary) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center text-muted-foreground bg-card">
        <Radio className="w-8 h-8 mb-3 text-muted-foreground/30 animate-pulse" />
        <p className="text-xs font-semibold">
          <FormattedMessage id="sidebar.noMcapFile" defaultMessage="No MCAP File Loaded" />
        </p>
        <p className="text-[10px] text-muted-foreground/60 mt-1.5 max-w-46.25 leading-relaxed">
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

  const selectedChannel = fileSummary.channels.find(
    ch => ch.topic === selectedTopic,
  )
  const selectedSchema = selectedChannel
    ? fileSummary.schemas.find(s => s.id === selectedChannel.schemaId)
    : null

  return (
    <Tabs
      value={activeTab}
      onValueChange={value => setActiveTab(value as 'topics' | 'settings')}
      className="w-full h-full flex flex-col gap-0 bg-background text-foreground"
    >
      {/* Switcher Tab Header */}
      <div className="h-8 border-b border-border bg-header shrink-0 flex items-center">
        <TabsList className="h-full p-0 bg-transparent rounded-none justify-start">
          <TabsTrigger
            value="topics"
            className="h-full w-24 rounded-none px-3.5 gap-1.5 text-[11px] font-medium text-muted-foreground border-r border-border/40 hover:bg-tab-hover hover:text-accent-foreground data-[state=active]:bg-background dark:data-[state=active]:bg-background data-[state=active]:text-foreground dark:data-[state=active]:text-foreground transition-colors cursor-pointer"
          >
            <Radio className="w-3.5 h-3.5 opacity-70" />
            <FormattedMessage id="sidebar.topics" defaultMessage="Topics" />
          </TabsTrigger>
          <TabsTrigger
            value="settings"
            className="h-full w-24 rounded-none px-3.5 gap-1.5 text-[11px] font-medium text-muted-foreground border-r border-border/40 hover:bg-tab-hover hover:text-accent-foreground data-[state=active]:bg-background dark:data-[state=active]:bg-background data-[state=active]:text-foreground dark:data-[state=active]:text-foreground transition-colors cursor-pointer"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 opacity-70" />
            <FormattedMessage id="sidebar.settings" defaultMessage="Settings" />
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="topics" className="flex-1 min-h-0 flex flex-col mt-0">
        {/* Search Header */}
        <div className="p-3 border-b border-border space-y-2 shrink-0">
          <div className="relative flex items-center">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <Input
              type="text"
              placeholder={intl.formatMessage({ id: 'sidebar.searchPlaceholder', defaultMessage: 'Filter topics or schemas...' })}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-8 text-xs"
            />
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
                        <div className="flex-1 min-h-0 flex flex-col">
                          <div className="flex items-center justify-between gap-2 min-w-0">
                            <span className="font-mono text-[10px] text-foreground font-semibold truncate select-text min-w-0" title={ch.topic}>
                              {ch.topic}
                            </span>
                            <span className="shrink-0 inline-flex items-center justify-center bg-secondary/80 text-secondary-foreground text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold">
                              {ch.messageCount}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-1 text-[10px] text-muted-foreground group-hover:text-accent-foreground/75">
                            <Code2 className="w-3 h-3 opacity-60" />
                            <span className="truncate select-text" title={ch.schemaName}>
                              {ch.schemaName || 'No Schema'}
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
          <div className="border-t border-border bg-card/60 p-3 space-y-2 shrink-0 max-h-55 overflow-auto">
            <div className="flex items-center justify-between gap-1.5 font-bold text-[9px] text-muted-foreground uppercase tracking-wide">
              <div className="flex items-center gap-1.5">
                <Info className="w-3 h-3 text-primary" />
                Channel Details
              </div>
              <button
                type="button"
                onClick={() => setSelectedTopic(null)}
                className="p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                title="Deselect"
              >
                <X className="w-3.5 h-3.5" />
              </button>
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
                </>
              )}
            </div>
          </div>
        )}
      </TabsContent>

      <TabsContent value="settings" className="flex-1 min-h-0 flex flex-col mt-0">
        <PanelSettingsHost />
      </TabsContent>
    </Tabs>
  )
}
