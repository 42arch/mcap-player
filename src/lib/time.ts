export function formatNanoseconds(ns: bigint, digits = 9): string {
  const ms = Number(ns / 1_000_000n)
  const date = new Date(ms)
  const pad = (n: number, width = 2) => String(n).padStart(width, '0')

  const yyyy = date.getFullYear()
  const mm = pad(date.getMonth() + 1)
  const dd = pad(date.getDate())
  const hh = pad(date.getHours())
  const min = pad(date.getMinutes())
  const ss = pad(date.getSeconds())

  if (digits <= 0) {
    return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`
  }

  // Extract remaining nanoseconds truncated to requested precision
  const extraNs = pad(Number(ns % 1_000_000_000n), 9)
  const subSec = extraNs.slice(0, digits)

  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}.${subSec}`
}

export function formatDuration(ns: bigint, digits = 9): string {
  const pad = (n: number, width = 2) => String(n).padStart(width, '0')
  const totalSecs = Number(ns / 1_000_000_000n)
  const hours = Math.floor(totalSecs / 3600)
  const mins = Math.floor((totalSecs % 3600) / 60)
  const secs = totalSecs % 60

  if (digits <= 0) {
    return `${pad(hours)}:${pad(mins)}:${pad(secs)}`
  }

  const extraNs = pad(Number(ns % 1_000_000_000n), 9)
  const subSec = extraNs.slice(0, digits)
  return `${pad(hours)}:${pad(mins)}:${pad(secs)}.${subSec}`
}

export function formatBytes(bytes: number): string {
  if (bytes === 0)
    return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`
}
