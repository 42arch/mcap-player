import { describe, expect, it } from 'vitest'
import { collectSceneLabelFields, getSceneEntityLabel } from './scene-labels'

describe('scene labels', () => {
  const entity = {
    id: 'vehicle-12',
    frame_id: 'map',
    metadata: [
      { key: 'category', value: 'vehicle.car' },
      { key: 'score', value: 0.98 },
    ],
    cubes: [{}],
  }

  it('discovers entity and metadata fields from a SceneUpdate', () => {
    expect(collectSceneLabelFields({ entities: [entity] })).toEqual([
      'id',
      'frame_id',
      'metadata.category',
      'metadata.score',
    ])
  })

  it('combines selected fields in the requested order', () => {
    expect(getSceneEntityLabel(entity, ['metadata.category', 'id'])).toBe(
      'vehicle.car · vehicle-12',
    )
  })

  it('ignores missing and unsupported values', () => {
    expect(getSceneEntityLabel(entity, ['metadata.missing'])).toBeNull()
    expect(collectSceneLabelFields(null)).toEqual([])
    expect(collectSceneLabelFields({
      entities: [{ id: 'lane', metadata: [{ key: 'category', value: 'road' }], lines: [{}] }],
    })).toEqual([])
  })
})
