'use client'

import type { PlaybackMessage, TopicSubscription } from './message-pipeline'
import { useEffect, useRef } from 'react'
import { globalMessagePipeline } from './message-pipeline'

interface UsePanelMessagesOptions {
  panelId: string
  subscriptionId: string
  topics: TopicSubscription[]
  onMessage: (message: PlaybackMessage) => void
  onSeek?: (timeNs: bigint) => void
}

export function usePanelMessages({ panelId, subscriptionId, topics, onMessage, onSeek }: UsePanelMessagesOptions) {
  const messageRef = useRef(onMessage)
  const seekRef = useRef(onSeek)
  messageRef.current = onMessage
  seekRef.current = onSeek
  const topicsKey = JSON.stringify(topics)

  useEffect(() => {
    return globalMessagePipeline.subscribe(
      { panelId, subscriptionId, topics },
      message => messageRef.current(message),
    )
    // topicsKey intentionally prevents callback identity from resubscribing a high-frequency panel.
  }, [panelId, subscriptionId, topicsKey])

  useEffect(() => {
    if (!onSeek) {
      return
    }
    return globalMessagePipeline.subscribeSeek(panelId, timeNs => seekRef.current?.(timeNs))
  }, [panelId, onSeek])
}
