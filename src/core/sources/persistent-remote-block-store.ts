export interface RemoteBlockCacheIdentity {
  url: string
  size: number
  validator?: string
}

export interface PersistentRemoteBlockStore {
  get(identity: RemoteBlockCacheIdentity, blockIndex: number): Promise<Uint8Array | null>
  put(identity: RemoteBlockCacheIdentity, blockIndex: number, data: Uint8Array): Promise<boolean>
  listBlockIndexes(identity: RemoteBlockCacheIdentity): Promise<number[]>
  runExclusive<T>(identity: RemoteBlockCacheIdentity, blockIndex: number, task: () => Promise<T>): Promise<T>
}

interface BlockRecord {
  key: string
  identityKey: string
  blockIndex: number
  data: ArrayBuffer
}

interface NavigatorWithOptionalLocks {
  locks?: {
    request<T>(name: string, options: { mode: 'exclusive' }, callback: () => Promise<T>): Promise<T>
  }
}

const DATABASE_NAME = 'mcapview-remote-blocks'
const DATABASE_VERSION = 1
const BLOCK_STORE_NAME = 'blocks'

function getIdentityKey(identity: RemoteBlockCacheIdentity): string {
  return JSON.stringify([identity.url, identity.size, identity.validator ?? ''])
}

function getBlockKey(identity: RemoteBlockCacheIdentity, blockIndex: number): string {
  return `${getIdentityKey(identity)}:${blockIndex}`
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'))
  })
}

class IndexedDbRemoteBlockStore implements PersistentRemoteBlockStore {
  private databasePromise: Promise<IDBDatabase> | null = null

  async get(identity: RemoteBlockCacheIdentity, blockIndex: number): Promise<Uint8Array | null> {
    try {
      const database = await this.getDatabase()
      const transaction = database.transaction(BLOCK_STORE_NAME, 'readonly')
      const record = await requestToPromise(transaction.objectStore(BLOCK_STORE_NAME).get(
        getBlockKey(identity, blockIndex),
      ) as IDBRequest<BlockRecord | undefined>)
      return record ? new Uint8Array(record.data) : null
    }
    catch {
      return null
    }
  }

  async put(identity: RemoteBlockCacheIdentity, blockIndex: number, data: Uint8Array): Promise<boolean> {
    try {
      const database = await this.getDatabase()
      const transaction = database.transaction(BLOCK_STORE_NAME, 'readwrite')
      const record: BlockRecord = {
        key: getBlockKey(identity, blockIndex),
        identityKey: getIdentityKey(identity),
        blockIndex,
        data: data.slice().buffer,
      }
      await requestToPromise(transaction.objectStore(BLOCK_STORE_NAME).put(record))
      return true
    }
    catch {
      // Storage can be unavailable or out of quota. HTTP remains the fallback.
      return false
    }
  }

  async listBlockIndexes(identity: RemoteBlockCacheIdentity): Promise<number[]> {
    try {
      const database = await this.getDatabase()
      const transaction = database.transaction(BLOCK_STORE_NAME, 'readonly')
      const index = transaction.objectStore(BLOCK_STORE_NAME).index('identityKey')
      const records = await requestToPromise(index.getAll(IDBKeyRange.only(getIdentityKey(identity))) as IDBRequest<BlockRecord[]>)
      return records.map(record => record.blockIndex)
    }
    catch {
      return []
    }
  }

  async runExclusive<T>(identity: RemoteBlockCacheIdentity, blockIndex: number, task: () => Promise<T>): Promise<T> {
    const locks = (globalThis.navigator as NavigatorWithOptionalLocks | undefined)?.locks
    if (!locks) {
      return task()
    }
    return locks.request(`mcapview:remote-block:${getBlockKey(identity, blockIndex)}`, { mode: 'exclusive' }, task)
  }

  private getDatabase(): Promise<IDBDatabase> {
    if (!this.databasePromise) {
      this.databasePromise = new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
          reject(new Error('IndexedDB is unavailable.'))
          return
        }
        const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
        request.onupgradeneeded = () => {
          const database = request.result
          const blocks = database.objectStoreNames.contains(BLOCK_STORE_NAME)
            ? request.transaction!.objectStore(BLOCK_STORE_NAME)
            : database.createObjectStore(BLOCK_STORE_NAME, { keyPath: 'key' })
          if (!blocks.indexNames.contains('identityKey')) {
            blocks.createIndex('identityKey', 'identityKey', { unique: false })
          }
        }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error ?? new Error('Unable to open IndexedDB.'))
      })
    }
    return this.databasePromise
  }
}

const defaultRemoteBlockStore = new IndexedDbRemoteBlockStore()

export function getDefaultRemoteBlockStore(): PersistentRemoteBlockStore {
  return defaultRemoteBlockStore
}
