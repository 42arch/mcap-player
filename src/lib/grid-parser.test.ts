import { describe, expect, it } from 'vitest'
import { parseGrid } from './grid-parser'

describe('parseGrid', () => {
  it('converts field-addressed color cells to RGBA', () => {
    const grid = parseGrid({
      frame_id: 'map',
      pose: {
        position: { x: 10, y: 20, z: 0 },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
      },
      column_count: 2,
      cell_size: { x: 0.5, y: 1 },
      row_stride: 8,
      cell_stride: 4,
      fields: [
        { name: 'alpha', offset: 0, type: 'UINT8' },
        { name: 'blue', offset: 1, type: 'UINT8' },
        { name: 'green', offset: 2, type: 'UINT8' },
        { name: 'red', offset: 3, type: 'UINT8' },
      ],
      data: new Uint8Array([255, 30, 20, 10, 128, 60, 50, 40]),
    })

    expect(grid).toMatchObject({ frameId: 'map', columns: 2, rows: 1, width: 1, height: 1, colorGrid: true })
    expect(Array.from(grid!.rgba)).toEqual([10, 20, 30, 255, 40, 50, 60, 128])
  })

  it('maps a scalar grid to a transparent overlay', () => {
    const grid = parseGrid({
      column_count: 2,
      cell_size: { x: 0.1, y: 0.1 },
      row_stride: 2,
      cell_stride: 1,
      fields: [{ name: 'drivable_area', offset: 0, type: 'UINT8' }],
      data: new Uint8Array([0, 1]),
    })

    expect(Array.from(grid!.rgba)).toEqual([
      34, 197, 94, 0,
      34, 197, 94, 180,
    ])
  })
})
