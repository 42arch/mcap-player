export interface SessionBlockProgress {
  storedBlockIndexes: number[]
  residentBlockIndexes: number[]
}

interface SessionBlockRequest {
  id: number
  type: 'get-block' | 'get-progress'
  blockIndex?: number
}

interface SessionBlockResponse {
  id: number
  result?: ArrayBuffer | SessionBlockProgress
  error?: string
}

export interface SessionBlockProvider {
  getSize(): Promise<number>
  getBlock(blockIndex: number): Promise<Uint8Array>
  getProgress(): Promise<SessionBlockProgress>
  close(): void
}

export class PortSessionBlockProvider implements SessionBlockProvider {
  private nextRequestId = 0
  private readonly pending = new Map<number, { resolve: (value: any) => void, reject: (reason: unknown) => void }>()

  constructor(
    private readonly port: MessagePort,
    private readonly size: number,
  ) {
    this.port.addEventListener('message', this.handleMessage)
    this.port.start()
  }

  async getSize(): Promise<number> {
    return this.size
  }

  async getBlock(blockIndex: number): Promise<Uint8Array> {
    const result = await this.request('get-block', blockIndex) as ArrayBuffer
    return new Uint8Array(result)
  }

  async getProgress(): Promise<SessionBlockProgress> {
    return this.request('get-progress') as Promise<SessionBlockProgress>
  }

  close(): void {
    this.port.removeEventListener('message', this.handleMessage)
    for (const { reject } of this.pending.values()) {
      reject(new DOMException('Remote MCAP request was canceled.', 'AbortError'))
    }
    this.pending.clear()
    this.port.close()
  }

  private request(type: SessionBlockRequest['type'], blockIndex?: number): Promise<unknown> {
    const id = ++this.nextRequestId
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      const request: SessionBlockRequest = { id, type, blockIndex }
      this.port.postMessage(request)
    })
  }

  private handleMessage = (event: MessageEvent<SessionBlockResponse>) => {
    const response = event.data
    const pending = this.pending.get(response.id)
    if (!pending) {
      return
    }
    this.pending.delete(response.id)
    if (response.error) {
      pending.reject(new Error(response.error))
      return
    }
    pending.resolve(response.result)
  }
}
