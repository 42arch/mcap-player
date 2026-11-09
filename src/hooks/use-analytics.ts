import { usePostHog } from '@posthog/react'
import { useCallback } from 'react'

export type McapOpenSource = 'landing' | 'menu'
export type McapOpenMethod = 'local' | 'remote' | 'example'

export interface McapOpenedEvent {
  source: McapOpenSource
  method: McapOpenMethod
  exampleId?: string
  fileSizeBytes?: number
}

export function useAnalytics() {
  const posthog = usePostHog()

  const captureMcapOpened = useCallback((event: McapOpenedEvent) => {
    posthog.capture('mcap_file_opened', {
      source: event.source,
      method: event.method,
      ...(event.exampleId ? { example_id: event.exampleId } : {}),
      ...(event.fileSizeBytes !== undefined ? { file_size_bytes: event.fileSizeBytes } : {}),
    })
  }, [posthog])

  return { captureMcapOpened }
}
