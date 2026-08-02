interface TopicMessage {
  topic: string
}

type DeliveryMode = 'all' | 'latest'

/**
 * Preserves `latest` delivery semantics across bounded worker continuations.
 * Stateful/all-mode messages are emitted immediately, while latest-mode topics
 * are held until the complete requested time range has been consumed.
 */
export class PlaybackBatchAccumulator<T extends TopicMessage> {
  private readonly pendingLatest = new Map<string, T>()

  consume(
    messages: readonly T[],
    modeByTopic: Readonly<Record<string, DeliveryMode>>,
    isFinalBatch: boolean,
  ): T[] {
    const ready: T[] = []
    for (const message of messages) {
      if (modeByTopic[message.topic] === 'latest') {
        this.pendingLatest.set(message.topic, message)
      }
      else {
        ready.push(message)
      }
    }

    if (isFinalBatch) {
      ready.push(...this.pendingLatest.values())
      this.pendingLatest.clear()
    }
    return ready
  }

  clear(): void {
    this.pendingLatest.clear()
  }
}
