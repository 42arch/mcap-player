import { describe, expect, it } from 'vitest'
import { getUrdfMeshFormat } from './urdf-mesh-loader'

describe('getUrdfMeshFormat', () => {
  it('recognizes remote STL resources case-insensitively', () => {
    expect(getUrdfMeshFormat(
      'https://platform.io-ai.tech/resources/RM_AIDAL_GRIPPER/meshes/base_link_underpan.STL',
    )).toBe('stl')
    expect(getUrdfMeshFormat('https://example.com/mesh.stl?version=1#part')).toBe('stl')
  })

  it('rejects missing and unsupported mesh resources', () => {
    expect(getUrdfMeshFormat('')).toBeNull()
    expect(getUrdfMeshFormat('package://robot/meshes/link.dae')).toBeNull()
  })
})
