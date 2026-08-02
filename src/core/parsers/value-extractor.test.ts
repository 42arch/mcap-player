import { describe, expect, it } from 'vitest'
import { createNumericValueAccessor, getNumericFields } from './value-extractor'

describe('createNumericValueAccessor', () => {
  it('should extract a top level number', () => {
    const obj = { x: 42 }
    expect(createNumericValueAccessor('x')(obj)).toBe(42)
  })

  it('should extract nested properties', () => {
    const obj = { a: { b: { c: 1.5 } } }
    expect(createNumericValueAccessor('a.b.c')(obj)).toBe(1.5)
  })

  it('should extract array values', () => {
    const obj = { arr: [10, 20, 30] }
    expect(createNumericValueAccessor('arr[1]')(obj)).toBe(20)
    expect(createNumericValueAccessor('arr.2')(obj)).toBe(30)
  })

  it('should return null for missing paths', () => {
    const obj = { a: { b: 1 } }
    expect(createNumericValueAccessor('a.c')(obj)).toBeNull()
    expect(createNumericValueAccessor('missing')(obj)).toBeNull()
  })

  it('should return null for non-numeric values', () => {
    const obj = { val: 'hello' }
    expect(createNumericValueAccessor('val')(obj)).toBeNull()
  })

  it('should return null for null/undefined objects', () => {
    expect(createNumericValueAccessor('a')(null)).toBeNull()
    expect(createNumericValueAccessor('a')(undefined)).toBeNull()
  })

  it('reuses a compiled nested path', () => {
    const readPositionX = createNumericValueAccessor('pose.position.x')

    expect(readPositionX({ pose: { position: { x: 1.5 } } })).toBe(1.5)
    expect(readPositionX({ pose: { position: { x: 2.5 } } })).toBe(2.5)
  })
})

describe('getNumericFields', () => {
  it('should collect numeric field paths from simple object', () => {
    const obj = { x: 1, y: 'hello', z: 3.14 }
    const fields = getNumericFields(obj)
    expect(fields).toContain('x')
    expect(fields).toContain('z')
    expect(fields).not.toContain('y')
  })

  it('should collect nested paths and array paths', () => {
    const obj = {
      pose: {
        position: { x: 0.1, y: 0.2 },
        orientation: [1, 0, 0, 0],
      },
      name: 'robot',
    }
    const fields = getNumericFields(obj)
    expect(fields).toContain('pose.position.x')
    expect(fields).toContain('pose.position.y')
    expect(fields).toContain('pose.orientation[0]')
    expect(fields).toContain('pose.orientation[3]')
    expect(fields).not.toContain('name')
  })

  it('should bypass typed arrays', () => {
    const obj = {
      data: new Uint8Array([1, 2, 3]),
      val: 5,
    }
    const fields = getNumericFields(obj)
    expect(fields).toContain('val')
    expect(fields).not.toContain('data[0]')
  })
})
