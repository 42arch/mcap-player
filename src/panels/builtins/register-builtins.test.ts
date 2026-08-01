import type { ThreeDPanelConfig } from '@/panels/core/types'
import { describe, expect, it } from 'vitest'
import { getPanelDefinition } from '@/panels/core/panel-registry'
import { registerBuiltInPanels } from './register-builtins'

describe('built-in 3D panel registration', () => {
  it('migrates version-2 settings without losing legacy renderer defaults', () => {
    registerBuiltInPanels()
    const definition = getPanelDefinition('3d')
    const migrated = definition?.migrateConfig?.({
      pointSize: 5,
      colorMode: 'solid',
      solidColor: '#ff0000',
      maxPoints: 120000,
      labelFieldsByTopic: { '/markers': ['label'] },
    }, 2) as ThreeDPanelConfig

    expect(definition?.configVersion).toBe(3)
    expect(migrated.layerSettings).toEqual({})
    expect(migrated.selectedLayerId).toBeNull()
    expect(migrated.fixedFrame).toBe('auto')
    expect(migrated.pointSize).toBe(5)
    expect(migrated.labelFieldsByTopic).toEqual({ '/markers': ['label'] })
  })
})
