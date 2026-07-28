export interface H264ParseResult {
  bytes: Uint8Array
  isKeyframe: boolean
  spsPps: Uint8Array | null
}

export function isH264Format(format?: string): boolean {
  if (!format) {
    return false
  }
  const formatVal = String(format).split(';')[0].toLowerCase().trim()
  return formatVal === 'h264' || formatVal === 'h-264' || formatVal === 'avc1'
}

export function ensureAnnexB(data: Uint8Array): Uint8Array {
  if (data.length < 4) {
    return data
  }

  // Check if already Annex B
  if (
    (data[0] === 0 && data[1] === 0 && data[2] === 1)
    || (data[0] === 0 && data[1] === 0 && data[2] === 0 && data[3] === 1)
  ) {
    return data
  }

  const result = new Uint8Array(data.length)
  result.set(data)

  let pos = 0
  while (pos + 4 < result.length) {
    const nalLength = (result[pos] << 24) | (result[pos + 1] << 16) | (result[pos + 2] << 8) | result[pos + 3]
    if (nalLength > 0 && pos + 4 + nalLength <= result.length) {
      result[pos] = 0
      result[pos + 1] = 0
      result[pos + 2] = 0
      result[pos + 3] = 1
      pos += 4 + nalLength
    }
    else {
      break
    }
  }

  return result
}

export function checkH264IsKeyframe(data: Uint8Array): boolean {
  if (data.length < 4) {
    return false
  }

  // 1. Check Annex B
  for (let i = 0; i < data.length - 4; i++) {
    if (
      (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 1)
      || (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 0 && data[i + 3] === 1)
    ) {
      const offset = data[i + 2] === 1 ? i + 3 : i + 4
      if (offset < data.length) {
        const nalType = data[offset] & 0x1F
        if (nalType === 5 || nalType === 7) {
          return true
        }
      }
    }
  }

  // 2. Check AVCC
  let pos = 0
  while (pos + 4 < data.length) {
    const len = (data[pos] << 24) | (data[pos + 1] << 16) | (data[pos + 2] << 8) | data[pos + 3]
    if (len > 0 && pos + 4 + len <= data.length) {
      const nalType = data[pos + 4] & 0x1F
      if (nalType === 5 || nalType === 7) {
        return true
      }
      pos += 4 + len
    }
    else {
      break
    }
  }

  return false
}

export function processH264Frame(data: Uint8Array): H264ParseResult {
  const bytes = ensureAnnexB(data)
  let _hasSps = false
  let _hasPps = false
  let hasIdr = false

  const spsPpsChunks: Uint8Array[] = []

  let pos = 0
  while (pos < bytes.length - 4) {
    if (
      (bytes[pos] === 0 && bytes[pos + 1] === 0 && bytes[pos + 2] === 1)
      || (bytes[pos] === 0 && bytes[pos + 1] === 0 && bytes[pos + 2] === 0 && bytes[pos + 3] === 1)
    ) {
      const startLen = bytes[pos + 2] === 1 ? 3 : 4
      const nalOffset = pos + startLen
      const nalType = bytes[nalOffset] & 0x1F

      let nextPos = bytes.length
      for (let j = nalOffset; j < bytes.length - 3; j++) {
        if (
          (bytes[j] === 0 && bytes[j + 1] === 0 && bytes[j + 2] === 1)
          || (bytes[j] === 0 && bytes[j + 1] === 0 && bytes[j + 2] === 0 && bytes[j + 3] === 1)
        ) {
          nextPos = j
          break
        }
      }

      if (nalType === 7) {
        _hasSps = true
        spsPpsChunks.push(bytes.subarray(pos, nextPos))
      }
      else if (nalType === 8) {
        _hasPps = true
        spsPpsChunks.push(bytes.subarray(pos, nextPos))
      }
      else if (nalType === 5) {
        hasIdr = true
      }

      pos = nextPos
    }
    else {
      pos++
    }
  }

  let spsPps: Uint8Array | null = null
  if (spsPpsChunks.length > 0) {
    const totalLen = spsPpsChunks.reduce((acc, chunk) => acc + chunk.length, 0)
    spsPps = new Uint8Array(totalLen)
    let offset = 0
    for (const chunk of spsPpsChunks) {
      spsPps.set(chunk, offset)
      offset += chunk.length
    }
  }

  return {
    bytes,
    isKeyframe: hasIdr || _hasSps,
    spsPps,
  }
}
