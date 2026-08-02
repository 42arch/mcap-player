export const DEFAULT_MAX_PLOT_POINTS_PER_SERIES = 10_000

export interface PlotSeriesRequest {
  id: string
  topic: string
  path: string
}

export interface PlotSeriesData {
  id: string
  times: Float64Array
  values: Float64Array
}

interface BucketSample {
  timeNs: bigint
  value: number
}

interface ValueBucket {
  min: BucketSample
  max: BucketSample
}

export class PlotSeriesAccumulator {
  private readonly bucketCount: number
  private readonly durationNs: bigint
  private readonly maxPoints: number
  private readonly buckets = new Map<number, ValueBucket>()

  constructor(
    private readonly id: string,
    private readonly startTimeNs: bigint,
    endTimeNs: bigint,
    maxPoints = DEFAULT_MAX_PLOT_POINTS_PER_SERIES,
  ) {
    this.durationNs = endTimeNs > startTimeNs ? endTimeNs - startTimeNs : 1n
    this.maxPoints = Math.max(1, Math.trunc(maxPoints))
    this.bucketCount = Math.max(1, Math.floor(this.maxPoints / 2))
  }

  add(logTimeNs: bigint, value: number) {
    if (!Number.isFinite(value)) {
      return
    }
    const relativeTimeNs = logTimeNs <= this.startTimeNs
      ? 0n
      : logTimeNs - this.startTimeNs >= this.durationNs
        ? this.durationNs
        : logTimeNs - this.startTimeNs
    const bucketIndex = Math.min(
      this.bucketCount - 1,
      Number(relativeTimeNs * BigInt(this.bucketCount) / (this.durationNs + 1n)),
    )
    const sample = { timeNs: relativeTimeNs, value }
    const bucket = this.buckets.get(bucketIndex)
    if (!bucket) {
      this.buckets.set(bucketIndex, { min: sample, max: sample })
      return
    }
    if (value < bucket.min.value) {
      bucket.min = sample
    }
    if (value > bucket.max.value) {
      bucket.max = sample
    }
  }

  finish(): PlotSeriesData {
    const times: number[] = []
    const values: number[] = []
    const bucketIndexes = Array.from(this.buckets.keys()).sort((a, b) => a - b)
    for (const bucketIndex of bucketIndexes) {
      const bucket = this.buckets.get(bucketIndex)!
      const samples = bucket.min === bucket.max
        ? [bucket.min]
        : [bucket.min, bucket.max].sort((a, b) => a.timeNs < b.timeNs ? -1 : a.timeNs > b.timeNs ? 1 : 0)
      for (const sample of samples) {
        if (times.length >= this.maxPoints) {
          break
        }
        times.push(Number(sample.timeNs) / 1e9)
        values.push(sample.value)
      }
    }
    return {
      id: this.id,
      times: Float64Array.from(times),
      values: Float64Array.from(values),
    }
  }
}
