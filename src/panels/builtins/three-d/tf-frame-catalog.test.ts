import { describe, expect, it, vi } from 'vitest'
import {
  clearFrameIds,
  getFrameIdsSnapshot,
  setFrameIds,
  subscribeFrameIds,
} from './tf-frame-catalog'

describe('tf frame catalog', () => {
  it('publishes a stable, sorted set only when frame availability changes', () => {
    const panelId = 'frame-catalog-sorted-test'
    const listener = vi.fn()
    const unsubscribe = subscribeFrameIds(panelId, listener)

    setFrameIds(panelId, ['sensor', 'map', 'base_link', 'map'])
    const firstSnapshot = getFrameIdsSnapshot(panelId)
    setFrameIds(panelId, ['map', 'sensor', 'base_link'])

    expect(firstSnapshot).toEqual(['base_link', 'map', 'sensor'])
    expect(getFrameIdsSnapshot(panelId)).toBe(firstSnapshot)
    expect(listener).toHaveBeenCalledOnce()

    unsubscribe()
    clearFrameIds(panelId)
  })

  it('isolates frame lists by panel instance and clears stale frames', () => {
    const firstPanelId = 'frame-catalog-first-panel'
    const secondPanelId = 'frame-catalog-second-panel'

    setFrameIds(firstPanelId, ['map', 'base_link'])
    setFrameIds(secondPanelId, ['world', 'camera'])

    expect(getFrameIdsSnapshot(firstPanelId)).toEqual(['base_link', 'map'])
    expect(getFrameIdsSnapshot(secondPanelId)).toEqual(['camera', 'world'])

    clearFrameIds(firstPanelId)
    clearFrameIds(secondPanelId)
    expect(getFrameIdsSnapshot(firstPanelId)).toEqual([])
    expect(getFrameIdsSnapshot(secondPanelId)).toEqual([])
  })
})
