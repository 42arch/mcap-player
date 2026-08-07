import type { DockviewApi } from 'dockview-react'
import type { PanelId, PanelInstance, PanelLayoutExportData } from './types'

export function buildExportData(
  panelsById: Record<PanelId, PanelInstance>,
  panelOrder: PanelId[],
  dockviewApi: DockviewApi | null,
): PanelLayoutExportData {
  const dockviewLayout = dockviewApi ? dockviewApi.toJSON() : {}

  return {
    version: 1,
    appName: 'mcapview',
    exportedAt: new Date().toISOString(),
    panelsById,
    panelOrder,
    dockviewLayout: dockviewLayout as Record<string, unknown>,
  }
}

export function downloadJsonFile(data: object, filename: string): void {
  const jsonString = JSON.stringify(data, null, 2)
  const blob = new Blob([jsonString], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function parseAndValidateConfig(jsonString: string): PanelLayoutExportData {
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonString)
  }
  catch {
    throw new Error('Invalid JSON format.')
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Invalid layout file: Content must be an object.')
  }

  const data = parsed as Partial<PanelLayoutExportData>

  if (data.appName !== 'mcapview') {
    throw new Error('Invalid layout file: Unrecognized application identifier.')
  }

  if (data.version !== 1) {
    throw new Error(`Unsupported configuration version: ${data.version ?? 'unknown'}`)
  }

  if (!data.panelsById || typeof data.panelsById !== 'object') {
    throw new Error('Invalid layout file: Missing or invalid "panelsById" record.')
  }

  if (!Array.isArray(data.panelOrder)) {
    throw new TypeError('Invalid layout file: Missing or invalid "panelOrder" array.')
  }

  if (!data.dockviewLayout || typeof data.dockviewLayout !== 'object') {
    throw new Error('Invalid layout file: Missing or invalid "dockviewLayout" configuration.')
  }

  return data as PanelLayoutExportData
}
