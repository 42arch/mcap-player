export interface DisposableResourceHandle<T> {
  resource: T
  release: () => void
}

interface ResourceEntry<T> {
  promise: Promise<T>
  resource: T | null
  references: number
  stale: boolean
  disposed: boolean
}

/**
 * A bounded async resource cache. Active consumers retain resources across LRU
 * eviction and dataset resets; disposal is deferred until their last release.
 */
export class DisposableResourceCache<T> {
  private readonly entries = new Map<string, ResourceEntry<T>>()

  constructor(
    private readonly maxEntries: number,
    private readonly dispose: (resource: T) => void,
  ) {}

  has(key: string): boolean {
    return this.entries.has(key)
  }

  acquire(key: string, load: () => Promise<T>): Promise<DisposableResourceHandle<T>> {
    let entry = this.entries.get(key)
    if (entry) {
      // Refresh insertion order so the map also serves as the LRU list.
      this.entries.delete(key)
      this.entries.set(key, entry)
    }
    else {
      entry = {
        promise: Promise.resolve().then(load),
        resource: null,
        references: 0,
        stale: false,
        disposed: false,
      }
      const currentEntry = entry
      currentEntry.promise = currentEntry.promise.then((resource) => {
        currentEntry.resource = resource
        if (currentEntry.stale && currentEntry.references === 0) {
          this.disposeEntry(currentEntry)
        }
        return resource
      }).catch((error: unknown) => {
        if (this.entries.get(key) === currentEntry) {
          this.entries.delete(key)
        }
        currentEntry.stale = true
        throw error
      })
      this.entries.set(key, currentEntry)
    }

    entry.references++
    this.enforceLimit()
    const retainedEntry = entry
    return retainedEntry.promise.then((resource) => {
      let released = false
      return {
        resource,
        release: () => {
          if (released) {
            return
          }
          released = true
          retainedEntry.references--
          if (retainedEntry.stale && retainedEntry.references === 0) {
            this.disposeEntry(retainedEntry)
          }
          this.enforceLimit()
        },
      }
    }).catch((error: unknown) => {
      retainedEntry.references--
      throw error
    })
  }

  clear(): void {
    const entries = Array.from(this.entries.values())
    this.entries.clear()
    for (const entry of entries) {
      entry.stale = true
      if (entry.references === 0) {
        this.disposeEntry(entry)
      }
    }
  }

  private enforceLimit(): void {
    if (this.entries.size <= this.maxEntries) {
      return
    }

    for (const [key, entry] of this.entries) {
      if (this.entries.size <= this.maxEntries) {
        break
      }
      if (entry.references > 0) {
        continue
      }
      this.entries.delete(key)
      entry.stale = true
      this.disposeEntry(entry)
    }
  }

  private disposeEntry(entry: ResourceEntry<T>): void {
    if (entry.disposed || !entry.resource) {
      return
    }
    entry.disposed = true
    this.dispose(entry.resource)
  }
}
