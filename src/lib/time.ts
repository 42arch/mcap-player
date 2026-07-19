export function formatNanoseconds(ns: bigint): string {
  const ms = Number(ns / 1_000_000n)
  const date = new Date(ms)
  const pad = (n: number, width = 2) => String(n).padStart(width, '0')

  const yyyy = date.getFullYear()
  const mm = pad(date.getMonth() + 1)
  const dd = pad(date.getDate())
  const hh = pad(date.getHours())
  const min = pad(date.getMinutes())
  const ss = pad(date.getSeconds())

  // Extract remaining nanoseconds
  const extraNs = pad(Number(ns % 1_000_000_000n), 9)

  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}.${extraNs}`
}

export function formatDuration(ns: bigint): string {
  const pad = (n: number, width = 2) => String(n).padStart(width, '0')
  const totalSecs = Number(ns / 1_000_000_000n)
  const hours = Math.floor(totalSecs / 3600)
  const mins = Math.floor((totalSecs % 3600) / 60)
  const secs = totalSecs % 60
  const ms = pad(Number((ns % 1_000_000_000n) / 1_000_000n), 3)
  return `${pad(hours)}:${pad(mins)}:${pad(secs)}.${ms}`
}

export function formatBytes(bytes: number): string {
  if (bytes === 0)
    return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`
}
