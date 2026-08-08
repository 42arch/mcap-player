import { expose } from 'comlink'
import type { SessionBlockProgress } from '@/core/sources/session-opfs-block-provider'

const MIB = 1024 * 1024
const DEFAULT_BLOCK_SIZE = 4 * MIB
const MEMORY_CACHE_BYTES = 128 * MIB
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504])
const CONTENT_RANGE_PATTERN = /^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i
const SESSION_DIRECTORY = 'mcapview-sessions'

/** File System Access types are not yet included in every TypeScript DOM lib. */
interface SyncAccessHandle {
  read(buffer: AllowSharedBufferSource, options: { at: number }): number
  write(buffer: AllowSharedBufferSource, options: { at: number }): number
  flush(): void
  close(): void
}

interface SyncAccessFileHandle extends FileSystemFileHandle {
  createSyncAccessHandle(): Promise<SyncAccessHandle>
}

function supportsSyncAccessHandle(file: FileSystemFileHandle): file is SyncAccessFileHandle {
  return typeof (file as Partial<SyncAccessFileHandle>).createSyncAccessHandle === 'function'
}

interface RemoteCacheSession {
  id: string
  url: string
  size: number
  blockSize: number
  directory: FileSystemDirectoryHandle | null
  handle: SyncAccessHandle | null
  abortController: AbortController
  storedBlocks: Set<number>
  residentBlocks: Map<number, Uint8Array>
  inFlightBlocks: Map<number, Promise<Uint8Array>>
  residentBytes: number
}

interface BlockRequest {
  id: number
  type: 'get-block' | 'get-progress'
  blockIndex?: number
}

function parseContentRange(value: string | null): { start: number, end: number, size?: number } | null {
  const match = value?.match(CONTENT_RANGE_PATTERN)
  if (!match) {
    return null
  }
  return {
    start: Number(match[1]),
    end: Number(match[2]),
    size: match[3] === '*' ? undefined : Number(match[3]),
  }
}

function getRangeSize(blockIndex: number, session: RemoteCacheSession): number {
  return Math.min(session.blockSize, session.size - blockIndex * session.blockSize)
}

function waitForRetry(delayMs: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Remote MCAP request was canceled.', 'AbortError'))
      return
    }
    const handleAbort = () => {
      clearTimeout(timeout)
      reject(new DOMException('Remote MCAP request was canceled.', 'AbortError'))
    }
    const timeout = setTimeout(() => {
      signal.removeEventListener('abort', handleAbort)
      resolve()
    }, delayMs)
    signal.addEventListener('abort', handleAbort, { once: true })
  })
}

class RemoteCacheWorker {
  private readonly sessions = new Map<string, RemoteCacheSession>()
  private root: FileSystemDirectoryHandle | null = null
  private initialized = false

  async createSession(url: string, blockSize = DEFAULT_BLOCK_SIZE): Promise<{ sessionId: string, size: number }> {
    await this.initialize()
    const size = await this.probeSize(url)
    const sessionId = crypto.randomUUID()
    const session: RemoteCacheSession = {
      id: sessionId,
      url,
      size,
      blockSize,
      directory: null,
      handle: null,
      abortController: new AbortController(),
      storedBlocks: new Set(),
      residentBlocks: new Map(),
      inFlightBlocks: new Map(),
      residentBytes: 0,
    }
    await this.openSessionFile(session)
    this.sessions.set(sessionId, session)
    return { sessionId, size }
  }

  connect(sessionId: string, port: MessagePort): void {
    const session = this.requireSession(sessionId)
    port.addEventListener('message', (event: MessageEvent<BlockRequest>) => {
      void this.handleRequest(session, port, event.data)
    })
    port.start()
  }

  async destroySession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) {
      return
    }
    this.sessions.delete(sessionId)
    session.abortController.abort()
    session.handle?.close()
    session.residentBlocks.clear()
    session.inFlightBlocks.clear()
    if (this.root) {
      await this.root.removeEntry(session.id, { recursive: true }).catch(() => undefined)
    }
  }

  private async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }
    this.initialized = true
    if (!navigator.storage?.getDirectory) {
      return
    }
    try {
      const root = await navigator.storage.getDirectory()
      const sessions = await root.getDirectoryHandle(SESSION_DIRECTORY, { create: true })
      for await (const [name] of sessions.entries()) {
        await sessions.removeEntry(name, { recursive: true })
      }
      this.root = sessions
    }
    catch (error) {
      console.warn('OPFS is unavailable; remote MCAP cache will remain in memory for this session.', error)
    }
  }

  private async openSessionFile(session: RemoteCacheSession): Promise<void> {
    if (!this.root) {
      return
    }
    try {
      session.directory = await this.root.getDirectoryHandle(session.id, { create: true })
      const file = await session.directory.getFileHandle('data.bin', { create: true })
      if (supportsSyncAccessHandle(file)) {
        session.handle = await file.createSyncAccessHandle()
      }
    }
    catch (error) {
      console.warn('Failed to open OPFS session cache; falling back to memory.', error)
    }
  }

  private async handleRequest(session: RemoteCacheSession, port: MessagePort, request: BlockRequest): Promise<void> {
    try {
      if (request.type === 'get-progress') {
        const progress: SessionBlockProgress = {
          storedBlockIndexes: Array.from(session.storedBlocks),
          residentBlockIndexes: Array.from(session.residentBlocks.keys()),
        }
        port.postMessage({ id: request.id, result: progress })
        return
      }
      if (request.blockIndex === undefined) {
        throw new Error('Missing remote MCAP block index.')
      }
      const block = await this.getBlock(session, request.blockIndex)
      const copy = block.slice()
      port.postMessage({ id: request.id, result: copy.buffer }, [copy.buffer])
    }
    catch (error) {
      port.postMessage({ id: request.id, error: error instanceof Error ? error.message : String(error) })
    }
  }

  private getBlock(session: RemoteCacheSession, blockIndex: number): Promise<Uint8Array> {
    const resident = session.residentBlocks.get(blockIndex)
    if (resident) {
      session.residentBlocks.delete(blockIndex)
      session.residentBlocks.set(blockIndex, resident)
      return Promise.resolve(resident)
    }
    const inFlight = session.inFlightBlocks.get(blockIndex)
    if (inFlight) {
      return inFlight
    }
    const request = this.loadBlock(session, blockIndex)
      .then((block) => {
        this.addResidentBlock(session, blockIndex, block)
        return block
      })
      .finally(() => session.inFlightBlocks.delete(blockIndex))
    session.inFlightBlocks.set(blockIndex, request)
    return request
  }

  private async loadBlock(session: RemoteCacheSession, blockIndex: number): Promise<Uint8Array> {
    const length = getRangeSize(blockIndex, session)
    if (length <= 0) {
      throw new Error(`Remote MCAP block ${blockIndex} is outside the file.`)
    }
    if (session.storedBlocks.has(blockIndex) && session.handle) {
      try {
        const data = new Uint8Array(length)
        const bytesRead = session.handle.read(data, { at: blockIndex * session.blockSize })
        if (bytesRead === length) {
          return data
        }
        session.storedBlocks.delete(blockIndex)
      }
      catch (error) {
        this.disableSessionFile(session, error)
      }
    }

    const data = await this.fetchBlock(session, blockIndex, length)
    if (session.handle) {
      try {
        const bytesWritten = session.handle.write(data, { at: blockIndex * session.blockSize })
        if (bytesWritten === data.byteLength) {
          session.handle.flush()
          session.storedBlocks.add(blockIndex)
        }
      }
      catch (error) {
        this.disableSessionFile(session, error)
      }
    }
    return data
  }

  private async fetchBlock(session: RemoteCacheSession, blockIndex: number, length: number): Promise<Uint8Array> {
    const start = blockIndex * session.blockSize
    const end = start + length - 1
    let delayMs = 250
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        const response = await fetch(session.url, {
          headers: { Range: `bytes=${start}-${end}` },
          signal: session.abortController.signal,
        })
        if (RETRYABLE_STATUS.has(response.status) && attempt < 4) {
          await response.body?.cancel().catch(() => undefined)
          await waitForRetry(delayMs, session.abortController.signal)
          delayMs = Math.min(delayMs * 2, 2000)
          continue
        }
        if (response.status !== 206) {
          await response.body?.cancel().catch(() => undefined)
          throw new Error(`The remote server ignored byte range ${start}-${end}.`)
        }
        const range = parseContentRange(response.headers.get('Content-Range'))
        if (!range || range.start !== start || range.end !== end || (range.size !== undefined && range.size !== session.size)) {
          await response.body?.cancel().catch(() => undefined)
          throw new Error(`Invalid Content-Range response for bytes ${start}-${end}.`)
        }
        const data = new Uint8Array(await response.arrayBuffer())
        if (data.byteLength !== length) {
          throw new Error(`Short remote MCAP response: expected ${length} bytes, received ${data.byteLength}.`)
        }
        return data
      }
      catch (error) {
        if (session.abortController.signal.aborted || attempt === 4) {
          throw error
        }
        await waitForRetry(delayMs, session.abortController.signal)
        delayMs = Math.min(delayMs * 2, 2000)
      }
    }
    throw new Error('Remote MCAP request failed.')
  }

  private addResidentBlock(session: RemoteCacheSession, blockIndex: number, data: Uint8Array): void {
    session.residentBlocks.set(blockIndex, data)
    session.residentBytes += data.byteLength
    while (session.residentBytes > MEMORY_CACHE_BYTES && session.residentBlocks.size > 1) {
      const oldestKey = session.residentBlocks.keys().next().value as number | undefined
      if (oldestKey === undefined) {
        return
      }
      const oldest = session.residentBlocks.get(oldestKey)
      session.residentBlocks.delete(oldestKey)
      session.residentBytes -= oldest?.byteLength ?? 0
    }
  }

  private disableSessionFile(session: RemoteCacheSession, error: unknown): void {
    console.warn('OPFS session cache is unavailable; continuing with the shared memory cache.', error)
    session.handle?.close()
    session.handle = null
    session.storedBlocks.clear()
  }

  private requireSession(sessionId: string): RemoteCacheSession {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error('Remote MCAP cache session is no longer available.')
    }
    return session
  }

  private async probeSize(url: string): Promise<number> {
    const response = await fetch(url, { headers: { Range: 'bytes=0-0' } })
    if (response.status !== 206) {
      await response.body?.cancel().catch(() => undefined)
      throw new Error('The remote server does not support HTTP byte-range requests (expected 206 Partial Content).')
    }
    const range = parseContentRange(response.headers.get('Content-Range'))
    await response.body?.cancel().catch(() => undefined)
    if (!range?.size || range.start !== 0 || range.end !== 0 || !Number.isSafeInteger(range.size)) {
      throw new Error('The remote server did not expose a valid Content-Range header. Check its CORS configuration.')
    }
    return range.size
  }
}

expose(new RemoteCacheWorker())
