import type { MessageProcessor, MessageProcessorByTopic } from '@/core/message-processing'
import { cancelFrame, scheduleFrame } from '@/core/raf-scheduler'

export type DeliveryMode = 'all' | 'latest'
export type DeliveryPriority = 'high' | 'normal'

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
  priority?: DeliveryPriority
  processor?: MessageProcessor
  retainOnSeek?: (timeNs: bigint) => boolean
}

export interface PanelSubscriptionOptions {
  panelId: string
  subscriptionId: string
  topics: TopicSubscription[]
}

interface SubscriptionRecord extends PanelSubscriptionOptions {
  listener: (message: PlaybackMessage) => void
  interestsByTopic: Map<string, TopicSubscription>
  pendingLatest: Map<string, PlaybackMessage>
  flushScheduled: boolean
  flushTask: () => void
}

interface TopicSubscriberIndex {
  high: Set<SubscriptionRecord>
  normal: Set<SubscriptionRecord>
}

export interface QueryPlan {
  topics: string[]
  modeByTopic: Record<string, DeliveryMode>
  processorsByTopic?: MessageProcessorByTopic
}

function mergeTopicSubscriptions(
  current: TopicSubscription,
  incoming: TopicSubscription,
): TopicSubscription {
  const retainOnSeek = current.retainOnSeek && incoming.retainOnSeek
    ? (timeNs: bigint) => current.retainOnSeek!(timeNs) && incoming.retainOnSeek!(timeNs)
    : undefined
  const processor = current.processor && incoming.processor
    ? {
        type: 'point-cloud' as const,
        maxPoints: Math.max(current.processor.maxPoints, incoming.processor.maxPoints),
        ...(current.processor.colorMode !== undefined
          && current.processor.colorMode === incoming.processor.colorMode
          && current.processor.solidColor === incoming.processor.solidColor
          ? {
              colorMode: current.processor.colorMode,
              solidColor: current.processor.solidColor,
            }
          : {}),
      }
    : undefined
  return {
    topic: current.topic,
    mode: current.mode === 'all' || incoming.mode === 'all' ? 'all' : 'latest',
    priority: current.priority === 'high' || incoming.priority === 'high' ? 'high' : 'normal',
    processor,
    retainOnSeek,
  }
}

export class MessagePipeline {
  private subscriptions = new Map<string, SubscriptionRecord>()
  private subscribersByTopic = new Map<string, TopicSubscriberIndex>()
  private changeListeners = new Set<(panelId: string) => void>()
  private seekListeners = new Map<string, Set<(timeNs: bigint) => void>>()
  private seekCompleteListeners = new Map<string, Set<(timeNs: bigint) => void>>()

  subscribe(options: PanelSubscriptionOptions, listener: (message: PlaybackMessage) => void): () => void {
    const key = `${options.panelId}:${options.subscriptionId}`
    const interestsByTopic = new Map<string, TopicSubscription>()
    for (const subscription of options.topics) {
      if (subscription.topic) {
        const existing = interestsByTopic.get(subscription.topic)
        interestsByTopic.set(
          subscription.topic,
          existing ? mergeTopicSubscriptions(existing, subscription) : subscription,
        )
      }
    }
    const record: SubscriptionRecord = {
      ...options,
      topics: Array.from(interestsByTopic.values()),
      listener,
      interestsByTopic,
      pendingLatest: new Map(),
      flushScheduled: false,
      flushTask: () => {
        record.flushScheduled = false
        this.deliverPendingLatest(record)
      },
    }
    this.disposeSubscription(key)
    this.subscriptions.set(key, record)
    this.indexSubscription(record)
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
      if (subscription.flushScheduled) {
        cancelFrame(subscription.flushTask)
        subscription.flushScheduled = false
      }
      subscription.pendingLatest.clear()
    }
    for (const listeners of this.seekListeners.values()) {
      listeners.forEach(listener => listener(timeNs))
    }
  }

  emitSeekComplete(timeNs: bigint, panelIds?: readonly string[]) {
    if (panelIds) {
      for (const panelId of panelIds) {
        this.seekCompleteListeners.get(panelId)?.forEach(listener => listener(timeNs))
      }
      return
    }
    for (const listeners of this.seekCompleteListeners.values()) {
      listeners.forEach(listener => listener(timeNs))
    }
  }

  /**
   * Reports panels whose entire seek dependency set has completed. This lets a
   * 3D panel commit its TF + point-cloud snapshot without waiting for an
   * unrelated H.264 panel to search backward to a keyframe.
   */
  getSeekReadyPanelIds(completedTopics: ReadonlySet<string>, timeNs: bigint): string[] {
    const readiness = new Map<string, boolean>()
    for (const panelId of this.seekCompleteListeners.keys()) {
      readiness.set(panelId, true)
    }
    for (const subscription of this.subscriptions.values()) {
      readiness.set(subscription.panelId, readiness.get(subscription.panelId) ?? true)
      for (const topic of subscription.topics) {
        if (topic.retainOnSeek?.(timeNs)) {
          continue
        }
        if (!completedTopics.has(topic.topic)) {
          readiness.set(subscription.panelId, false)
          break
        }
      }
    }
    return Array.from(readiness, ([panelId, ready]) => ready ? panelId : null)
      .filter((panelId): panelId is string => panelId !== null)
  }

  getQueryPlan(): QueryPlan {
    return this.buildQueryPlan()
  }

  getSeekQueryPlan(timeNs: bigint): QueryPlan {
    return this.buildQueryPlan(timeNs)
  }

  private buildQueryPlan(seekTimeNs?: bigint): QueryPlan {
    const modeByTopic: Record<string, DeliveryMode> = {}
    const processorsByTopic: MessageProcessorByTopic = {}
    const processorBlockedTopics = new Set<string>()
    for (const subscription of this.subscriptions.values()) {
      for (const topic of subscription.topics) {
        if (seekTimeNs !== undefined && topic.retainOnSeek?.(seekTimeNs)) {
          continue
        }
        if (topic.mode === 'all' || modeByTopic[topic.topic] === undefined) {
          modeByTopic[topic.topic] = topic.mode
        }
        if (!topic.processor) {
          processorBlockedTopics.add(topic.topic)
          delete processorsByTopic[topic.topic]
          continue
        }
        if (processorBlockedTopics.has(topic.topic)) {
          continue
        }
        const existing = processorsByTopic[topic.topic]
        processorsByTopic[topic.topic] = existing?.type === 'point-cloud'
          ? {
              type: 'point-cloud',
              maxPoints: Math.max(existing.maxPoints, topic.processor.maxPoints),
              ...(existing.colorMode !== undefined
                && existing.colorMode === topic.processor.colorMode
                && existing.solidColor === topic.processor.solidColor
                ? {
                    colorMode: existing.colorMode,
                    solidColor: existing.solidColor,
                  }
                : {}),
            }
          : topic.processor
      }
    }
    const plan: QueryPlan = { topics: Object.keys(modeByTopic).sort(), modeByTopic }
    if (Object.keys(processorsByTopic).length > 0) {
      plan.processorsByTopic = processorsByTopic
    }
    return plan
  }

  onSubscriptionsChanged(listener: (panelId: string) => void): () => void {
    this.changeListeners.add(listener)
    return () => this.changeListeners.delete(listener)
  }

  private dispatchMatching(messages: readonly PlaybackMessage[], panelId?: string) {
    for (const message of messages) {
      const index = this.subscribersByTopic.get(message.topic)
      if (!index) {
        continue
      }
      this.dispatchToSubscribers(index.high, message, panelId)
      this.dispatchToSubscribers(index.normal, message, panelId)
    }
  }

  private dispatchToSubscribers(
    subscribers: ReadonlySet<SubscriptionRecord>,
    message: PlaybackMessage,
    panelId?: string,
  ) {
    for (const subscription of subscribers) {
      if (panelId && subscription.panelId !== panelId) {
        continue
      }
      const interest = subscription.interestsByTopic.get(message.topic)
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

  private scheduleLatestFlush(subscription: SubscriptionRecord) {
    if (subscription.flushScheduled) {
      return
    }
    subscription.flushScheduled = true
    scheduleFrame(subscription.flushTask)
  }

  private flushLatest(subscription: SubscriptionRecord) {
    if (subscription.flushScheduled) {
      cancelFrame(subscription.flushTask)
      subscription.flushScheduled = false
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
    if (subscription.flushScheduled) {
      cancelFrame(subscription.flushTask)
      subscription.flushScheduled = false
    }
    subscription.pendingLatest.clear()
    this.unindexSubscription(subscription)
    this.subscriptions.delete(key)
  }

  private indexSubscription(subscription: SubscriptionRecord) {
    for (const interest of subscription.topics) {
      let index = this.subscribersByTopic.get(interest.topic)
      if (!index) {
        index = { high: new Set(), normal: new Set() }
        this.subscribersByTopic.set(interest.topic, index)
      }
      index[interest.priority === 'high' ? 'high' : 'normal'].add(subscription)
    }
  }

  private unindexSubscription(subscription: SubscriptionRecord) {
    for (const interest of subscription.topics) {
      const index = this.subscribersByTopic.get(interest.topic)
      if (!index) {
        continue
      }
      index.high.delete(subscription)
      index.normal.delete(subscription)
      if (index.high.size === 0 && index.normal.size === 0) {
        this.subscribersByTopic.delete(interest.topic)
      }
    }
  }

  private notifySubscriptionChange(panelId: string) {
    this.changeListeners.forEach(listener => listener(panelId))
  }
}

export const globalMessagePipeline = new MessagePipeline()
