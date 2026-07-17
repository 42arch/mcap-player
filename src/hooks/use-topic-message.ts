import { useEffect, useState } from 'react'
import { globalMessageBus } from '@/core/message-bus'
import { usePlayerStore } from '@/stores/use-player-store'

/** Subscribe to a topic for playback updates; unsubscribes on unmount or topic change. */
export function useTopicSubscription(topic: string | undefined, callback: (msg: any) => void): void {
  useEffect(() => {
    if (!topic) {
      return
    }
    return globalMessageBus.subscribe(topic, callback)
  }, [topic, callback])
}

/** Current frame message for a topic (auto-subscribes). */
export function useTopicMessage(topic: string | undefined): any | null {
  const [msg, setMsg] = useState<any | null>(null)

  useTopicSubscription(topic, (newMsg) => {
    setMsg(newMsg)
  })

  useEffect(() => {
    setMsg(null)
  }, [topic])

  return msg
}

export function useCompiledSchemas() {
  const fileSummary = usePlayerStore(state => state.fileSummary)
  return fileSummary ? fileSummary.schemas : []
}

export function useMcapChannels() {
  const fileSummary = usePlayerStore(state => state.fileSummary)
  return fileSummary ? fileSummary.channels : []
}

export function useIsMcapLoaded() {
  const fileSummary = usePlayerStore(state => state.fileSummary)
  return fileSummary !== null
}
