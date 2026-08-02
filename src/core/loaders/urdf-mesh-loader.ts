import type { BufferGeometry } from 'three'
import type { DisposableResourceHandle } from '@/core/disposable-resource-cache'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { registerDatasetResourceCleaner } from '@/core/dataset-resource-registry'
import { DisposableResourceCache } from '@/core/disposable-resource-cache'

export type UrdfMeshFormat = 'stl'

const MAX_CACHED_URDF_MESHES = 48
const geometryCache = new DisposableResourceCache<BufferGeometry>(
  MAX_CACHED_URDF_MESHES,
  geometry => geometry.dispose(),
)

registerDatasetResourceCleaner(() => geometryCache.clear())

export function getUrdfMeshFormat(filename: string): UrdfMeshFormat | null {
  const path = filename.trim().split(/[?#]/, 1)[0]?.toLowerCase() || ''
  return path.endsWith('.stl') ? 'stl' : null
}

export function acquireUrdfMeshGeometry(filename: string): Promise<DisposableResourceHandle<BufferGeometry>> {
  const url = filename.trim()
  const format = getUrdfMeshFormat(url)
  if (!url || !format) {
    return Promise.reject(new Error(`Unsupported URDF mesh URI: ${filename || '(empty)'}`))
  }

  return geometryCache.acquire(url, async () => {
    const geometry = await new STLLoader().loadAsync(url)
    if (!geometry.getAttribute('normal')) {
      geometry.computeVertexNormals()
    }
    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()
    return geometry
  })
}
