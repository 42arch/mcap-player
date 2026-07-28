export type DeliveryMode = 'all' | 'latest'

export interface PlaybackMessage {
  topic: string
  channelId: number
  logTime: bigint
  publishTime: bigint
  sequence: number
  dataLength: number
  payload: unknown
  sceneSnapshot?: boolean
  transformSnapshot?: boolean
}

export interface TopicSubscription {
  topic: string
  mode: DeliveryMode
}

export interface PanelSubscriptionOptions {
  panelId: string
  subscriptionId: string
  topics: TopicSubscription[]
}

interface SubscriptionRecord extends PanelSubscriptionOptions {
  listener: (message: PlaybackMessage) => void
  pendingLatest: Map<string, PlaybackMessage>
  frameId: number | null
}

export interface QueryPlan {
  topics: string[]
  modeByTopic: Record<string, DeliveryMode>
}

export class MessagePipeline {
  private subscriptions = new Map<string, SubscriptionRecord>()
  private changeListeners = new Set<(panelId: string) => void>()
  private seekListeners = new Map<string, Set<(timeNs: bigint) => void>>()
  private seekCompleteListeners = new Map<string, Set<(timeNs: bigint) => void>>()

  subscribe(options: PanelSubscriptionOptions, listener: (message: PlaybackMessage) => void): () => void {
    const key = `${options.panelId}:${options.subscriptionId}`
    const record: SubscriptionRecord = {
      ...options,
      topics: options.topics.filter(subscription => Boolean(subscription.topic)),
      listener,
      pendingLatest: new Map(),
      frameId: null,
    }
    this.disposeSubscription(key)
    this.subscriptions.set(key, record)
    this.notifySubscriptionChange(options.panelId)

    return () => {
      if (this.subscriptions.get(key) === record) {
        this.disposeSubscription(key)
        this.notifySubscriptionChange(options.panelId)
      }
    }
  }

  subscribeSeek(panelId: string, listener: (timeNs: bigint) => void): () => void {
    let listeners = this.seekListeners.get(panelId)
    if (!listeners) {
      listeners = new Set()
      this.seekListeners.set(panelId, listeners)
    }
    listeners.add(listener)
    return () => {
      const current = this.seekListeners.get(panelId)
      current?.delete(listener)
      if (current?.size === 0) {
        this.seekListeners.delete(panelId)
      }
    }
  }

  subscribeSeekComplete(panelId: string, listener: (timeNs: bigint) => void): () => void {
    let listeners = this.seekCompleteListeners.get(panelId)
    if (!listeners) {
      listeners = new Set()
      this.seekCompleteListeners.set(panelId, listeners)
    }
    listeners.add(listener)
    return () => {
      const current = this.seekCompleteListeners.get(panelId)
      current?.delete(listener)
      if (current?.size === 0) {
        this.seekCompleteListeners.delete(panelId)
      }
    }
  }

  clearPanel(panelId: string) {
    let changed = false
    for (const [key, subscription] of this.subscriptions) {
      if (subscription.panelId === panelId) {
        this.disposeSubscription(key)
        changed = true
      }
    }
    this.seekListeners.delete(panelId)
    this.seekCompleteListeners.delete(panelId)
    if (changed) {
      this.notifySubscriptionChange(panelId)
    }
  }

  dispatch(messages: readonly PlaybackMessage[]) {
    this.dispatchMatching(messages)
  }

  dispatchToPanel(panelId: string, messages: readonly PlaybackMessage[]) {
    this.dispatchMatching(messages, panelId)
  }

  dispatchSeekResult(messages: readonly PlaybackMessage[]) {
    this.dispatchMatching(messages)
    for (const subscription of this.subscriptions.values()) {
      this.flushLatest(subscription)
    }
  }

  emitSeek(timeNs: bigint) {
    for (const subscription of this.subscriptions.values()) {
      if (subscription.frameId !== null) {
        cancelAnimationFrame(subscription.frameId)
        subscription.frameId = null
      }
      subscription.pendingLatest.clear()
    }
    for (const listeners of this.seekListeners.values()) {
      listeners.forEach(listener => listener(timeNs))
    }
  }

  emitSeekComplete(timeNs: bigint) {
    for (const listeners of this.seekCompleteListeners.values()) {
      listeners.forEach(listener => listener(timeNs))
    }
  }

  getQueryPlan(): QueryPlan {
    const modeByTopic: Record<string, DeliveryMode> = {}
    for (const subscription of this.subscriptions.values()) {
      for (const topic of subscription.topics) {
        if (topic.mode === 'all' || modeByTopic[topic.topic] === undefined) {
          modeByTopic[topic.topic] = topic.mode
        }
      }
    }
    return { topics: Object.keys(modeByTopic).sort(), modeByTopic }
  }

  onSubscriptionsChanged(listener: (panelId: string) => void): () => void {
    this.changeListeners.add(listener)
    return () => this.changeListeners.delete(listener)
  }

  private dispatchMatching(messages: readonly PlaybackMessage[], panelId?: string) {
    for (const message of messages) {
      for (const subscription of this.subscriptions.values()) {
        if (panelId && subscription.panelId !== panelId) {
          continue
        }
        const interest = subscription.topics.find(topic => topic.topic === message.topic)
        if (!interest) {
          continue
        }
        if (interest.mode === 'all') {
          subscription.listener(message)
        }
        else {
          subscription.pendingLatest.set(message.topic, message)
          this.scheduleLatestFlush(subscription)
        }
      }
    }
  }

  private scheduleLatestFlush(subscription: SubscriptionRecord) {
    if (subscription.frameId !== null) {
      return
    }
    subscription.frameId = requestAnimationFrame(() => {
      subscription.frameId = null
      this.deliverPendingLatest(subscription)
    })
  }

  private flushLatest(subscription: SubscriptionRecord) {
    if (subscription.frameId !== null) {
      cancelAnimationFrame(subscription.frameId)
      subscription.frameId = null
    }
    this.deliverPendingLatest(subscription)
  }

  private deliverPendingLatest(subscription: SubscriptionRecord) {
    const pending = Array.from(subscription.pendingLatest.values())
    subscription.pendingLatest.clear()
    pending.forEach(message => subscription.listener(message))
  }

  private disposeSubscription(key: string) {
    const subscription = this.subscriptions.get(key)
    if (!subscription) {
      return
    }
    if (subscription.frameId !== null) {
      cancelAnimationFrame(subscription.frameId)
    }
    subscription.pendingLatest.clear()
    this.subscriptions.delete(key)
  }

  private notifySubscriptionChange(panelId: string) {
    this.changeListeners.forEach(listener => listener(panelId))
  }
}

export const globalMessagePipeline = new MessagePipeline()
