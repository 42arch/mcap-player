export const PREPARED_POINT_CLOUD_FORMAT = 'mcap-player/point-cloud-v1'

export interface PreparedPointCloud {
  format: typeof PREPARED_POINT_CLOUD_FORMAT
  frameId?: string
  positions: Float32Array
  intensities?: Float32Array
  pointCount: number
  minX: number
  maxX: number
  minY: number
  maxY: number
  minZ: number
  maxZ: number
  minIntensity: number
  maxIntensity: number
  hasIntensity: boolean
}

export interface PointCloudData {
  positions: Float32Array
  colors: Float32Array
  pointCount: number
  minX: number
  maxX: number
  minY: number
  maxY: number
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

interface PointField {
  datatype?: unknown
  name?: unknown
  offset?: unknown
  type?: unknown
}

type UnknownRecord = Record<string, unknown>

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object'
    ? value as UnknownRecord
    : null
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function normalizeMaxPoints(value: number | undefined): number {
  return Math.max(1, Math.floor(value ?? 500000))
}

function extractFrameId(payload: UnknownRecord): string | undefined {
  const header = asRecord(payload.header)
  const value = payload.frame_id
    ?? payload.frameId
    ?? header?.frame_id
    ?? header?.frameId
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function hexToRgb(hex: string): [number, number, number] {
  let cleanHex = hex.replace('#', '')
  if (cleanHex.length === 3) {
    cleanHex = cleanHex
      .split('')
      .map(character => character + character)
      .join('')
  }
  const value = Number.parseInt(cleanHex, 16)
  if (Number.isNaN(value)) {
    return [0, 1, 0.8]
  }
  return [
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255,
  ]
}

function getSpectrumColor(value: number): [number, number, number] {
  const clamped = Math.max(0, Math.min(1, value))
  if (clamped < 0.25) {
    return [0, clamped / 0.25, 1]
  }
  if (clamped < 0.5) {
    return [0, 1, 1 - (clamped - 0.25) / 0.25]
  }
  if (clamped < 0.75) {
    return [(clamped - 0.5) / 0.25, 1, 0]
  }
  return [1, 1 - ((clamped - 0.75) / 0.25) * 0.8, 0]
}

function parseFieldType(typeInput: unknown): number {
  if (typeof typeInput === 'number') {
    return typeInput
  }
  if (typeof typeInput !== 'string') {
    return 7
  }
  const type = typeInput.toUpperCase()
  if (type.includes('FLOAT32') || type === '7')
    return 7
  if (type.includes('FLOAT64') || type === '8')
    return 8
  if (type.includes('UINT32') || type === '6')
    return 6
  if (type.includes('INT32') || type === '5')
    return 5
  if (type.includes('UINT16') || type === '4')
    return 4
  if (type.includes('INT16') || type === '3')
    return 3
  if (type.includes('UINT8') || type === '2')
    return 2
  if (type.includes('INT8') || type === '1')
    return 1
  return 7
}

function readFieldValue(view: DataView, offset: number, type: unknown, littleEndian: boolean): number {
  if (offset < 0 || offset >= view.byteLength) {
    return Number.NaN
  }
  switch (parseFieldType(type)) {
    case 1:
      return view.getInt8(offset)
    case 2:
      return view.getUint8(offset)
    case 3:
      return offset + 2 <= view.byteLength ? view.getInt16(offset, littleEndian) : Number.NaN
    case 4:
      return offset + 2 <= view.byteLength ? view.getUint16(offset, littleEndian) : Number.NaN
    case 5:
      return offset + 4 <= view.byteLength ? view.getInt32(offset, littleEndian) : Number.NaN
    case 6:
      return offset + 4 <= view.byteLength ? view.getUint32(offset, littleEndian) : Number.NaN
    case 7:
      return offset + 4 <= view.byteLength ? view.getFloat32(offset, littleEndian) : Number.NaN
    case 8:
      return offset + 8 <= view.byteLength ? view.getFloat64(offset, littleEndian) : Number.NaN
    default:
      return Number.NaN
  }
}

export function isPreparedPointCloud(value: unknown): value is PreparedPointCloud {
  const record = asRecord(value)
  return record?.format === PREPARED_POINT_CLOUD_FORMAT
    && record.positions instanceof Float32Array
    && typeof record.pointCount === 'number'
}

function finishPreparedPointCloud(
  frameId: string | undefined,
  positions: Float32Array,
  intensities: Float32Array | undefined,
  pointCount: number,
): PreparedPointCloud | null {
  if (pointCount === 0) {
    return null
  }

  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  let minIntensity = Infinity
  let maxIntensity = -Infinity

  for (let index = 0; index < pointCount; index++) {
    const offset = index * 3
    const x = positions[offset]
    const y = positions[offset + 1]
    const z = positions[offset + 2]
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
    minZ = Math.min(minZ, z)
    maxZ = Math.max(maxZ, z)

    const intensity = intensities?.[index]
    if (intensity !== undefined && Number.isFinite(intensity)) {
      minIntensity = Math.min(minIntensity, intensity)
      maxIntensity = Math.max(maxIntensity, intensity)
    }
  }

  return {
    format: PREPARED_POINT_CLOUD_FORMAT,
    frameId,
    positions,
    intensities,
    pointCount,
    minX,
    maxX,
    minY,
    maxY,
    minZ,
    maxZ,
    minIntensity: minIntensity === Infinity ? 0 : minIntensity,
    maxIntensity: maxIntensity === -Infinity ? 0 : maxIntensity,
    hasIntensity: intensities !== undefined,
  }
}

function downsamplePreparedPointCloud(
  pointCloud: PreparedPointCloud,
  maxPoints: number,
): PreparedPointCloud {
  if (pointCloud.pointCount <= maxPoints) {
    return pointCloud
  }
  const step = Math.ceil(pointCloud.pointCount / maxPoints)
  const pointCount = Math.ceil(pointCloud.pointCount / step)
  const positions = new Float32Array(pointCount * 3)
  const intensities = pointCloud.hasIntensity ? new Float32Array(pointCount) : undefined

  let targetIndex = 0
  for (let sourceIndex = 0; sourceIndex < pointCloud.pointCount; sourceIndex += step) {
    positions.set(pointCloud.positions.subarray(sourceIndex * 3, sourceIndex * 3 + 3), targetIndex * 3)
    if (intensities && pointCloud.intensities) {
      intensities[targetIndex] = pointCloud.intensities[sourceIndex]
    }
    targetIndex++
  }

  return finishPreparedPointCloud(
    pointCloud.frameId,
    positions,
    intensities,
    targetIndex,
  )!
}

function prepareBinaryPointCloud(payload: UnknownRecord, maxPoints: number): PreparedPointCloud | null {
  const fields = Array.isArray(payload.fields) ? payload.fields as PointField[] : null
  const pointStep = finiteNumber(payload.point_step ?? payload.point_stride)
  const dataRaw = payload.data
  if (!fields || pointStep === null || pointStep <= 0) {
    return null
  }

  const bytes = ArrayBuffer.isView(dataRaw)
    ? new Uint8Array(dataRaw.buffer, dataRaw.byteOffset, dataRaw.byteLength)
    : Array.isArray(dataRaw)
      ? Uint8Array.from(dataRaw)
      : null
  if (!bytes) {
    return null
  }
  const rawPointCount = Math.floor(bytes.byteLength / pointStep)
  if (rawPointCount === 0) {
    return null
  }

  let xField: PointField | undefined
  let yField: PointField | undefined
  let zField: PointField | undefined
  let intensityField: PointField | undefined
  for (const field of fields) {
    const name = String(field.name).toLowerCase()
    if (name === 'x')
      xField = field
    else if (name === 'y')
      yField = field
    else if (name === 'z')
      zField = field
    else if (name === 'intensity' || name === 'i')
      intensityField = field
  }
  if (!xField || !yField || !zField) {
    return null
  }

  const step = Math.max(1, Math.ceil(rawPointCount / maxPoints))
  const capacity = Math.ceil(rawPointCount / step)
  const positions = new Float32Array(capacity * 3)
  const intensities = intensityField ? new Float32Array(capacity) : undefined
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const littleEndian = payload.is_bigendian !== true
  let pointCount = 0

  for (let rawIndex = 0; rawIndex < rawPointCount; rawIndex += step) {
    const baseOffset = rawIndex * pointStep
    const x = readFieldValue(view, baseOffset + Number(xField.offset ?? 0), xField.datatype ?? xField.type, littleEndian)
    const y = readFieldValue(view, baseOffset + Number(yField.offset ?? 0), yField.datatype ?? yField.type, littleEndian)
    const z = readFieldValue(view, baseOffset + Number(zField.offset ?? 0), zField.datatype ?? zField.type, littleEndian)
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      continue
    }

    const targetOffset = pointCount * 3
    positions[targetOffset] = x
    positions[targetOffset + 1] = y
    positions[targetOffset + 2] = z
    if (intensities && intensityField) {
      const intensity = readFieldValue(
        view,
        baseOffset + Number(intensityField.offset ?? 0),
        intensityField.datatype ?? intensityField.type,
        littleEndian,
      )
      intensities[pointCount] = Number.isFinite(intensity) ? intensity : 0
    }
    pointCount++
  }

  const compactPositions = pointCount === capacity
    ? positions
    : positions.slice(0, pointCount * 3)
  const compactIntensities = intensities
    ? (pointCount === capacity ? intensities : intensities.slice(0, pointCount))
    : undefined
  return finishPreparedPointCloud(
    extractFrameId(payload),
    compactPositions,
    compactIntensities,
    pointCount,
  )
}

function preparePointArray(payload: UnknownRecord, maxPoints: number): PreparedPointCloud | null {
  if (!Array.isArray(payload.points) || payload.points.length === 0) {
    return null
  }
  const step = Math.max(1, Math.ceil(payload.points.length / maxPoints))
  const capacity = Math.ceil(payload.points.length / step)
  const positions = new Float32Array(capacity * 3)
  let pointCount = 0

  for (let rawIndex = 0; rawIndex < payload.points.length; rawIndex += step) {
    const point = asRecord(payload.points[rawIndex])
    const x = finiteNumber(point?.x)
    const y = finiteNumber(point?.y)
    const z = finiteNumber(point?.z)
    if (x === null || y === null || z === null) {
      continue
    }
    const targetOffset = pointCount * 3
    positions[targetOffset] = x
    positions[targetOffset + 1] = y
    positions[targetOffset + 2] = z
    pointCount++
  }

  return finishPreparedPointCloud(
    extractFrameId(payload),
    pointCount === capacity ? positions : positions.slice(0, pointCount * 3),
    undefined,
    pointCount,
  )
}

export function preparePointCloud(payload: unknown, maxPointsInput?: number): PreparedPointCloud | null {
  const maxPoints = normalizeMaxPoints(maxPointsInput)
  if (isPreparedPointCloud(payload)) {
    return downsamplePreparedPointCloud(payload, maxPoints)
  }
  const record = asRecord(payload)
  if (!record) {
    return null
  }
  return prepareBinaryPointCloud(record, maxPoints) ?? preparePointArray(record, maxPoints)
}

export function renderPreparedPointCloud(
  pointCloud: PreparedPointCloud,
  options: PointCloudParseOptions,
  output?: PointCloudOutputBuffers,
): PointCloudData | null {
  const maxPoints = normalizeMaxPoints(options.maxPoints)
  const sampled = downsamplePreparedPointCloud(pointCloud, maxPoints)
  const requiredLength = sampled.pointCount * 3
  const positions = output?.positions && output.positions.length >= requiredLength
    ? output.positions
    : new Float32Array(requiredLength)
  const colors = output?.colors && output.colors.length >= requiredLength
    ? output.colors
    : new Float32Array(requiredLength)
  positions.set(sampled.positions.subarray(0, requiredLength), 0)

  const solidColor = hexToRgb(options.solidColor || '#00ffcc')
  const zRange = sampled.maxZ > sampled.minZ ? sampled.maxZ - sampled.minZ : 1
  const intensityRange = sampled.maxIntensity > sampled.minIntensity
    ? sampled.maxIntensity - sampled.minIntensity
    : 1

  for (let index = 0; index < sampled.pointCount; index++) {
    let color = solidColor
    if (options.colorMode === 'height') {
      color = getSpectrumColor((positions[index * 3 + 2] - sampled.minZ) / zRange)
    }
    else if (options.colorMode === 'intensity' && sampled.intensities) {
      color = getSpectrumColor((sampled.intensities[index] - sampled.minIntensity) / intensityRange)
    }
    colors.set(color, index * 3)
  }

  return {
    positions: positions.subarray(0, requiredLength),
    colors: colors.subarray(0, requiredLength),
    pointCount: sampled.pointCount,
    minX: sampled.minX,
    maxX: sampled.maxX,
    minY: sampled.minY,
    maxY: sampled.maxY,
    minZ: sampled.minZ,
    maxZ: sampled.maxZ,
    minIntensity: sampled.minIntensity,
    maxIntensity: sampled.maxIntensity,
    hasIntensity: sampled.hasIntensity,
  }
}

export function parsePointCloud(
  payload: unknown,
  options: PointCloudParseOptions,
  output?: PointCloudOutputBuffers,
): PointCloudData | null {
  const prepared = preparePointCloud(payload, options.maxPoints)
  return prepared ? renderPreparedPointCloud(prepared, options, output) : null
}
