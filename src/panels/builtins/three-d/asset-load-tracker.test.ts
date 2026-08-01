import { describe, expect, it } from 'vitest'
import { AssetLoadTracker, getAssetLabel } from './asset-load-tracker'

describe('asset load tracker', () => {
  it('tracks each asset once while preserving shared consumers', () => {
    const tracker = new AssetLoadTracker()
    const first = tracker.begin('shared.stl', 'shared.stl')
    const second = tracker.begin('shared.stl', 'shared.stl')
    const other = tracker.begin('other.glb', 'other.glb')

    expect(tracker.getSnapshot()).toMatchObject({
      activeCount: 2,
      currentLabel: 'other.glb',
    })

    first.cancel()
    expect(tracker.getSnapshot().activeCount).toBe(2)
    second.cancel()
    expect(tracker.getSnapshot().activeCount).toBe(1)
    other.finish()
    expect(tracker.getSnapshot()).toEqual({ activeCount: 0, currentLabel: '' })
  })
})

describe('getAssetLabel', () => {
  it('extracts a readable file name from a remote URL', () => {
    expect(getAssetLabel('https://assets.example.com/robot/front%20wheel.stl?v=3')).toBe('front wheel.stl')
  })
})
