import type { PanelConfig } from '@/panels/core/types'
import { usePanelStore } from '@/stores/use-panel-store'
import { usePlayerStore } from '@/stores/use-player-store'
import { isSelectableImageChannel, planDefaultTopics } from './default-topic'

const AUTO_TOPIC_PANEL_TYPES = ['image', 'messages'] as const

function readTopic(config: PanelConfig | undefined): string | null {
  const topic = config?.topic
  return typeof topic === 'string' && topic ? topic : null
}

export function assignDefaultPanelTopics() {
  const channels = usePlayerStore.getState().fileSummary?.channels ?? []
  const { panelsById, panelOrder, updatePanelConfig } = usePanelStore.getState()

  for (const type of AUTO_TOPIC_PANEL_TYPES) {
    const candidates = (type === 'image' ? channels.filter(isSelectableImageChannel) : channels)
      .map(channel => channel.topic)
    const panels = panelOrder.flatMap((id) => {
      const panel = panelsById[id]
      if (!panel || panel.type !== type) {
        return []
      }
      return [{ id, topic: readTopic(panel.config) }]
    })

    for (const assignment of planDefaultTopics(panels, candidates)) {
      updatePanelConfig(assignment.id, { topic: assignment.topic })
    }
  }
}
