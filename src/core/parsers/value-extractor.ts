export function createNumericValueAccessor(path: string): (obj: any) => number | null {
  const normalizedPath = path.replace(/\[(\w+)\]/g, '.$1')
  const parts = normalizedPath.split('.').filter(Boolean)

  return (obj: any) => {
    if (obj === null || obj === undefined || parts.length === 0) {
      return null
    }
    let current = obj
    for (const part of parts) {
      if (current === null || current === undefined) {
        return null
      }
      current = current[part]
    }

    if (current === null || current === undefined) {
      return null
    }

    const val = Number(current)
    return Number.isNaN(val) ? null : val
  }
}

export function getNumericFields(obj: any, parentPath = ''): string[] {
  if (obj === null || obj === undefined) {
    return []
  }

  if (typeof obj === 'number') {
    return parentPath ? [parentPath] : []
  }

  const fields: string[] = []

  if (Array.isArray(obj)) {
    const maxLen = Math.min(obj.length, 16)
    for (let i = 0; i < maxLen; i++) {
      const currentPath = parentPath ? `${parentPath}[${i}]` : `[${i}]`
      fields.push(...getNumericFields(obj[i], currentPath))
    }
    return fields
  }

  if (typeof obj === 'object') {
    if (obj instanceof Uint8Array || ArrayBuffer.isView(obj)) {
      return []
    }

    for (const key of Object.keys(obj)) {
      const val = obj[key]
      const currentPath = parentPath ? `${parentPath}.${key}` : key
      fields.push(...getNumericFields(val, currentPath))
    }
    return fields
  }

  return []
}
