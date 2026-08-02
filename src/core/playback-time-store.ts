import { useSyncExternalStore } from 'react'

type PlaybackTimeListener = (elapsedNs: bigint) => void

let elapsedNs = 0n
const listeners = new Set<PlaybackTimeListener>()

export function getPlaybackElapsedNs(): bigint {
  return elapsedNs
}

export function setPlaybackElapsedNs(nextElapsedNs: bigint): void {
  if (nextElapsedNs === elapsedNs) {
    return
  }

  elapsedNs = nextElapsedNs
  for (const listener of listeners) {
    listener(elapsedNs)
  }
}

export function subscribePlaybackTime(listener: PlaybackTimeListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function usePlaybackElapsedNs(): bigint {
  return useSyncExternalStore(
    subscribePlaybackTime,
    getPlaybackElapsedNs,
    getPlaybackElapsedNs,
  )
}
