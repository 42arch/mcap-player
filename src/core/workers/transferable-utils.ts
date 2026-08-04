import type { DecodedMessage } from './message-cursor'

export function copyBinaryPayload(value: ArrayBufferView): Uint8Array {
  const source = new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  const copy = new Uint8Array(source.byteLength)
  copy.set(source)
  return copy
}

export function getTransferableBuffers(messages: readonly DecodedMessage[]): ArrayBuffer[] {
  const buffers = new Set<ArrayBuffer>()

  for (const { payload } of messages) {
    for (const value of [payload?.data, payload?.positions, payload?.intensities, payload?.colors]) {
      if (ArrayBuffer.isView(value) && value.buffer instanceof ArrayBuffer) {
        buffers.add(value.buffer)
      }
    }
  }

  return Array.from(buffers)
}

export function sanitizePayload(value: any, binaryFormat: 'placeholder' | 'hex' | 'raw' = 'placeholder'): any {
  if (value === null || value === undefined) {
    return value
  }

  if (ArrayBuffer.isView(value)) {
    const len = value.byteLength
    const uint8 = new Uint8Array(value.buffer, value.byteOffset, value.byteLength)

    if (binaryFormat === 'hex') {
      const hexLen = Math.min(len, 64)
      const bytes = uint8.subarray(0, hexLen)
      const hexStr = Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join(' ')
      return `<${value.constructor.name}: ${len} bytes [hex: ${hexStr}${len > 64 ? ' ...' : ''}]>`
    }
    else if (binaryFormat === 'raw') {
      const rawLen = Math.min(len, 64)
      const bytes = uint8.subarray(0, rawLen)
      const rawStr = Array.from(bytes).join(', ')
      return `<${value.constructor.name}: ${len} bytes [values: ${rawStr}${len > 64 ? ' ...' : ''}]>`
    }
    else {
      return `<${value.constructor.name}: ${len} bytes>`
    }
  }

  if (Array.isArray(value)) {
    // Do not truncate scene entities/markers array
    if (value.length > 512) {
      return `[Array: ${value.length} items (truncated)]`
    }
    return value.map(val => sanitizePayload(val, binaryFormat))
  }

  if (typeof value === 'object') {
    const isImage = value.width !== undefined && value.height !== undefined && value.encoding !== undefined && value.data !== undefined
    const isCompressedImage = value.format !== undefined && value.data !== undefined
    const isPointCloud = (value.point_step !== undefined || value.point_stride !== undefined || value.fields !== undefined) && value.data !== undefined
    const isSceneUpdate = value.entities !== undefined || value.cubes !== undefined || value.models !== undefined
    const isGrid = (value.column_count !== undefined || value.columnCount !== undefined)
      && (value.row_stride !== undefined || value.rowStride !== undefined)
      && (value.cell_stride !== undefined || value.cellStride !== undefined)
      && value.data !== undefined

    const res: any = {}
    for (const k of Object.keys(value)) {
      if ((isImage || isCompressedImage || isPointCloud || isSceneUpdate || isGrid) && k === 'data') {
        // The deserializer can return a view into a reader-owned buffer. Copy it
        // before transferring ownership to the main thread so the reader remains
        // usable for later seeks and reads.
        res[k] = ArrayBuffer.isView(value[k])
          ? copyBinaryPayload(value[k])
          : value[k]
      }
      else {
        res[k] = sanitizePayload(value[k], binaryFormat)
      }
    }
    return res
  }

  return value
}
