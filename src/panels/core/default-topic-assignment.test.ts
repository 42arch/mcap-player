import type { McapChannel, McapFileSummary } from '@/stores/use-player-store'
import { beforeEach, describe, expect, it } from 'vitest'
import { registerBuiltInPanels } from '@/panels/builtins/register-builtins'
import { usePanelStore } from '@/stores/use-panel-store'
import { usePlayerStore } from '@/stores/use-player-store'

registerBuiltInPanels()

function channel(id: number, topic: string, schemaName?: string): McapChannel {
  return {
    id,
    topic,
    schemaId: 1,
    schemaName,
    messageCount: 1,
  }
}

const summary: McapFileSummary = {
  name: 'test.mcap',
  size: 1,
  messageCount: 4,
  channels: [
    channel(1, '/scan', 'sensor_msgs/LaserScan'),
    channel(2, '/cam/front', 'sensor_msgs/CompressedImage'),
    channel(3, '/cam/left', 'sensor_msgs/Image'),
    channel(4, '/imu', 'sensor_msgs/Imu'),
  ],
  schemas: [],
  durationNs: 1n,
  startNs: 0n,
  endNs: 1n,
}

function topicOf(panelId: string): string | null {
  return usePanelStore.getState().panelsById[panelId]?.config.topic as string | null
}

describe('opening image and raw message panels', () => {
  beforeEach(() => {
    usePanelStore.setState({
      panelsById: {},
      panelOrder: [],
      activePanelId: null,
      selectedPanelId: null,
    })
    usePlayerStore.setState({ fileSummary: summary })
  })

  it('selects the first matching channel, then the next unused one', () => {
    const firstImage = usePanelStore.getState().addPanel('image')
    const secondImage = usePanelStore.getState().addPanel('image')
    const firstRaw = usePanelStore.getState().addPanel('messages')
    const secondRaw = usePanelStore.getState().addPanel('messages')

    expect(topicOf(firstImage)).toBe('/cam/front')
    expect(topicOf(secondImage)).toBe('/cam/left')
    expect(topicOf(firstRaw)).toBe('/scan')
    expect(topicOf(secondRaw)).toBe('/cam/front')
  })

  it('reuses a channel after the earlier panel switches away from it', () => {
    const firstImage = usePanelStore.getState().addPanel('image')
    usePanelStore.getState().updatePanelConfig(firstImage, { topic: '/cam/left' })
    const secondImage = usePanelStore.getState().addPanel('image')

    expect(topicOf(secondImage)).toBe('/cam/front')
  })

  it('keeps an explicit topic and fills panels once a file is loaded', () => {
    usePlayerStore.setState({ fileSummary: null })
    const preset = usePanelStore.getState().addPanel('image', { topic: '/cam/left' })
    const waiting = usePanelStore.getState().addPanel('image')

    expect(topicOf(preset)).toBe('/cam/left')
    expect(topicOf(waiting)).toBeNull()

    usePlayerStore.getState().setFileSummary(summary)

    expect(topicOf(preset)).toBe('/cam/left')
    expect(topicOf(waiting)).toBe('/cam/front')
  })

  it('assigns loaded panels that do not yet have a topic', () => {
    usePanelStore.getState().loadPanelsState({
      'image-a': {
        id: 'image-a',
        type: 'image',
        configVersion: 1,
        config: { topic: null, imageFit: 'contain', brightness: 1 },
      },
      'image-b': {
        id: 'image-b',
        type: 'image',
        configVersion: 1,
        config: { topic: '/cam/left', imageFit: 'contain', brightness: 1 },
      },
      'messages-a': {
        id: 'messages-a',
        type: 'messages',
        configVersion: 1,
        config: { topic: null, refreshRateHz: 15, binaryFormat: 'placeholder' },
      },
    }, ['image-a', 'image-b', 'messages-a'])

    expect(topicOf('image-a')).toBe('/cam/front')
    expect(topicOf('image-b')).toBe('/cam/left')
    expect(topicOf('messages-a')).toBe('/scan')
  })
})
