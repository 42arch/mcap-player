export interface AssetLoadSnapshot {
  activeCount: number
  currentLabel: string
}

export interface AssetLoadHandle {
  cancel: () => void
  finish: () => void
}

interface AssetTask {
  label: string
  tokens: Set<symbol>
}

const emptySnapshot: AssetLoadSnapshot = {
  activeCount: 0,
  currentLabel: '',
}

/** Keeps asset loading updates outside React state so the Three.js canvas never re-renders. */
export class AssetLoadTracker {
  private listeners = new Set<() => void>()
  private snapshot = emptySnapshot
  private tasks = new Map<string, AssetTask>()

  readonly getSnapshot = (): AssetLoadSnapshot => this.snapshot

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  begin(key: string, label: string): AssetLoadHandle {
    const token = Symbol(key)
    let task = this.tasks.get(key)
    if (!task) {
      task = { label, tokens: new Set() }
      this.tasks.set(key, task)
    }
    task.tokens.add(token)
    this.publish()

    let settled = false
    const settle = (canceled: boolean) => {
      if (settled) {
        return
      }
      settled = true
      this.settle(key, token, canceled)
    }

    return {
      cancel: () => settle(true),
      finish: () => settle(false),
    }
  }

  dispose() {
    this.tasks.clear()
    this.listeners.clear()
    this.snapshot = emptySnapshot
  }

  private settle(key: string, token: symbol, canceled: boolean) {
    const task = this.tasks.get(key)
    if (!task || !task.tokens.delete(token)) {
      return
    }

    if (canceled && task.tokens.size > 0) {
      return
    }

    this.tasks.delete(key)
    this.publish()
  }

  private publish() {
    const tasks = Array.from(this.tasks.values())
    this.snapshot = {
      activeCount: tasks.length,
      currentLabel: tasks.at(-1)?.label || '',
    }
    this.emit()
  }

  private emit() {
    for (const listener of this.listeners) {
      listener()
    }
  }
}

export function getAssetLabel(url: string, fallback = '3D asset'): string {
  const path = url.trim().split(/[?#]/, 1)[0] || ''
  const encodedName = path.split('/').filter(Boolean).at(-1)
  if (!encodedName) {
    return fallback
  }
  try {
    return decodeURIComponent(encodedName)
  }
  catch {
    return encodedName
  }
}
