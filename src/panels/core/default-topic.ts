export interface TopicPanelSnapshot {
  id: string
  topic: string | null
}

export interface TopicAssignment {
  id: string
  topic: string
}

export function isSelectableImageChannel(channel: { schemaName?: string }): boolean {
  if (!channel.schemaName) {
    return false
  }
  const schemaName = channel.schemaName.toLowerCase()
  const excluded = ['annotation', 'calibration', 'camerainfo', 'camera_info']
  if (excluded.some(part => schemaName.includes(part))) {
    return false
  }
  return schemaName.includes('image') || schemaName.includes('video') || schemaName.includes('compressed')
}

function uniqueTopics(topics: readonly string[]): string[] {
  const seen = new Set<string>()
  const unique: string[] = []
  for (const topic of topics) {
    if (!topic || seen.has(topic)) {
      continue
    }
    seen.add(topic)
    unique.push(topic)
  }
  return unique
}

/**
 * Fill panels that have no usable topic.
 * A channel stays reserved while another panel in the list is still showing it.
 * When every channel is already shown, later panels reuse the first channel.
 */
export function planDefaultTopics(
  panels: readonly TopicPanelSnapshot[],
  topics: readonly string[],
): TopicAssignment[] {
  const candidates = uniqueTopics(topics)
  if (candidates.length === 0) {
    return []
  }

  const candidateSet = new Set(candidates)
  const occupied = new Set<string>()
  const pending: string[] = []

  for (const panel of panels) {
    if (panel.topic && candidateSet.has(panel.topic)) {
      occupied.add(panel.topic)
    }
    else {
      pending.push(panel.id)
    }
  }

  const assignments: TopicAssignment[] = []
  for (const id of pending) {
    const topic = candidates.find(candidate => !occupied.has(candidate)) ?? candidates[0]
    assignments.push({ id, topic })
    occupied.add(topic)
  }
  return assignments
}
