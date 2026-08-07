import type { PanelInstance } from './types'
import { describe, expect, it } from 'vitest'
import { buildExportData, parseAndValidateConfig } from './config-io'

describe('config-io', () => {
  const dummyPanels: Record<string, PanelInstance> = {
    'raw-message-1': {
      id: 'raw-message-1',
      type: 'raw-message',
      configVersion: 1,
      config: { topic: '/chatter', refreshRateHz: 10, binaryFormat: 'hex' },
    },
  }
  const dummyOrder = ['raw-message-1']
  const dummyDockviewLayout = { grid: { root: {} } }

  it('builds export data correctly', () => {
    const mockDockviewApi = {
      toJSON: () => dummyDockviewLayout,
    } as any

    const exportData = buildExportData(dummyPanels, dummyOrder, mockDockviewApi)

    expect(exportData.version).toBe(1)
    expect(exportData.appName).toBe('mcapview')
    expect(exportData.panelsById).toEqual(dummyPanels)
    expect(exportData.panelOrder).toEqual(dummyOrder)
    expect(exportData.dockviewLayout).toEqual(dummyDockviewLayout)
    expect(typeof exportData.exportedAt).toBe('string')
  })

  it('parses and validates valid export data', () => {
    const validData = {
      version: 1,
      appName: 'mcapview',
      exportedAt: '2026-08-06T11:50:00.000Z',
      panelsById: dummyPanels,
      panelOrder: dummyOrder,
      dockviewLayout: dummyDockviewLayout,
    }

    const result = parseAndValidateConfig(JSON.stringify(validData))
    expect(result).toEqual(validData)
  })

  it('throws error for invalid JSON string', () => {
    expect(() => parseAndValidateConfig('{ bad json')).toThrow('Invalid JSON format.')
  })

  it('throws error for unrecognized appName', () => {
    const badApp = {
      version: 1,
      appName: 'other-app',
      panelsById: {},
      panelOrder: [],
      dockviewLayout: {},
    }
    expect(() => parseAndValidateConfig(JSON.stringify(badApp))).toThrow(
      'Invalid layout file: Unrecognized application identifier.',
    )
  })

  it('throws error for unsupported version', () => {
    const badVersion = {
      version: 99,
      appName: 'mcapview',
      panelsById: {},
      panelOrder: [],
      dockviewLayout: {},
    }
    expect(() => parseAndValidateConfig(JSON.stringify(badVersion))).toThrow(
      'Unsupported configuration version: 99',
    )
  })
})
