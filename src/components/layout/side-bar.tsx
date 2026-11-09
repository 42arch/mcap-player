import type { TopicTreeNode } from './topic-tree'
import type { McapChannel } from '@/stores/use-player-store'
import { ChevronDown, ChevronRight, Code2, FolderTree, Info, List, Radio, Search, SlidersHorizontal, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { FormattedMessage, useIntl } from 'react-intl'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { usePanelStore } from '@/stores/use-panel-store'
import { usePlayerStore } from '@/stores/use-player-store'
import PanelSettingsHost from './panel-settings-host'
import { buildTopicTree } from './topic-tree'

interface TopicListProps {
  channels: readonly McapChannel[]
  selectedTopic: string | null
  onSelectTopic: (topic: string) => void
}

function TopicList({ channels, selectedTopic, onSelectTopic }: TopicListProps) {
  if (channels.length === 0) {
    return (
      <div className="text-center text-[10px] py-6 text-muted-foreground">
        <FormattedMessage id="sidebar.noMatchingChannels" defaultMessage="No matching channels found." />
      </div>
    )
  }

  return (
    <div className="p-2 space-y-1">
      {channels.map((ch) => {
        const isSelected = selectedTopic === ch.topic
        return (
          <div
            key={ch.id}
            onClick={() => onSelectTopic(ch.topic)}
            className={`group flex items-start p-2 rounded-md transition-all cursor-pointer border ${
              isSelected
                ? 'bg-accent/80 border-border/60 text-accent-foreground'
                : 'hover:bg-accent hover:text-accent-foreground border-transparent hover:border-border/30'
            }`}
          >
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="flex items-center justify-between gap-2 min-w-0">
                <span
                  className="font-mono text-[10px] text-foreground font-semibold truncate select-text min-w-0"
                  title={ch.topic}
                >
                  {ch.topic}
                </span>
                <span className="shrink-0 inline-flex items-center justify-center bg-secondary/80 text-secondary-foreground text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold">
                  {ch.messageCount}
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-1 text-[10px] text-muted-foreground group-hover:text-accent-foreground/75">
                <Code2 className="w-3 h-3 opacity-60" />
                <span className="truncate select-text" title={ch.schemaName}>
                  {ch.schemaName || <FormattedMessage id="sidebar.noSchema" defaultMessage="No Schema" />}
                </span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function collectAllFolderIds(nodes: readonly TopicTreeNode[]): string[] {
  const ids: string[] = []
  for (const node of nodes) {
    if (node.children.length > 0) {
      ids.push(node.id)
      ids.push(...collectAllFolderIds(node.children))
    }
  }
  return ids
}

interface TreeNodeItemProps {
  node: TopicTreeNode
  selectedTopic: string | null
  onSelectTopic: (topic: string) => void
  expandedNodes: Set<string>
  onToggleExpand: (id: string) => void
}

function TreeNodeItem({
  node,
  selectedTopic,
  onSelectTopic,
  expandedNodes,
  onToggleExpand,
}: TreeNodeItemProps) {
  const hasChildren = node.children.length > 0
  const isExpanded = expandedNodes.has(node.id)
  const isSelected = Boolean(node.channel && selectedTopic === node.channel.topic)
  const isChannel = Boolean(node.channel)

  return (
    <div className="flex flex-col select-none">
      <div
        className={`group flex items-center gap-1.5 px-2 py-1.5 rounded-md transition-all cursor-pointer border text-xs ${
          isSelected
            ? 'bg-accent/80 border-border/60 text-accent-foreground'
            : 'hover:bg-accent hover:text-accent-foreground border-transparent hover:border-border/30'
        }`}
        onClick={() => {
          if (isChannel && node.channel) {
            onSelectTopic(node.channel.topic)
          }
          else if (hasChildren) {
            onToggleExpand(node.id)
          }
        }}
      >
        {/* Toggle Expand Icon for Folders */}
        {hasChildren && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onToggleExpand(node.id)
            }}
            className="w-3.5 h-3.5 flex items-center justify-center rounded hover:bg-accent/60 text-muted-foreground hover:text-foreground shrink-0 cursor-pointer"
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded
              ? <ChevronDown className="w-3.5 h-3.5" />
              : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        )}

        {/* Node Body */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-center justify-between gap-1.5 min-w-0">
            <span
              className={`font-mono text-[10px] truncate ${
                isChannel ? 'font-semibold text-foreground' : 'font-medium text-foreground/90'
              }`}
              title={node.fullTopic || node.name}
            >
              {node.name}
            </span>

            {/* Counts Badge */}
            {isChannel && node.channel
              ? (
                  <span className="shrink-0 inline-flex items-center justify-center bg-secondary/80 text-secondary-foreground text-[9px] px-1.5 py-0.5 rounded-full font-mono font-bold">
                    {node.channel.messageCount}
                  </span>
                )
              : hasChildren
                ? (
                    <span className="shrink-0 inline-flex items-center justify-center text-muted-foreground text-[9px] px-1 font-mono opacity-60">
                      {node.totalChannelsCount}
                    </span>
                  )
                : null}
          </div>

          {/* Schema info for channel nodes */}
          {isChannel && node.channel && (
            <div className="flex items-center gap-1.5 mt-1 text-[10px] text-muted-foreground group-hover:text-accent-foreground/75">
              <Code2 className="w-3 h-3 opacity-60 shrink-0" />
              <span className="truncate select-text" title={node.channel.schemaName}>
                {node.channel.schemaName || 'No Schema'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Children list with comfortable indent and guide line */}
      {hasChildren && isExpanded && (
        <div className="flex flex-col relative border-l border-border/40 ml-2.5 pl-2 space-y-1 mt-0.5">
          {node.children.map(child => (
            <TreeNodeItem
              key={child.id}
              node={child}
              selectedTopic={selectedTopic}
              onSelectTopic={onSelectTopic}
              expandedNodes={expandedNodes}
              onToggleExpand={onToggleExpand}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface TopicTreeViewProps {
  channels: readonly McapChannel[]
  selectedTopic: string | null
  onSelectTopic: (topic: string) => void
  searchQuery?: string
}

function TopicTreeView({
  channels,
  selectedTopic,
  onSelectTopic,
  searchQuery = '',
}: TopicTreeViewProps) {
  const tree = useMemo(() => buildTopicTree(channels), [channels])
  const allFolderIds = useMemo(() => collectAllFolderIds(tree), [tree])
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => new Set(allFolderIds))

  useEffect(() => {
    if (searchQuery.trim()) {
      setExpandedNodes(new Set(allFolderIds))
    }
  }, [searchQuery, allFolderIds])

  const handleToggleExpand = (id: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      }
      else {
        next.add(id)
      }
      return next
    })
  }

  if (tree.length === 0) {
    return (
      <div className="text-center text-[10px] py-6 text-muted-foreground">
        <FormattedMessage id="sidebar.noMatchingChannels" defaultMessage="No matching channels found." />
      </div>
    )
  }

  return (
    <div className="p-2 space-y-1">
      {tree.map(node => (
        <TreeNodeItem
          key={node.id}
          node={node}
          selectedTopic={selectedTopic}
          onSelectTopic={onSelectTopic}
          expandedNodes={expandedNodes}
          onToggleExpand={handleToggleExpand}
        />
      ))}
    </div>
  )
}

export default function SideBar() {
  const intl = useIntl()
  const fileSummary = usePlayerStore(state => state.fileSummary)
  const selectedTopic = usePlayerStore(state => state.selectedTopic)
  const setSelectedTopic = usePlayerStore(state => state.setSelectedTopic)
  const activeTab = usePanelStore(state => state.sidebarTab)
  const setActiveTab = usePanelStore(state => state.setSidebarTab)
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'list' | 'tree'>('list')

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
        {/* Search Header & Mode Toggle */}
        <div className="p-3 border-b border-border shrink-0">
          <div className="flex items-center gap-1.5">
            {/* List / Tree Mode Toggle */}
            <div className="flex items-center rounded-md border border-input p-0.5 bg-muted/40 shrink-0 h-7">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setViewMode('list')}
                    className={`h-6 w-6 flex items-center justify-center rounded-xs transition-colors cursor-pointer ${
                      viewMode === 'list'
                        ? 'bg-background text-foreground shadow-xs font-semibold'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    aria-label={intl.formatMessage({ id: 'sidebar.viewModeList', defaultMessage: 'List view' })}
                  >
                    <List className="w-3 h-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <FormattedMessage id="sidebar.viewModeList" defaultMessage="List view" />
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setViewMode('tree')}
                    className={`h-6 w-6 flex items-center justify-center rounded-xs transition-colors cursor-pointer ${
                      viewMode === 'tree'
                        ? 'bg-background text-foreground shadow-xs font-semibold'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    aria-label={intl.formatMessage({ id: 'sidebar.viewModeTree', defaultMessage: 'Tree view' })}
                  >
                    <FolderTree className="w-3 h-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <FormattedMessage id="sidebar.viewModeTree" defaultMessage="Tree view" />
                </TooltipContent>
              </Tooltip>
            </div>

            {/* Search Input */}
            <div className="relative flex-1 min-w-0 flex items-center">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
              <Input
                type="text"
                placeholder={intl.formatMessage({ id: 'sidebar.searchPlaceholder', defaultMessage: 'Filter topics or schemas...' })}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-7.5 text-xs h-7"
              />
            </div>
          </div>
        </div>

        {/* Topic List / Tree */}
        <ScrollArea className="flex-1 min-h-0">
          {viewMode === 'tree'
            ? (
                <TopicTreeView
                  channels={filteredChannels}
                  selectedTopic={selectedTopic}
                  onSelectTopic={setSelectedTopic}
                  searchQuery={searchQuery}
                />
              )
            : (
                <TopicList
                  channels={filteredChannels}
                  selectedTopic={selectedTopic}
                  onSelectTopic={setSelectedTopic}
                />
              )}
        </ScrollArea>

        {/* Selected Channel Details Pane */}
        {selectedChannel && (
          <div className="border-t border-border bg-card/60 p-3 space-y-2 shrink-0 max-h-55 overflow-auto">
            <div className="flex items-center justify-between gap-1.5 font-bold text-[9px] text-muted-foreground uppercase tracking-wide">
              <div className="flex items-center gap-1.5">
                <Info className="w-3 h-3 text-primary" />
                <FormattedMessage id="sidebar.channelDetails" defaultMessage="Channel Details" />
              </div>
              <button
                type="button"
                onClick={() => setSelectedTopic(null)}
                className="p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                title={intl.formatMessage({ id: 'sidebar.deselect', defaultMessage: 'Deselect' })}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="space-y-1.5 font-mono text-[10px]">
              <div className="flex items-start gap-1">
                <span className="text-muted-foreground shrink-0">
                  <FormattedMessage id="sidebar.topic" defaultMessage="Topic:" />
                </span>
                <span className="text-foreground break-all select-all font-semibold">
                  {selectedChannel.topic}
                </span>
              </div>
              <div className="flex items-start gap-1">
                <span className="text-muted-foreground shrink-0">
                  <FormattedMessage id="sidebar.schema" defaultMessage="Schema:" />
                </span>
                <span className="text-foreground break-all select-all">
                  {selectedChannel.schemaName || intl.formatMessage({ id: 'common.none', defaultMessage: 'None' })}
                </span>
              </div>
              {selectedSchema && (
                <>
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground">
                      <FormattedMessage id="sidebar.encoding" defaultMessage="Encoding:" />
                    </span>
                    <span className="text-foreground">{selectedSchema.encoding}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground">
                      <FormattedMessage id="sidebar.schemaId" defaultMessage="Schema ID:" />
                    </span>
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
