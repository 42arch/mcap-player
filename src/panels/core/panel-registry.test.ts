import { describe, expect, it } from 'vitest'
import { getPanelDefinition, registerPanel } from './panel-registry'

describe('panel registry', () => {
  it('keeps a panel loader lazy until a host renders it', () => {
    const type = `test-lazy-${crypto.randomUUID()}`
    let loadCount = 0
    const unregister = registerPanel({
      type,
      title: 'Test panel',
      configVersion: 1,
      createDefaultConfig: () => ({}),
      loadPanel: async () => {
        loadCount++
        return { default: () => null }
      },
    })

    expect(loadCount).toBe(0)
    expect(getPanelDefinition(type)?.Panel).toBeDefined()

    unregister()
    expect(getPanelDefinition(type)).toBeUndefined()
  })
})
