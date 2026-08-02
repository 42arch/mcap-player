import { describe, expect, it, vi } from 'vitest'
import { DisposableResourceCache } from './disposable-resource-cache'

interface TestResource {
  id: string
}

describe('disposable resource cache', () => {
  it('deduplicates concurrent loads and defers reset disposal until all consumers release', async () => {
    const dispose = vi.fn()
    const load = vi.fn(async () => ({ id: 'shared' }))
    const cache = new DisposableResourceCache<TestResource>(2, dispose)

    const [first, second] = await Promise.all([
      cache.acquire('model', load),
      cache.acquire('model', load),
    ])
    cache.clear()

    expect(load).toHaveBeenCalledTimes(1)
    expect(first.resource).toBe(second.resource)
    expect(dispose).not.toHaveBeenCalled()

    first.release()
    expect(dispose).not.toHaveBeenCalled()
    second.release()
    second.release()
    expect(dispose).toHaveBeenCalledOnce()
    expect(dispose).toHaveBeenCalledWith(first.resource)
  })

  it('evicts the least-recently-used idle resource above the capacity limit', async () => {
    const dispose = vi.fn()
    const cache = new DisposableResourceCache<TestResource>(2, dispose)
    const load = (id: string) => async () => ({ id })

    const first = await cache.acquire('first', load('first'))
    first.release()
    const second = await cache.acquire('second', load('second'))
    second.release()
    const third = await cache.acquire('third', load('third'))

    expect(dispose).toHaveBeenCalledOnce()
    expect(dispose).toHaveBeenCalledWith(first.resource)
    third.release()
  })

  it('releases a load that completes after its dataset was reset', async () => {
    const dispose = vi.fn()
    const cache = new DisposableResourceCache<TestResource>(1, dispose)
    let resolveLoad: ((resource: TestResource) => void) | undefined
    const handlePromise = cache.acquire('pending', () => new Promise<TestResource>((resolve) => {
      resolveLoad = resolve
    }))

    cache.clear()
    await Promise.resolve()
    resolveLoad?.({ id: 'late' })
    const handle = await handlePromise

    expect(dispose).not.toHaveBeenCalled()
    handle.release()
    expect(dispose).toHaveBeenCalledWith(handle.resource)
  })

  it('allows a failed resource to be loaded again', async () => {
    const cache = new DisposableResourceCache<TestResource>(1, vi.fn())
    const failedLoad = vi.fn().mockRejectedValueOnce(new Error('load failed'))

    await expect(cache.acquire('retryable', failedLoad)).rejects.toThrow('load failed')

    const successfulLoad = vi.fn(async () => ({ id: 'recovered' }))
    const handle = await cache.acquire('retryable', successfulLoad)
    expect(handle.resource.id).toBe('recovered')
    handle.release()
  })
})
