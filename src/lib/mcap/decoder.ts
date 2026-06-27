export interface ParsedMessage {
  sequence: number
  topic: string
  logTime: string
  logTimeBigInt: bigint
  publishTime: string
  dataPreview: string
  rawBytes: Uint8Array
  encoding: string
  schemaName: string
}

/**
 * Parse ROS 2 message definitions
 * @param content - Message definition text
 * @returns Array of field definitions
 */
function parseSingleDefinition(content: string): any[] {
  const fields = []
  const lines = content.split(/\r?\n/)
  for (const rawLine of lines) {
    const line = rawLine.split('#')[0].trim()
    if (!line)
      continue
    if (line.includes('='))
      continue // skip constants

    const tokens = line.split(/\s+/)
    if (tokens.length < 2)
      continue
    const fieldType = tokens[0]
    const fieldName = tokens[1]

    const openBracket = fieldType.indexOf('[')
    if (openBracket !== -1) {
      const baseType = fieldType.slice(0, openBracket)
      const arraySpec = fieldType.slice(openBracket + 1, -1).trim()
      const isBounded = arraySpec.includes('<=')
      const isDynamic = arraySpec === '' || isBounded
      const arraySize = isDynamic ? undefined : Number.parseInt(arraySpec, 10)

      fields.push({
        name: fieldName,
        type: baseType,
        isArray: true,
        arraySize,
      })
    }
    else {
      fields.push({
        name: fieldName,
        type: fieldType,
        isArray: false,
      })
    }
  }
  return fields
}

/**
 * Parse ROS 2 message definitions
 * @param mainTypeName - Main message type name
 * @param definitionText - Message definition text
 * @returns Dictionary of message definitions
 */
export function parseRosMsgDefinitions(mainTypeName: string, definitionText: string): Record<string, any> {
  const definitions: Record<string, any> = {}

  // Split by boundary lines
  const parts = definitionText.split(/=+\r?\n/)

  // Parse first part as the main type definition
  definitions[mainTypeName] = parseSingleDefinition(parts[0])

  // Parse subsequent dependency definitions
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i].trim()
    if (!part)
      continue

    // Standard prefix: MSG: package/Type
    const match = part.match(/^MSG:\s*(\S+)\r?\n([\s\S]*)$/)
    if (match) {
      const typeName = match[1]
      const content = match[2]
      definitions[typeName] = parseSingleDefinition(content)
    }
  }

  return definitions
}

function resolveType(fieldType: string, definitions: Record<string, any>): string | null {
  if (definitions[fieldType])
    return fieldType

  const suffix = `/${fieldType}`
  for (const key of Object.keys(definitions)) {
    if (key.endsWith(suffix)) {
      return key
    }
  }

  const normalizedField = fieldType.replace(/\/msg\//, '/')
  for (const key of Object.keys(definitions)) {
    const normalizedKey = key.replace(/\/msg\//, '/')
    if (normalizedKey === normalizedField || normalizedKey.endsWith(`/${normalizedField}`)) {
      return key
    }
  }

  return null
}

/**
 * Deserialize ROS 2 CDR format
 * @param buffer - raw CDR data
 * @param definitions - ROS 2 message definitions
 * @returns
 */
export class CdrDeserializer {
  private view: DataView
  private offset: number
  private littleEndian: boolean
  private definitions: Record<string, any>
  private isRos1: boolean

  constructor(buffer: Uint8Array, definitions: Record<string, any>, isRos1 = false) {
    this.view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
    this.definitions = definitions
    this.isRos1 = isRos1

    if (isRos1 || buffer.length < 4) {
      this.littleEndian = true
      this.offset = 0
    }
    else {
      this.littleEndian = buffer[1] === 0x01
      this.offset = 4
    }
  }

  private align(size: number) {
    if (this.isRos1)
      return
    const remainder = this.offset % size
    if (remainder !== 0) {
      this.offset += size - remainder
    }
  }

  readBool(): boolean {
    this.align(1)
    const val = this.view.getUint8(this.offset)
    this.offset += 1
    return val !== 0
  }

  readInt8(): number {
    this.align(1)
    const val = this.view.getInt8(this.offset)
    this.offset += 1
    return val
  }

  readUint8(): number {
    this.align(1)
    const val = this.view.getUint8(this.offset)
    this.offset += 1
    return val
  }

  readInt16(): number {
    this.align(2)
    const val = this.view.getInt16(this.offset, this.littleEndian)
    this.offset += 2
    return val
  }

  readUint16(): number {
    this.align(2)
    const val = this.view.getUint16(this.offset, this.littleEndian)
    this.offset += 2
    return val
  }

  readInt32(): number {
    this.align(4)
    const val = this.view.getInt32(this.offset, this.littleEndian)
    this.offset += 4
    return val
  }

  readUint32(): number {
    this.align(4)
    const val = this.view.getUint32(this.offset, this.littleEndian)
    this.offset += 4
    return val
  }

  readInt64(): bigint {
    this.align(8)
    const val = this.view.getBigInt64(this.offset, this.littleEndian)
    this.offset += 8
    return val
  }

  readUint64(): bigint {
    this.align(8)
    const val = this.view.getBigUint64(this.offset, this.littleEndian)
    this.offset += 8
    return val
  }

  readFloat32(): number {
    this.align(4)
    const val = this.view.getFloat32(this.offset, this.littleEndian)
    this.offset += 4
    return val
  }

  readFloat64(): number {
    this.align(8)
    const val = this.view.getFloat64(this.offset, this.littleEndian)
    this.offset += 8
    return val
  }

  readString(): string {
    const len = this.readUint32()
    if (len === 0)
      return ''

    const charLen = this.isRos1 ? len : len - 1
    if (this.offset + charLen > this.view.byteLength) {
      return '[Truncated string]'
    }
    const bytes = new Uint8Array(this.view.buffer, this.view.byteOffset + this.offset, charLen)
    this.offset += this.isRos1 ? charLen : len

    return new TextDecoder().decode(bytes)
  }

  deserializeValue(type: string): any {
    const normType = type.replace(/_t$/, '')
    switch (normType) {
      case 'bool':
      case 'boolean':
        return this.readBool()
      case 'int8':
        return this.readInt8()
      case 'uint8':
      case 'byte':
      case 'char':
        return this.readUint8()
      case 'int16':
        return this.readInt16()
      case 'uint16':
        return this.readUint16()
      case 'int32':
        return this.readInt32()
      case 'uint32':
        return this.readUint32()
      case 'int64':
        return this.readInt64().toString()
      case 'uint64':
        return this.readUint64().toString()
      case 'float32':
      case 'float':
        return this.readFloat32()
      case 'float64':
      case 'double':
        return this.readFloat64()
      case 'string':
        return this.readString()
      default: {
        const resolved = resolveType(normType, this.definitions)
        if (resolved) {
          return this.deserializeMessage(resolved)
        }
        return `[Unknown type: ${type}]`
      }
    }
  }

  deserializeMessage(typeName: string): Record<string, any> {
    const fields = this.definitions[typeName]
    if (!fields)
      throw new Error(`Schema fields not found in definitions dictionary for type '${typeName}'.`)

    const result: Record<string, any> = {}
    for (const field of fields) {
      if (this.offset >= this.view.byteLength) {
        result[field.name] = `[Truncated field ${field.name}]`
        continue
      }
      if (field.isArray) {
        let size = field.arraySize
        if (size === undefined) {
          size = this.readUint32()
        }

        const arr = []
        for (let i = 0; i < size; i++) {
          if (this.offset >= this.view.byteLength)
            break
          arr.push(this.deserializeValue(field.type))
        }
        result[field.name] = arr
      }
      else {
        result[field.name] = this.deserializeValue(field.type)
      }
    }
    return result
  }
}

/**
 * Get decoded payload from message
 * @param msg - Parsed message
 * @param ros2Definitions - ROS 2 message definitions
 * @param protobufDefinitions - Dynamic Protobuf schema definitions mapping tags to names
 * @returns Decoded payload as JSON string
 */
export function getDecodedPayload(
  msg: ParsedMessage,
  ros2Definitions: Record<string, any>,
  protobufDefinitions: Record<string, any> = {},
): string {
  try {
    const encodingLower = msg.encoding.toLowerCase()
    const isCdr = encodingLower === 'cdr' || encodingLower === 'ros2cdr' || encodingLower.includes('cdr')
    const isRos1 = encodingLower === 'ros1' || encodingLower === 'ros1msg' || encodingLower.includes('ros1')

    if (isCdr || isRos1) {
      const deserializer = new CdrDeserializer(msg.rawBytes, ros2Definitions, isRos1)
      const decodedObj = deserializer.deserializeMessage(msg.schemaName)
      return JSON.stringify(decodedObj, null, 2)
    }

    if (encodingLower === 'protobuf' || encodingLower.includes('protobuf')) {
      const decodedObj = decodeProtobufWire(msg.rawBytes, msg.schemaName, protobufDefinitions)
      return JSON.stringify(decodedObj, null, 2)
    }

    const decoded = new TextDecoder().decode(msg.rawBytes)
    if (encodingLower.includes('json')) {
      return JSON.stringify(JSON.parse(decoded), null, 2)
    }

    // Fallback: If it's not plain printable ASCII/UTF-8, show hex dump
    const isPlain = /^[\u0020-\u007E\t\n\r]*$/.test(decoded.slice(0, 100))
    if (!isPlain) {
      return `[Binary Payload - Encoding: "${msg.encoding || 'Unknown'}", Schema: "${msg.schemaName}"]\n\nHex Dump:\n${Array.from(msg.rawBytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join(' ')}`
    }
    return decoded
  }
  catch (err: any) {
    console.warn('Decoding error:', err)
    return `[Decoding Error: ${err.message || err}]\n\nHex Dump:\n${Array.from(msg.rawBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join(' ')}`
  }
}

// Read varint from buffer
function readVarint(buffer: Uint8Array, offset: { value: number }): bigint {
  let result = BigInt(0)
  let shift = BigInt(0)
  while (true) {
    if (offset.value >= buffer.length) {
      throw new Error('Unexpected EOF reading varint')
    }
    const byte = buffer[offset.value++]
    result |= BigInt(byte & 0x7F) << shift
    if ((byte & 0x80) === 0) {
      break
    }
    shift += BigInt(7)
  }
  return result
}

const descriptorDefinitions: Record<string, Record<number, { name: string, type: string }>> = {
  'google.protobuf.FileDescriptorSet': {
    1: { name: 'file', type: 'google.protobuf.FileDescriptorProto' },
  },
  'google.protobuf.FileDescriptorProto': {
    1: { name: 'name', type: 'string' },
    2: { name: 'package', type: 'string' },
    4: { name: 'message_type', type: 'google.protobuf.DescriptorProto' },
  },
  'google.protobuf.DescriptorProto': {
    1: { name: 'name', type: 'string' },
    2: { name: 'field', type: 'google.protobuf.FieldDescriptorProto' },
  },
  'google.protobuf.FieldDescriptorProto': {
    1: { name: 'name', type: 'string' },
    3: { name: 'number', type: 'int32' },
    6: { name: 'type_name', type: 'string' },
  },
}

/**
 * Parses a serialized FileDescriptorSet binary block and builds a tag-to-field schema map.
 */
export function buildProtobufDefinitions(rawBytes: Uint8Array): Record<string, Record<number, { name: string, type: string }>> {
  const definitions: Record<string, Record<number, { name: string, type: string }>> = {}
  try {
    const fileDescriptorSet = decodeProtobufWire(rawBytes, 'google.protobuf.FileDescriptorSet', descriptorDefinitions)
    const files = fileDescriptorSet.file
    if (!files)
      return definitions

    const fileList = Array.isArray(files) ? files : [files]
    for (const file of fileList) {
      const pkg = file.package || ''
      const prefix = pkg ? `${pkg}.` : ''

      const messageTypes = file.message_type
      if (!messageTypes)
        continue

      const typeList = Array.isArray(messageTypes) ? messageTypes : [messageTypes]
      for (const msgType of typeList) {
        const msgName = msgType.name
        if (!msgName)
          continue

        const fullMsgName = `${prefix}${msgName}`
        definitions[fullMsgName] = {}

        const fields = msgType.field
        if (!fields)
          continue

        const fieldList = Array.isArray(fields) ? fields : [fields]
        for (const field of fieldList) {
          const fieldName = field.name
          const fieldNumber = Number(field.number)
          let typeName = field.type_name || ''
          if (typeName.startsWith('.')) {
            typeName = typeName.slice(1)
          }
          if (fieldName && fieldNumber) {
            definitions[fullMsgName][fieldNumber] = {
              name: fieldName,
              type: typeName,
            }
          }
        }
      }
    }
  }
  catch (e) {
    console.warn('Failed to parse FileDescriptorSet:', e)
  }
  return definitions
}

function decodeProtobufWire(
  buffer: Uint8Array,
  typeName: string,
  allDefs: Record<string, Record<number, { name: string, type: string }>>,
): Record<string, any> {
  const result: Record<string, any> = {}
  const offset = { value: 0 }
  const msgDefs = allDefs[typeName] || {}

  while (offset.value < buffer.length) {
    const key = Number(readVarint(buffer, offset))
    const wireType = key & 7
    const tag = key >> 3

    const fieldDef = msgDefs[tag]
    const keyName = fieldDef ? fieldDef.name : tag.toString()

    let value: any
    if (wireType === 0) {
      value = readVarint(buffer, offset).toString()
    }
    else if (wireType === 1) {
      if (offset.value + 8 > buffer.length) {
        offset.value = buffer.length
        break
      }
      const view = new DataView(buffer.buffer, buffer.byteOffset + offset.value, 8)
      value = view.getFloat64(0, true)
      offset.value += 8
    }
    else if (wireType === 2) {
      const len = Number(readVarint(buffer, offset))
      if (offset.value + len > buffer.length) {
        offset.value = buffer.length
        break
      }
      const bytes = buffer.subarray(offset.value, offset.value + len)
      offset.value += len

      try {
        if (fieldDef && fieldDef.type) {
          value = decodeProtobufWire(bytes, fieldDef.type, allDefs)
        }
        else {
          const subMsg = decodeProtobufWire(bytes, '', allDefs)
          if (Object.keys(subMsg).length > 0) {
            value = subMsg
          }
          else {
            throw new Error('empty')
          }
        }
      }
      catch {
        const text = new TextDecoder().decode(bytes)
        const isPlain = /^[\u0020-\u007E\t\n\r]*$/.test(text)
        if (isPlain && text.length > 0) {
          value = text
        }
        else {
          if (bytes.length > 32) {
            value = `[Bytes: ${bytes.length} bytes, starts with: ${Array.from(bytes.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join(' ')}...]`
          }
          else {
            value = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' ')
          }
        }
      }
    }
    else if (wireType === 5) {
      if (offset.value + 4 > buffer.length) {
        offset.value = buffer.length
        break
      }
      const view = new DataView(buffer.buffer, buffer.byteOffset + offset.value, 4)
      value = view.getFloat32(0, true)
      offset.value += 4
    }
    else {
      offset.value++
      continue
    }

    if (result[keyName] !== undefined) {
      if (Array.isArray(result[keyName])) {
        result[keyName].push(value)
      }
      else {
        result[keyName] = [result[keyName], value]
      }
    }
    else {
      result[keyName] = value
    }
  }

  return result
}
