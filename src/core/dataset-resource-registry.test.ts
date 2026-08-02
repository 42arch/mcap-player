import { describe, expect, it, vi } from 'vitest'
import { registerDatasetResourceCleaner, resetDatasetResources } from './dataset-resource-registry'

describe('dataset resource registry', () => {
  it('runs registered cleaners and supports unregistering them', () => {
    const cleaner = vi.fn()
    const unregister = registerDatasetResourceCleaner(cleaner)

    resetDatasetResources()
    unregister()
    resetDatasetResources()

    expect(cleaner).toHaveBeenCalledOnce()
  })
})
