export interface PointCloudData {
  positions: Float32Array
  colors: Float32Array
  pointCount: number
  minZ: number
  maxZ: number
  minIntensity: number
  maxIntensity: number
  hasIntensity: boolean
}

export type ColorMode = 'height' | 'intensity' | 'solid'

export interface PointCloudParseOptions {
  colorMode: ColorMode
  solidColor?: string
  maxPoints?: number
}

export interface PointCloudOutputBuffers {
  positions: Float32Array
  colors: Float32Array
}

// Convert hex string to RGB [0..1]
function hexToRgb(hex: string): [number, number, number] {
  let cleanHex = hex.replace('#', '')
  if (cleanHex.length === 3) {
    cleanHex = cleanHex
      .split('')
      .map(c => c + c)
      .join('')
  }
  const num = Number.parseInt(cleanHex, 16)
  if (Number.isNaN(num)) {
    return [0, 1, 0.8] // Default cyan fallback
  }
  const r = ((num >> 16) & 255) / 255
  const g = ((num >> 8) & 255) / 255
  const b = (num & 255) / 255
  return [r, g, b]
}

// Color map gradient helper: val between 0 and 1
function getSpectrumColor(val: number): [number, number, number] {
  const clamped = Math.max(0, Math.min(1, val))
  // Blue -> Cyan -> Green -> Yellow -> Red
  if (clamped < 0.25) {
    const t = clamped / 0.25
    return [0, t, 1]
  }
  else if (clamped < 0.5) {
    const t = (clamped - 0.25) / 0.25
    return [0, 1, 1 - t]
  }
  else if (clamped < 0.75) {
    const t = (clamped - 0.5) / 0.25
    return [t, 1, 0]
  }
  else {
    const t = (clamped - 0.75) / 0.25
    return [1, 1 - t * 0.8, 0]
  }
}

function parseFieldType(typeInput: any): number {
  if (typeof typeInput === 'number') {
    return typeInput
  }
  if (typeof typeInput === 'string') {
    const t = typeInput.toUpperCase()
    if (t.includes('FLOAT32') || t === '7')
      return 7
    if (t.includes('FLOAT64') || t === '8')
      return 8
    if (t.includes('UINT32') || t === '6')
      return 6
    if (t.includes('INT32') || t === '5')
      return 5
    if (t.includes('UINT16') || t === '4')
      return 4
    if (t.includes('INT16') || t === '3')
      return 3
    if (t.includes('UINT8') || t === '2')
      return 2
    if (t.includes('INT8') || t === '1')
      return 1
  }
  return 7
}

function readFieldValue(view: DataView, offset: number, type: any, littleEndian: boolean): number {
  const numericType = parseFieldType(type)
  if (offset < 0 || offset >= view.byteLength) {
    return 0
  }
  switch (numericType) {
    case 1: // INT8
      return view.getInt8(offset)
    case 2: // UINT8
      return view.getUint8(offset)
    case 3: // INT16
      return offset + 2 <= view.byteLength ? view.getInt16(offset, littleEndian) : 0
    case 4: // UINT16
      return offset + 2 <= view.byteLength ? view.getUint16(offset, littleEndian) : 0
    case 5: // INT32
      return offset + 4 <= view.byteLength ? view.getInt32(offset, littleEndian) : 0
    case 6: // UINT32
      return offset + 4 <= view.byteLength ? view.getUint32(offset, littleEndian) : 0
    case 7: // FLOAT32
      return offset + 4 <= view.byteLength ? view.getFloat32(offset, littleEndian) : 0
    case 8: // FLOAT64
      return offset + 8 <= view.byteLength ? view.getFloat64(offset, littleEndian) : 0
    default:
      return 0
  }
}

// Module-level reusable buffer for intensity values (avoids per-frame allocation)
let _intensityBuf = new Float32Array(0)

export function parsePointCloud(
  payload: any,
  options: PointCloudParseOptions,
  output?: PointCloudOutputBuffers,
): PointCloudData | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const colorMode = options.colorMode || 'height'
  const maxPointsCap = options.maxPoints || 500000
  const solidRgb = hexToRgb(options.solidColor || '#00ffcc')

  // Case 1: sensor_msgs/PointCloud2 & foxglove.PointCloud
  const dataRaw = payload.data
  const fields = payload.fields
  const pointStep = payload.point_step ?? payload.point_stride

  if (dataRaw && Array.isArray(fields) && typeof pointStep === 'number' && pointStep > 0) {
    let uint8: Uint8Array
    if (dataRaw instanceof Uint8Array) {
      uint8 = dataRaw
    }
    else if (ArrayBuffer.isView(dataRaw)) {
      uint8 = new Uint8Array(dataRaw.buffer, dataRaw.byteOffset, dataRaw.byteLength)
    }
    else if (Array.isArray(dataRaw)) {
      uint8 = new Uint8Array(dataRaw)
    }
    else {
      return null
    }

    const totalRawPoints = Math.floor(uint8.byteLength / pointStep)
    if (totalRawPoints === 0) {
      return null
    }

    // Downsampling step if points exceed maxPointsCap
    const step = Math.max(1, Math.ceil(totalRawPoints / maxPointsCap))
    const expectedPoints = Math.ceil(totalRawPoints / step)

    // Locate x, y, z, intensity fields
    let xOffset: number | null = null
    let xType: any = 7
    let yOffset: number | null = null
    let yType: any = 7
    let zOffset: number | null = null
    let zType: any = 7
    let intensityOffset: number | null = null
    let intensityType: any = 7

    for (const f of fields) {
      const name = String(f.name).toLowerCase()
      const type = f.datatype ?? f.type ?? 7
      const offset = Number(f.offset ?? 0)
      if (name === 'x') {
        xOffset = offset
        xType = type
      }
      else if (name === 'y') {
        yOffset = offset
        yType = type
      }
      else if (name === 'z') {
        zOffset = offset
        zType = type
      }
      else if (name === 'intensity' || name === 'i') {
        intensityOffset = offset
        intensityType = type
      }
    }

    if (xOffset === null || yOffset === null || zOffset === null) {
      return null
    }

    const littleEndian = !(payload.is_bigendian ?? false)
    const view = new DataView(uint8.buffer, uint8.byteOffset, uint8.byteLength)

    const neededLen = expectedPoints * 3
    const positions = output?.positions && output.positions.length >= neededLen
      ? output.positions
      : new Float32Array(neededLen)
    const colors = output?.colors && output.colors.length >= neededLen
      ? output.colors
      : new Float32Array(neededLen)

    let intensities: Float32Array | null = null
    if (intensityOffset !== null) {
      if (_intensityBuf.length < expectedPoints) {
        _intensityBuf = new Float32Array(expectedPoints)
      }
      intensities = _intensityBuf
    }

    let validCount = 0
    let minZ = Infinity
    let maxZ = -Infinity
    let minIntensity = Infinity
    let maxIntensity = -Infinity

    for (let i = 0; i < totalRawPoints; i += step) {
      const byteOffset = i * pointStep
      if (byteOffset + pointStep > uint8.byteLength) {
        break
      }

      const x = readFieldValue(view, byteOffset + xOffset, xType, littleEndian)
      const y = readFieldValue(view, byteOffset + yOffset, yType, littleEndian)
      const z = readFieldValue(view, byteOffset + zOffset, zType, littleEndian)

      // Skip NaN or Infinity invalid points
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        continue
      }

      positions[validCount * 3] = x
      positions[validCount * 3 + 1] = y
      positions[validCount * 3 + 2] = z

      if (z < minZ) {
        minZ = z
      }
      if (z > maxZ) {
        maxZ = z
      }

      if (intensities && intensityOffset !== null) {
        const intensity = readFieldValue(view, byteOffset + intensityOffset, intensityType, littleEndian)
        if (Number.isFinite(intensity)) {
          intensities[validCount] = intensity
          if (intensity < minIntensity) {
            minIntensity = intensity
          }
          if (intensity > maxIntensity) {
            maxIntensity = intensity
          }
        }
      }

      validCount++
    }

    if (validCount === 0) {
      return null
    }

    // Apply colors based on colorMode
    const zRange = maxZ > minZ ? maxZ - minZ : 1.0
    const intensityRange = maxIntensity > minIntensity ? maxIntensity - minIntensity : 1.0

    for (let i = 0; i < validCount; i++) {
      let r = solidRgb[0]
      let g = solidRgb[1]
      let b = solidRgb[2]

      if (colorMode === 'height') {
        const z = positions[i * 3 + 2]
        const normZ = (z - minZ) / zRange
        ;[r, g, b] = getSpectrumColor(normZ)
      }
      else if (colorMode === 'intensity' && intensities) {
        const val = intensities[i]
        const normVal = (val - minIntensity) / intensityRange
        ;[r, g, b] = getSpectrumColor(normVal)
      }

      colors[i * 3] = r
      colors[i * 3 + 1] = g
      colors[i * 3 + 2] = b
    }

    return {
      positions: positions.subarray(0, validCount * 3),
      colors: colors.subarray(0, validCount * 3),
      pointCount: validCount,
      minZ: minZ === Infinity ? 0 : minZ,
      maxZ: maxZ === -Infinity ? 0 : maxZ,
      minIntensity: minIntensity === Infinity ? 0 : minIntensity,
      maxIntensity: maxIntensity === -Infinity ? 0 : maxIntensity,
      hasIntensity: intensityOffset !== null,
    }
  }

  // Case 2: ROS 1 sensor_msgs/PointCloud (array of {x, y, z})
  if (Array.isArray(payload.points)) {
    const pts = payload.points
    const totalRawPoints = pts.length
    if (totalRawPoints === 0) {
      return null
    }

    const step = Math.max(1, Math.ceil(totalRawPoints / maxPointsCap))
    const expectedPoints = Math.ceil(totalRawPoints / step)

    const neededLen = expectedPoints * 3
    const positions = output?.positions && output.positions.length >= neededLen
      ? output.positions
      : new Float32Array(neededLen)
    const colors = output?.colors && output.colors.length >= neededLen
      ? output.colors
      : new Float32Array(neededLen)

    let validCount = 0
    let minZ = Infinity
    let maxZ = -Infinity

    for (let i = 0; i < totalRawPoints; i += step) {
      const p = pts[i]
      if (!p || typeof p.x !== 'number' || typeof p.y !== 'number' || typeof p.z !== 'number') {
        continue
      }
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) {
        continue
      }

      positions[validCount * 3] = p.x
      positions[validCount * 3 + 1] = p.y
      positions[validCount * 3 + 2] = p.z

      if (p.z < minZ) {
        minZ = p.z
      }
      if (p.z > maxZ) {
        maxZ = p.z
      }

      validCount++
    }

    if (validCount === 0) {
      return null
    }

    const zRange = maxZ > minZ ? maxZ - minZ : 1.0
    for (let i = 0; i < validCount; i++) {
      let r = solidRgb[0]
      let g = solidRgb[1]
      let b = solidRgb[2]

      if (colorMode === 'height') {
        const z = positions[i * 3 + 2]
        const normZ = (z - minZ) / zRange
        ;[r, g, b] = getSpectrumColor(normZ)
      }

      colors[i * 3] = r
      colors[i * 3 + 1] = g
      colors[i * 3 + 2] = b
    }

    return {
      positions: positions.subarray(0, validCount * 3),
      colors: colors.subarray(0, validCount * 3),
      pointCount: validCount,
      minZ: minZ === Infinity ? 0 : minZ,
      maxZ: maxZ === -Infinity ? 0 : maxZ,
      minIntensity: 0,
      maxIntensity: 0,
      hasIntensity: false,
    }
  }

  return null
}
