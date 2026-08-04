interface FrameCatalog {
  frameIds: readonly string[]
  listeners: Set<() => void>
}

const EMPTY_FRAME_IDS: readonly string[] = Object.freeze([])
const catalogs = new Map<string, FrameCatalog>()

function getOrCreateCatalog(panelId: string): FrameCatalog {
  let catalog = catalogs.get(panelId)
  if (!catalog) {
    catalog = { frameIds: EMPTY_FRAME_IDS, listeners: new Set() }
    catalogs.set(panelId, catalog)
  }
  return catalog
}

function haveSameFrames(current: readonly string[], next: readonly string[]): boolean {
  return current.length === next.length && current.every((frameId, index) => frameId === next[index])
}

export function getFrameIdsSnapshot(panelId: string): readonly string[] {
  return catalogs.get(panelId)?.frameIds ?? EMPTY_FRAME_IDS
}

export function subscribeFrameIds(panelId: string, listener: () => void): () => void {
  const catalog = getOrCreateCatalog(panelId)
  catalog.listeners.add(listener)
  return () => {
    catalog.listeners.delete(listener)
    if (catalog.listeners.size === 0 && catalog.frameIds.length === 0 && catalogs.get(panelId) === catalog) {
      catalogs.delete(panelId)
    }
  }
}

export function setFrameIds(panelId: string, frameIds: Iterable<string>): void {
  const next = Array.from(new Set(frameIds)).filter(Boolean).sort()
  const catalog = getOrCreateCatalog(panelId)
  if (haveSameFrames(catalog.frameIds, next)) {
    return
  }
  catalog.frameIds = Object.freeze(next)
  catalog.listeners.forEach(listener => listener())
}

export function clearFrameIds(panelId: string): void {
  const catalog = catalogs.get(panelId)
  if (!catalog) {
    return
  }
  if (catalog.frameIds.length > 0) {
    catalog.frameIds = EMPTY_FRAME_IDS
    catalog.listeners.forEach(listener => listener())
  }
  if (catalog.listeners.size === 0) {
    catalogs.delete(panelId)
  }
}
