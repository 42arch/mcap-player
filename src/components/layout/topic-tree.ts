import type { McapChannel } from '@/stores/use-player-store'

export interface TopicTreeNode {
  id: string
  name: string
  fullTopic?: string
  channel?: McapChannel
  children: TopicTreeNode[]
  totalMessageCount: number
  totalChannelsCount: number
}

interface MutableNode {
  id: string
  name: string
  fullTopic?: string
  channel?: McapChannel
  children: Map<string, MutableNode>
}

/**
 * Builds a hierarchical tree from a flat list of MCAP channels
 * based on slash ('/') delimiters in topic names.
 */
export function buildTopicTree(channels: readonly McapChannel[]): TopicTreeNode[] {
  const rootChildren = new Map<string, MutableNode>()

  for (const ch of channels) {
    const rawTopic = ch.topic.trim()
    const segments = rawTopic
      .split('/')
      .map(s => s.trim())
      .filter(Boolean)

    const actualSegments = segments.length > 0 ? segments : [rawTopic || '/']

    let currentMap = rootChildren
    let accumulatedPath = ''

    for (let i = 0; i < actualSegments.length; i++) {
      const seg = actualSegments[i]
      accumulatedPath = accumulatedPath ? `${accumulatedPath}/${seg}` : seg
      const isLeaf = i === actualSegments.length - 1

      let node = currentMap.get(seg)
      if (!node) {
        node = {
          id: accumulatedPath,
          name: seg,
          children: new Map(),
        }
        currentMap.set(seg, node)
      }

      if (isLeaf) {
        node.channel = ch
        node.fullTopic = ch.topic
      }

      currentMap = node.children
    }
  }

  function finalizeNode(raw: MutableNode): TopicTreeNode {
    const childrenList: TopicTreeNode[] = []
    let childMessageCount = 0
    let childChannelsCount = 0

    for (const child of raw.children.values()) {
      const finalizedChild = finalizeNode(child)
      childrenList.push(finalizedChild)
      childMessageCount += finalizedChild.totalMessageCount
      childChannelsCount += finalizedChild.totalChannelsCount
    }

    childrenList.sort((a, b) => {
      const aIsFolder = a.children.length > 0
      const bIsFolder = b.children.length > 0
      if (aIsFolder !== bIsFolder) {
        return aIsFolder ? -1 : 1
      }
      return a.name.localeCompare(b.name)
    })

    const ownMessageCount = raw.channel ? raw.channel.messageCount : 0
    const ownChannelsCount = raw.channel ? 1 : 0

    return {
      id: raw.id,
      name: raw.name,
      fullTopic: raw.fullTopic,
      channel: raw.channel,
      children: childrenList,
      totalMessageCount: ownMessageCount + childMessageCount,
      totalChannelsCount: ownChannelsCount + childChannelsCount,
    }
  }

  const result: TopicTreeNode[] = []
  for (const raw of rootChildren.values()) {
    result.push(finalizeNode(raw))
  }

  result.sort((a, b) => {
    const aIsFolder = a.children.length > 0
    const bIsFolder = b.children.length > 0
    if (aIsFolder !== bIsFolder) {
      return aIsFolder ? -1 : 1
    }
    return a.name.localeCompare(b.name)
  })

  return result
}

