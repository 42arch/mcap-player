import { describe, expect, it } from 'vitest'
import { isMapFrame, parseSceneUpdate, SceneUpdateState } from './scene-update-parser'

describe('parseSceneUpdate', () => {
  it('keeps entity poses in their source frame for the renderer to transform by frame', () => {
    const parsed = parseSceneUpdate({
      entities: [
        {
          id: 'annotation',
          frame_id: 'map',
          cubes: [
            {
              pose: {
                position: { x: 12, y: -4, z: 1 },
                orientation: { x: 0, y: 0, z: 0.5, w: 0.5 },
              },
              size: { x: 4, y: 2, z: 1.5 },
            },
          ],
        },
      ],
    })

    expect(parsed.cubes).toHaveLength(1)
    expect(parsed.cubes[0]).toMatchObject({
      frameId: 'map',
      position: [12, -4, 1],
      orientation: [0, 0, 0.5, 0.5],
      size: [4, 2, 1.5],
    })
  })

  it('recognizes absolute and relative map frame identifiers', () => {
    expect(isMapFrame('map')).toBe(true)
    expect(isMapFrame('/map')).toBe(true)
    expect(isMapFrame('base_link')).toBe(false)
  })

  it('parses line primitives used by foxglove.SceneUpdate semantic maps', () => {
    const parsed = parseSceneUpdate({
      entities: [
        {
          id: 'lane',
          frame_id: 'map',
          lines: [
            {
              type: 'LINE_STRIP',
              thickness: 0.1,
              points: [
                { x: 1, y: 2, z: 0 },
                { x: 3, y: 4, z: 0 },
              ],
              color: { r: 0.2, g: 0.6, b: 0.1, a: 1 },
            },
          ],
        },
      ],
    })

    expect(parsed.lines).toEqual([
      expect.objectContaining({
        id: 'lane-line-0',
        frameId: 'map',
        type: 'LINE_STRIP',
        thickness: 0.1,
        points: [[1, 2, 0], [3, 4, 0]],
      }),
    ])
  })

  it('applies entity replacement, deletion, and lifetime as SceneUpdate state', () => {
    const state = new SceneUpdateState()
    const start = 1_000_000_000n

    state.apply({
      entities: [{
        id: 'vehicle',
        cubes: [{ size: { x: 1, y: 1, z: 1 } }],
        lifetime: { sec: '2', nsec: 0 },
      }],
    }, start)

    const replaced = state.apply({
      entities: [{
        id: 'vehicle',
        cubes: [{ size: { x: 4, y: 2, z: 1 } }],
      }],
    }, start + 1n)
    expect(replaced.cubes[0].size).toEqual([4, 2, 1])

    const deleted = state.apply({ deletions: ['vehicle'] }, start + 2n)
    expect(deleted.cubes).toHaveLength(0)

    state.apply({
      entities: [{
        id: 'temporary',
        cubes: [{ size: { x: 1, y: 1, z: 1 } }],
        lifetime: { sec: 1, nsec: 0 },
      }],
    }, start)
    expect(state.apply({ entities: [] }, start + 1_000_000_000n).cubes).toHaveLength(0)
  })
})
