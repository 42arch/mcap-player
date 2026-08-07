import { describe, expect, it, vi } from 'vitest'
import { UrlReadable } from './url-readable'

describe('UrlReadable', () => {
  it('should fetch size using HEAD request', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-length': '2048' }),
    } as Response)

    const readable = new UrlReadable('https://example.com/test.mcap', { fetch: mockFetch as any })
    const size = await readable.size()

    expect(size).toBe(2048n)
    expect(mockFetch).toHaveBeenCalledWith('https://example.com/test.mcap', { method: 'HEAD' })
  })

  it('should fallback to GET range 0-0 if HEAD fails', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 405 } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 206,
        headers: new Headers({ 'content-range': 'bytes 0-0/4096' }),
      } as Response)

    const readable = new UrlReadable('https://example.com/test.mcap', { fetch: mockFetch as any })
    const size = await readable.size()

    expect(size).toBe(4096n)
  })

  it('should fetch data range correctly and use cache for small reads', async () => {
    const mockData = new Uint8Array([1, 2, 3, 4, 5])
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 206,
      arrayBuffer: async () => mockData.buffer,
    } as Response)

    const readable = new UrlReadable('https://example.com/test.mcap', { fetch: mockFetch as any, minFetchSize: 0 })

    const chunk1 = await readable.read(10n, 5n)
    expect(chunk1).toEqual(mockData)
    expect(mockFetch).toHaveBeenCalledWith('https://example.com/test.mcap', {
      headers: { Range: 'bytes=10-14' },
    })

    // Second read with same offset and size should hit cache
    mockFetch.mockClear()
    const chunk2 = await readable.read(10n, 5n)
    expect(chunk2).toEqual(mockData)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('should handle read errors gracefully', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    } as Response)

    const readable = new UrlReadable('https://example.com/test.mcap', { fetch: mockFetch as any })
    await expect(readable.read(0n, 10n)).rejects.toThrow('HTTP error 404')
  })
})
