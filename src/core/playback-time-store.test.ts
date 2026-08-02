import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getPlaybackElapsedNs,
  setPlaybackElapsedNs,
  subscribePlaybackTime,
} from './playback-time-store'

afterEach(() => {
  setPlaybackElapsedNs(0n)
})

describe('playback time store', () => {
  it('publishes transient playback time outside the player store', () => {
    const listener = vi.fn()
    const unsubscribe = subscribePlaybackTime(listener)

    setPlaybackElapsedNs(42n)

    expect(getPlaybackElapsedNs()).toBe(42n)
    expect(listener).toHaveBeenCalledWith(42n)
    unsubscribe()
  })

  it('deduplicates unchanged values and stops after unsubscribe', () => {
    const listener = vi.fn()
    const unsubscribe = subscribePlaybackTime(listener)

    setPlaybackElapsedNs(12n)
    setPlaybackElapsedNs(12n)
    unsubscribe()
    setPlaybackElapsedNs(13n)

    expect(listener).toHaveBeenCalledTimes(1)
  })
})
