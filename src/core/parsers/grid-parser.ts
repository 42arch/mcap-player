export type GridVector3 = [number, number, number]
export type GridQuaternion = [number, number, number, number]

export interface ParsedGrid {
  frameId: string
  position: GridVector3
  orientation: GridQuaternion
  columns: number
  rows: number
  width: number
  height: number
  rgba: Uint8Array
  colorGrid: boolean
}

interface GridField {
  name: string
  offset: number
  type: unknown
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : null
}

function asNumber(value: unknown, fallback = 0): number {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : fallback
}

function asUint8Array(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) {
    return value
  }
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value)
  }
  if (Array.isArray(value)) {
    return new Uint8Array(value.map(item => asNumber(item)))
  }
  const record = asRecord(value)
  return record && Array.isArray(record.data)
    ? new Uint8Array(record.data.map(item => asNumber(item)))
    : null
}

function parseVector(value: unknown): GridVector3 {
  const record = asRecord(value)
  return [asNumber(record?.x), asNumber(record?.y), asNumber(record?.z)]
}

function parseQuaternion(value: unknown): GridQuaternion {
  const record = asRecord(value)
  return [asNumber(record?.x), asNumber(record?.y), asNumber(record?.z), asNumber(record?.w, 1)]
}

function parseFieldType(value: unknown): number {
  if (typeof value === 'number') {
    return value
  }
  const type = String(value).toUpperCase()
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
  return 2
}

function readField(view: DataView, offset: number, type: unknown): number {
  if (offset < 0 || offset >= view.byteLength) {
    return 0
  }
  switch (parseFieldType(type)) {
    case 1: return view.getInt8(offset)
    case 2: return view.getUint8(offset)
    case 3: return offset + 2 <= view.byteLength ? view.getInt16(offset, true) : 0
    case 4: return offset + 2 <= view.byteLength ? view.getUint16(offset, true) : 0
    case 5: return offset + 4 <= view.byteLength ? view.getInt32(offset, true) : 0
    case 6: return offset + 4 <= view.byteLength ? view.getUint32(offset, true) : 0
    case 7: return offset + 4 <= view.byteLength ? view.getFloat32(offset, true) : 0
    case 8: return offset + 8 <= view.byteLength ? view.getFloat64(offset, true) : 0
    default: return 0
  }
}

function clampByte(value: number): number {
  return Math.round(Math.min(255, Math.max(0, value)))
}

function parseFields(value: unknown): GridField[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((field) => {
    const record = asRecord(field)
    return record
      ? [{ name: String(record.name || '').toLowerCase(), offset: asNumber(record.offset), type: record.type }]
      : []
  })
}

export function parseGrid(payload: unknown): ParsedGrid | null {
  const record = asRecord(payload)
  const data = asUint8Array(record?.data)
  const fields = parseFields(record?.fields)
  const columns = Math.trunc(asNumber(record?.column_count ?? record?.columnCount))
  const rowStride = Math.trunc(asNumber(record?.row_stride ?? record?.rowStride))
  const cellStride = Math.trunc(asNumber(record?.cell_stride ?? record?.cellStride))
  const cellSize = asRecord(record?.cell_size ?? record?.cellSize)

  if (!record || !data || fields.length === 0 || columns <= 0 || rowStride <= 0 || cellStride <= 0) {
    return null
  }
  const rows = Math.floor(data.byteLength / rowStride)
  if (rows <= 0 || rowStride < columns * cellStride) {
    return null
  }

  const red = fields.find(field => field.name === 'red' || field.name === 'r')
  const green = fields.find(field => field.name === 'green' || field.name === 'g')
  const blue = fields.find(field => field.name === 'blue' || field.name === 'b')
  const alpha = fields.find(field => field.name === 'alpha' || field.name === 'a')
  const colorGrid = Boolean(red && green && blue)
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const rgba = new Uint8Array(columns * rows * 4)

  if (colorGrid && red && green && blue) {
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const source = row * rowStride + column * cellStride
        const target = (row * columns + column) * 4
        rgba[target] = clampByte(readField(view, source + red.offset, red.type))
        rgba[target + 1] = clampByte(readField(view, source + green.offset, green.type))
        rgba[target + 2] = clampByte(readField(view, source + blue.offset, blue.type))
        rgba[target + 3] = alpha ? clampByte(readField(view, source + alpha.offset, alpha.type)) : 255
      }
    }
  }
  else {
    const field = fields[0]
    let min = Infinity
    let max = -Infinity
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const value = readField(view, row * rowStride + column * cellStride + field.offset, field.type)
        min = Math.min(min, value)
        max = Math.max(max, value)
      }
    }
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const value = readField(view, row * rowStride + column * cellStride + field.offset, field.type)
        const normalized = max > min ? (value - min) / (max - min) : value === 0 ? 0 : 1
        const target = (row * columns + column) * 4
        rgba[target] = 34
        rgba[target + 1] = 197
        rgba[target + 2] = 94
        rgba[target + 3] = clampByte(normalized * 180)
      }
    }
  }

  const pose = asRecord(record.pose)
  return {
    frameId: String(record.frame_id ?? record.frameId ?? 'base_link'),
    position: parseVector(pose?.position),
    orientation: parseQuaternion(pose?.orientation),
    columns,
    rows,
    width: columns * Math.abs(asNumber(cellSize?.x, 1)),
    height: rows * Math.abs(asNumber(cellSize?.y, 1)),
    rgba,
    colorGrid,
  }
}
