import { describe, expect, it } from 'vitest'
import { PlotSeriesAccumulator } from './plot-data'

describe('plotSeriesAccumulator', () => {
  it('keeps a fixed point budget for long streams', () => {
    const accumulator = new PlotSeriesAccumulator('speed', 0n, 10_000n, 100)
    for (let index = 0; index < 10_000; index++) {
      accumulator.add(BigInt(index), Math.sin(index))
    }

    const result = accumulator.finish()

    expect(result.times.length).toBeLessThanOrEqual(100)
    expect(result.values.length).toBe(result.times.length)
  })

  it('preserves minimum and maximum values inside a time bucket', () => {
    const accumulator = new PlotSeriesAccumulator('temperature', 0n, 100n, 2)
    accumulator.add(10n, 5)
    accumulator.add(20n, -2)
    accumulator.add(30n, 9)

    const result = accumulator.finish()

    expect(Array.from(result.times)).toEqual([2e-8, 3e-8])
    expect(Array.from(result.values)).toEqual([-2, 9])
  })

  it('ignores non-finite values', () => {
    const accumulator = new PlotSeriesAccumulator('value', 0n, 100n)
    accumulator.add(10n, Number.NaN)
    accumulator.add(20n, Number.POSITIVE_INFINITY)

    expect(accumulator.finish().times).toHaveLength(0)
  })
})
