import type { PanelSettingsProps, TimelinePanelConfig } from '@/panels/core/types'
import { Eye, EyeClosed } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { FormattedMessage, useIntl } from 'react-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { usePlayerStore } from '@/stores/use-player-store'
import { SettingGroup } from '../setting-group'

interface TopicOption {
  topic: string
  messageCount: number
}

export default function TimelineSetting({
  config,
  updateConfig,
}: PanelSettingsProps<TimelinePanelConfig>) {
  const intl = useIntl()
  const fileSummary = usePlayerStore(state => state.fileSummary)
  const [searchQuery, setSearchQuery] = useState('')
  const fieldId = useId()

  const topicOptions = useMemo(() => {
    const counts = new Map<string, number>()
    for (const channel of fileSummary?.channels ?? []) {
      counts.set(channel.topic, (counts.get(channel.topic) ?? 0) + channel.messageCount)
    }
    return Array.from(counts, ([topic, messageCount]) => ({ topic, messageCount }))
      .sort((a, b) => a.topic.localeCompare(b.topic))
  }, [fileSummary])

  const allTopics = useMemo(
    () => topicOptions.map(option => option.topic),
    [topicOptions],
  )
  const selectedTopics = config.visibleTopics ?? allTopics
  const selectedTopicSet = useMemo(() => new Set(selectedTopics), [selectedTopics])
  const filteredOptions = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()
    if (!normalizedQuery) {
      return topicOptions
    }
    return topicOptions.filter(option => option.topic.toLowerCase().includes(normalizedQuery))
  }, [searchQuery, topicOptions])

  const commitSelection = (topics: string[]) => {
    const nextTopicSet = new Set(topics)
    const orderedTopics = allTopics.filter(topic => nextTopicSet.has(topic))
    updateConfig({
      visibleTopics: orderedTopics.length === allTopics.length ? null : orderedTopics,
    })
  }

  const toggleTopic = (topic: string, checked: boolean) => {
    const nextTopics = new Set(selectedTopics)
    if (checked) {
      nextTopics.add(topic)
    }
    else {
      nextTopics.delete(topic)
    }
    commitSelection(Array.from(nextTopics))
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background text-foreground">
      <div className="flex-1 overflow-y-auto">
        <SettingGroup
          title={intl.formatMessage(
            { id: 'panel.timeline.topicsCount', defaultMessage: 'Timeline Topics ({selected}/{total})' },
            { selected: selectedTopicSet.size, total: allTopics.length },
          )}
          defaultOpen
        >
          <div className="space-y-2.5">
            <div>
              <Input
                id={`${fieldId}-search`}
                value={searchQuery}
                onChange={event => setSearchQuery(event.target.value)}
                placeholder={intl.formatMessage({ id: 'panel.timeline.filterTopics', defaultMessage: 'Filter topics…' })}
              />
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => updateConfig({ visibleTopics: null })}
              >
                <FormattedMessage id="panel.timeline.showAll" defaultMessage="Show all" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => updateConfig({ visibleTopics: [] })}
              >
                <FormattedMessage id="panel.timeline.hideAll" defaultMessage="Hide all" />
              </Button>
            </div>

            <ScrollArea className="h-72 rounded-md border border-border">
              <div className="flex flex-col gap-0.5 p-1">
                {filteredOptions.map((option: TopicOption) => {
                  const isVisible = selectedTopicSet.has(option.topic)
                  return (
                    <div
                      key={option.topic}
                      onClick={() => toggleTopic(option.topic, !isVisible)}
                      className={cn(
                        'flex items-center gap-2 rounded-md px-2 py-1 cursor-pointer transition-colors select-none',
                        isVisible ? 'hover:bg-accent/80' : 'opacity-50 hover:bg-accent/40 bg-muted/20',
                      )}
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleTopic(option.topic, !isVisible)
                        }}
                        className="p-0.5 shrink-0 text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                        title={isVisible
                          ? intl.formatMessage({ id: 'panel.timeline.hideTopic', defaultMessage: 'Hide topic' })
                          : intl.formatMessage({ id: 'panel.timeline.showTopic', defaultMessage: 'Show topic' })}
                      >
                        {isVisible
                          ? (
                              <Eye className="w-3.5 h-3.5 text-primary" />
                            )
                          : (
                              <EyeClosed className="w-3.5 h-3.5 text-muted-foreground/50" />
                            )}
                      </button>
                      <span
                        className={cn('min-w-0 flex-1 truncate font-mono text-[10px]', !isVisible && 'text-muted-foreground')}
                        title={option.topic}
                      >
                        {option.topic}
                      </span>
                      <span className="shrink-0 font-mono text-[9px] text-muted-foreground">
                        {option.messageCount.toLocaleString()}
                      </span>
                    </div>
                  )
                })}
              </div>
            </ScrollArea>
          </div>
        </SettingGroup>
      </div>
    </div>
  )
}
