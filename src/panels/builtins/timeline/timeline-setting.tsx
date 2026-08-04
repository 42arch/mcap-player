import type { PanelSettingsProps, TimelinePanelConfig } from '@/panels/core/types'
import { useId, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Field,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
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
          title={`Timeline Topics (${selectedTopicSet.size}/${allTopics.length})`}
          description="Choose which topic rows are visible. All topics are shown by default."
          defaultOpen
        >
          <div className="space-y-2.5">
            <Field>
              <FieldLabel htmlFor={`${fieldId}-search`} className="sr-only">
                Filter topics
              </FieldLabel>
              <Input
                id={`${fieldId}-search`}
                value={searchQuery}
                onChange={event => setSearchQuery(event.target.value)}
                placeholder="Filter topics…"
              />
            </Field>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => updateConfig({ visibleTopics: null })}
              >
                Select all
              </Button>
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => updateConfig({ visibleTopics: [] })}
              >
                Clear
              </Button>
            </div>

            <ScrollArea className="max-h-80 rounded-md border border-border">
              <FieldGroup data-slot="checkbox-group" className="gap-0 p-1">
                {filteredOptions.map((option: TopicOption) => {
                  const checkboxId = `${fieldId}-${encodeURIComponent(option.topic)}`
                  return (
                    <Field
                      key={option.topic}
                      orientation="horizontal"
                      className="rounded-md px-2 py-1 hover:bg-accent"
                    >
                      <Checkbox
                        id={checkboxId}
                        checked={selectedTopicSet.has(option.topic)}
                        onCheckedChange={checked => toggleTopic(option.topic, checked === true)}
                      />
                      <FieldLabel htmlFor={checkboxId} className="min-w-0 cursor-pointer">
                        <span className="min-w-0 flex-1 truncate font-mono text-[10px]" title={option.topic}>
                          {option.topic}
                        </span>
                        <span className="shrink-0 font-mono text-[9px] text-muted-foreground">
                          {option.messageCount.toLocaleString()}
                        </span>
                      </FieldLabel>
                    </Field>
                  )
                })}
              </FieldGroup>
            </ScrollArea>
          </div>
        </SettingGroup>
      </div>
    </div>
  )
}
