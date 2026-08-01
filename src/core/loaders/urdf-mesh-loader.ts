import type { BufferGeometry } from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'

export type UrdfMeshFormat = 'stl'

const geometryPromises = new Map<string, Promise<BufferGeometry>>()

export function getUrdfMeshFormat(filename: string): UrdfMeshFormat | null {
  const path = filename.trim().split(/[?#]/, 1)[0]?.toLowerCase() || ''
  return path.endsWith('.stl') ? 'stl' : null
}

export function loadUrdfMeshGeometry(filename: string): Promise<BufferGeometry> {
  const url = filename.trim()
  const format = getUrdfMeshFormat(url)
  if (!url || !format) {
    return Promise.reject(new Error(`Unsupported URDF mesh URI: ${filename || '(empty)'}`))
  }

  const cached = geometryPromises.get(url)
  if (cached) {
    return cached
  }

  const request = new STLLoader().loadAsync(url).then((geometry) => {
    if (!geometry.getAttribute('normal')) {
      geometry.computeVertexNormals()
    }
    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()
    return geometry
  }).catch((error: unknown) => {
    geometryPromises.delete(url)
    throw error
  })

  geometryPromises.set(url, request)
  return request
}
