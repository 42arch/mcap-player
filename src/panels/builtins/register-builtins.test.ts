import type { ThreeDPanelConfig } from '@/panels/core/types'
import { describe, expect, it } from 'vitest'
import { getPanelDefinition } from '@/panels/core/panel-registry'
import { registerBuiltInPanels } from './register-builtins'

describe('built-in 3D panel registration', () => {
  it('migrates legacy settings without losing renderer defaults', () => {
    registerBuiltInPanels()
    const definition = getPanelDefinition('3d')
    const migrated = definition?.migrateConfig?.({
      pointSize: 5,
      colorMode: 'solid',
      solidColor: '#ff0000',
      maxPoints: 120000,
      labelFieldsByTopic: { '/markers': ['label'] },
    }, 2) as ThreeDPanelConfig

    expect(definition?.configVersion).toBe(4)
    expect(migrated.layerSettings).toEqual({})
    expect(migrated.selectedLayerId).toBeNull()
    expect(migrated.fixedFrame).toBe('auto')
    expect(migrated.displayFrame).toBe('map')
    expect(migrated.followMode).toBe('follow-position')
    expect(migrated.pointSize).toBe(5)
    expect(migrated.labelFieldsByTopic).toEqual({ '/markers': ['label'] })
  })

  it('preserves valid display-frame settings and repairs invalid follow modes', () => {
    registerBuiltInPanels()
    const definition = getPanelDefinition('3d')
    const valid = definition?.migrateConfig?.({
      displayFrame: 'base_link',
      followMode: 'follow-heading',
    }, 3) as ThreeDPanelConfig
    const invalid = definition?.migrateConfig?.({
      displayFrame: '  ',
      followMode: 'unexpected',
    }, 3) as ThreeDPanelConfig

    expect(valid.displayFrame).toBe('base_link')
    expect(valid.followMode).toBe('follow-heading')
    expect(invalid.displayFrame).toBe('map')
    expect(invalid.followMode).toBe('follow-position')
  })
})
