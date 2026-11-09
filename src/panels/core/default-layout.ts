import type { McapChannel } from '@/stores/use-player-store'
import { isSelectableImageChannel } from './default-topic'

export interface InitialPanelSpec {
  type: string
  initialConfig?: Record<string, unknown>
}

export interface GridPositionOption {
  referencePanel: string
  direction: 'right' | 'below'
}

/**
 * Plans initial panels when an MCAP file is opened:
 * - If image channels exist, creates up to 6 ImagePanels with corresponding topics.
 * - Otherwise, falls back to a single Raw Message panel.
 */
export function planInitialPanels(channels: readonly McapChannel[]): InitialPanelSpec[] {
  const imageChannels = channels.filter(isSelectableImageChannel)
  const imageTopics = Array.from(
    new Set(
      imageChannels
        .map(c => c.topic)
        .filter((topic): topic is string => Boolean(topic && topic.trim())),
    ),
  ).slice(0, 6)

  if (imageTopics.length > 0) {
    return imageTopics.map(topic => ({
      type: 'image',
      initialConfig: { topic },
    }))
  }

  return [{ type: 'messages' }]
}

/**
 * Computes grid placement options for Dockview panels so that 1-6 panels
 * tile neatly in a 1x1, 1x2, 2x2, or 2x3 grid rather than stacking in tabs.
 */
export function computeGridPosition(
  index: number,
  totalCount: number,
  panelIds: readonly string[],
): GridPositionOption | undefined {
  if (index <= 0 || totalCount <= 1) {
    return undefined
  }

  const cols = totalCount <= 4 ? 2 : 3
  const row = Math.floor(index / cols)

  if (row === 0) {
    return {
      referencePanel: panelIds[index - 1],
      direction: 'right',
    }
  }

  return {
    referencePanel: panelIds[index - cols],
    direction: 'below',
  }
}

