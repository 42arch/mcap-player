import type { AssetLoadTracker } from './asset-load-tracker'
import type { SceneLayerProps } from './scene-renderer-registry'
import type { FrameTransformCoordinator } from './tf-coordinator'
import type { DisposableResourceHandle } from '@/core/disposable-resource-cache'
import type {
  ColorTuple,
  ParsedArrow,
  ParsedCube,
  ParsedCylinder,
  ParsedLine,
  ParsedModel,
  ParsedSceneUpdate,
  ParsedSphere,
  ParsedText,
  ParsedTriangleList,
} from '@/core/parsers/scene-update-parser'
import { useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { registerDatasetResourceCleaner } from '@/core/dataset-resource-registry'
import { DisposableResourceCache } from '@/core/disposable-resource-cache'
import { createEmptySceneUpdate, SceneUpdateState } from '@/core/parsers/scene-update-parser'
import { globalMessagePipeline } from '@/panels/runtime/message-pipeline'
import { getAssetLabel } from './asset-load-tracker'
import { adaptSceneMessage } from './scene-message-adapter-registry'
import { getSceneLayerFrameOverride, isPreferredSceneFocusTopic } from './scene-renderer-registry'

// Single global unit box geometry & edges geometry shared by all bounding box instances
const unitBoxGeo = new THREE.BoxGeometry(1, 1, 1)
const unitEdgesGeo = new THREE.EdgesGeometry(unitBoxGeo)

// Global material caches to prevent allocating new Three.js materials on every frame
const boxMaterialCache = new Map<string, THREE.MeshStandardMaterial>()
const lineMaterialCache = new Map<string, THREE.LineBasicMaterial>()
const textTextureCache = new Map<string, { texture: THREE.CanvasTexture, references: number }>()
const emptyLabelFields: string[] = []

function getBoxMaterial(colorHex: string, alpha: number): THREE.MeshStandardMaterial {
  const key = `${colorHex}-${alpha.toFixed(2)}`
  let mat = boxMaterialCache.get(key)
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(colorHex),
      transparent: true,
      opacity: Math.max(alpha, 0.25),
      depthWrite: false,
    })
    boxMaterialCache.set(key, mat)
  }
  return mat
}

function getLineMaterial(colorHex: string): THREE.LineBasicMaterial {
  let mat = lineMaterialCache.get(colorHex)
  if (!mat) {
    mat = new THREE.LineBasicMaterial({
      color: new THREE.Color(colorHex),
      linewidth: 1.5,
    })
    lineMaterialCache.set(colorHex, mat)
  }
  return mat
}

function getColorStyle([r, g, b, alpha]: ColorTuple) {
  const toHex = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * 255).toString(16).padStart(2, '0')
  const color = `#${toHex(r)}${toHex(g)}${toHex(b)}`

  return {
    color,
    alpha,
    key: `${color}-${alpha.toFixed(2)}`,
  }
}

function getCubeStyle(cube: ParsedCube) {
  return getColorStyle(cube.color)
}

function CubeFillBatch({ cubes, color, alpha }: { cubes: ParsedCube[], color: string, alpha: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const transform = useMemo(() => ({
    matrix: new THREE.Matrix4(),
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    scale: new THREE.Vector3(),
  }), [])
  const material = getBoxMaterial(color, alpha)

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) {
      return
    }

    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    for (let index = 0; index < cubes.length; index++) {
      const cube = cubes[index]
      transform.position.fromArray(cube.position)
      transform.quaternion.fromArray(cube.orientation)
      transform.scale.fromArray(cube.size)
      transform.matrix.compose(transform.position, transform.quaternion, transform.scale)
      mesh.setMatrixAt(index, transform.matrix)
    }
    mesh.count = cubes.length
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [cubes, transform])

  return (
    <instancedMesh
      ref={meshRef}
      args={[unitBoxGeo, material, cubes.length]}
      dispose={null}
    />
  )
}

function CubeOutlineBatch({ cubes, color }: { cubes: ParsedCube[], color: string }) {
  const geometry = useMemo(() => {
    const next = new THREE.BufferGeometry()
    const edgePositions = unitEdgesGeo.getAttribute('position') as THREE.BufferAttribute
    const positions = new Float32Array(cubes.length * edgePositions.count * 3)
    const matrix = new THREE.Matrix4()
    const position = new THREE.Vector3()
    const quaternion = new THREE.Quaternion()
    const scale = new THREE.Vector3()
    const point = new THREE.Vector3()

    let offset = 0
    for (const cube of cubes) {
      position.fromArray(cube.position)
      quaternion.fromArray(cube.orientation)
      scale.fromArray(cube.size)
      matrix.compose(position, quaternion, scale)
      for (let index = 0; index < edgePositions.count; index++) {
        point.fromBufferAttribute(edgePositions, index).applyMatrix4(matrix).toArray(positions, offset)
        offset += 3
      }
    }

    next.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    next.computeBoundingSphere()
    return next
  }, [cubes])
  const material = getLineMaterial(color)

  useEffect(() => () => geometry.dispose(), [geometry])

  return <lineSegments geometry={geometry} material={material} />
}

function getLineIndices(line: ParsedLine): number[] {
  return line.indices.length > 0 ? line.indices : line.points.map((_, index) => index)
}

function LineBatch({ lines, alpha, thickness }: { lines: ParsedLine[], alpha: number, thickness: number }) {
  const geometry = useMemo(() => {
    const positions: number[] = []
    const colors: number[] = []

    const appendPoint = (
      line: ParsedLine,
      index: number,
      position: THREE.Vector3,
      quaternion: THREE.Quaternion,
      point: THREE.Vector3,
    ) => {
      const sourcePoint = line.points[index]
      if (!sourcePoint) {
        return false
      }
      const color = line.colors[index] || line.color
      point.set(sourcePoint[0], sourcePoint[1], sourcePoint[2]).applyQuaternion(quaternion).add(position)
      positions.push(point.x, point.y, point.z)
      colors.push(color[0], color[1], color[2])
      return true
    }

    const appendSegment = (
      line: ParsedLine,
      start: number,
      end: number,
      position: THREE.Vector3,
      quaternion: THREE.Quaternion,
      point: THREE.Vector3,
    ) => {
      const positionLength = positions.length
      const colorLength = colors.length
      if (!appendPoint(line, start, position, quaternion, point) || !appendPoint(line, end, position, quaternion, point)) {
        positions.length = positionLength
        colors.length = colorLength
      }
    }

    for (const line of lines) {
      const indices = getLineIndices(line)
      const position = new THREE.Vector3().fromArray(line.position)
      const quaternion = new THREE.Quaternion().fromArray(line.orientation)
      const point = new THREE.Vector3()
      const step = line.type === 'LINE_LIST' ? 2 : 1
      for (let index = 0; index + 1 < indices.length; index += step) {
        appendSegment(line, indices[index], indices[index + 1], position, quaternion, point)
      }
      if (line.type === 'LINE_LOOP' && indices.length > 2) {
        appendSegment(line, indices.at(-1)!, indices[0], position, quaternion, point)
      }
    }

    const next = new THREE.BufferGeometry()
    next.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    next.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    next.computeBoundingSphere()
    return next
  }, [lines])

  useEffect(() => () => geometry.dispose(), [geometry])

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial
        vertexColors
        linewidth={thickness}
        transparent={alpha < 1}
        opacity={alpha}
        depthWrite={alpha >= 1}
      />
    </lineSegments>
  )
}

function TriangleListView({ triangles }: { triangles: ParsedTriangleList }) {
  const geometry = useMemo(() => {
    const next = new THREE.BufferGeometry()
    next.setAttribute('position', new THREE.BufferAttribute(new Float32Array(triangles.points.flat()), 3))
    if (triangles.indices.length > 0) {
      next.setIndex(triangles.indices)
    }
    if (triangles.colors.length === triangles.points.length) {
      const colors = new Float32Array(triangles.colors.flatMap(([r, g, b]) => [r, g, b]))
      next.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    }
    next.computeVertexNormals()
    next.computeBoundingSphere()
    return next
  }, [triangles])
  const { color, alpha } = getColorStyle(triangles.color)
  const vertexColors = triangles.colors.length === triangles.points.length

  useEffect(() => () => geometry.dispose(), [geometry])

  return (
    <mesh position={triangles.position} quaternion={triangles.orientation} geometry={geometry}>
      <meshStandardMaterial
        color={color}
        vertexColors={vertexColors}
        side={THREE.DoubleSide}
        transparent={alpha < 1}
        opacity={alpha}
        depthWrite={alpha >= 1}
      />
    </mesh>
  )
}

function SpherePrimitiveView({ sphere }: { sphere: ParsedSphere }) {
  const { color, alpha } = getColorStyle(sphere.color)
  return (
    <mesh position={sphere.position} quaternion={sphere.orientation} scale={sphere.size}>
      <sphereGeometry args={[0.5, 16, 12]} />
      <meshStandardMaterial color={color} transparent={alpha < 1} opacity={alpha} depthWrite={alpha >= 1} />
    </mesh>
  )
}

function CylinderPrimitiveView({ cylinder }: { cylinder: ParsedCylinder }) {
  const { color, alpha } = getColorStyle(cylinder.color)
  const radius = Math.max(cylinder.size[0], cylinder.size[1]) / 2
  return (
    <group position={cylinder.position} quaternion={cylinder.orientation}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[radius * cylinder.topScale, radius * cylinder.bottomScale, cylinder.size[2], 16]} />
        <meshStandardMaterial color={color} transparent={alpha < 1} opacity={alpha} depthWrite={alpha >= 1} />
      </mesh>
    </group>
  )
}

function ArrowPrimitiveView({ arrow }: { arrow: ParsedArrow }) {
  const { color, alpha } = getColorStyle(arrow.color)
  return (
    <group position={arrow.position} quaternion={arrow.orientation}>
      <mesh position={[0, 0, arrow.shaftLength / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[arrow.shaftDiameter / 2, arrow.shaftDiameter / 2, arrow.shaftLength, 12]} />
        <meshStandardMaterial color={color} transparent={alpha < 1} opacity={alpha} depthWrite={alpha >= 1} />
      </mesh>
      <mesh position={[0, 0, arrow.shaftLength + arrow.headLength / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[arrow.headDiameter / 2, arrow.headLength, 12]} />
        <meshStandardMaterial color={color} transparent={alpha < 1} opacity={alpha} depthWrite={alpha >= 1} />
      </mesh>
    </group>
  )
}

type TextTextureSource = Pick<ParsedText, 'text' | 'fontSize' | 'hasBackground' | 'screenSize'>

const textTextureScale = 2
const textTextureStyleVersion = 'outlined-regular-v1'

function getTextTextureKey(text: TextTextureSource, color: string, alpha: number): string {
  return [
    textTextureStyleVersion,
    text.text,
    text.fontSize,
    text.screenSize || 0,
    color,
    alpha,
    Boolean(text.hasBackground),
  ].join('|')
}

function acquireTextTexture(text: TextTextureSource, color: string, alpha: number): THREE.CanvasTexture | null {
  if (!text.text) {
    return null
  }

  const cacheKey = getTextTextureKey(text, color, alpha)
  const cached = textTextureCache.get(cacheKey)
  if (cached) {
    cached.references++
    return cached.texture
  }

  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) {
    return null
  }

  const fontPixelSize = text.screenSize
    ? Math.max(12, Math.round(text.screenSize * 0.64))
    : Math.max(32, Math.round(text.fontSize * 48))
  const horizontalPadding = text.hasBackground ? 7 : 3
  const verticalPadding = text.hasBackground ? 4 : 3
  context.font = `400 ${fontPixelSize}px sans-serif`
  const logicalWidth = Math.ceil(context.measureText(text.text).width) + horizontalPadding * 2
  const logicalHeight = fontPixelSize + verticalPadding * 2
  canvas.width = logicalWidth * textTextureScale
  canvas.height = logicalHeight * textTextureScale
  context.scale(textTextureScale, textTextureScale)
  context.font = `400 ${fontPixelSize}px sans-serif`
  context.textBaseline = 'middle'

  if (text.hasBackground) {
    context.strokeStyle = 'rgba(15, 23, 42, 0.78)'
    context.lineWidth = 1
    context.beginPath()
    context.roundRect(0.5, 0.5, logicalWidth - 1, logicalHeight - 1, 3.5)
    context.stroke()
  }

  context.fillStyle = color
  context.globalAlpha = alpha
  if (text.hasBackground) {
    context.strokeStyle = 'rgba(15, 23, 42, 0.7)'
    context.lineWidth = 0.75
    context.strokeText(text.text, horizontalPadding, logicalHeight / 2)
  }
  context.fillText(text.text, horizontalPadding, logicalHeight / 2)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.magFilter = THREE.LinearFilter
  textTextureCache.set(cacheKey, { texture, references: 1 })
  return texture
}

function releaseTextTexture(text: TextTextureSource, color: string, alpha: number) {
  const cacheKey = getTextTextureKey(text, color, alpha)
  const cached = textTextureCache.get(cacheKey)
  if (!cached) {
    return
  }

  cached.references--
  if (cached.references <= 0) {
    cached.texture.dispose()
    textTextureCache.delete(cacheKey)
  }
}

function TextPrimitiveView({ text }: { text: ParsedText }) {
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null)
  const viewportHeight = useThree(state => state.size.height)
  const camera = useThree(state => state.camera)
  const { color, alpha } = getColorStyle(text.color)
  const textValue = text.text
  const fontSize = text.fontSize
  const hasBackground = text.hasBackground
  const screenSize = text.screenSize

  useEffect(() => {
    const textureSource = { text: textValue, fontSize, hasBackground, screenSize }
    const nextTexture = acquireTextTexture(textureSource, color, alpha)
    if (!nextTexture) {
      setTexture(null)
      return
    }
    setTexture(nextTexture)
    return () => {
      releaseTextTexture(textureSource, color, alpha)
    }
  }, [textValue, fontSize, hasBackground, screenSize, color, alpha])

  if (!texture) {
    return null
  }

  const screenHeightPixels = screenSize
    ?? (text.scaleInvariant ? Math.max(16, Math.round(text.fontSize * 22)) : null)
  const projectionScale = Math.max(Math.abs(camera.projectionMatrix.elements[5]), Number.EPSILON)
  const height = screenHeightPixels === null
    ? Math.max(text.fontSize, 0.25)
    : (screenHeightPixels * 2) / Math.max(viewportHeight * projectionScale, 1)
  const width = height * (texture.image.width / texture.image.height)
  return (
    <group position={text.position} quaternion={text.orientation}>
      <sprite scale={[width, height, 1]}>
        <spriteMaterial
          map={texture}
          transparent
          depthWrite={false}
          sizeAttenuation={screenHeightPixels === null}
        />
      </sprite>
    </group>
  )
}

const MAX_CACHED_GLTF_SCENES = 16

function disposeGltfScene(scene: THREE.Group) {
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  const textures = new Set<THREE.Texture>()

  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) {
      return
    }
    geometries.add(object.geometry)
    const objectMaterials = Array.isArray(object.material) ? object.material : [object.material]
    for (const material of objectMaterials) {
      materials.add(material)
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) {
          textures.add(value)
        }
      }
    }
  })

  for (const texture of textures) texture.dispose()
  for (const material of materials) material.dispose()
  for (const geometry of geometries) geometry.dispose()
}

const gltfCache = new DisposableResourceCache<THREE.Group>(
  MAX_CACHED_GLTF_SCENES,
  disposeGltfScene,
)

registerDatasetResourceCleaner(() => gltfCache.clear())

function cloneGltfScene(scene: THREE.Group): THREE.Group {
  return scene.clone(true)
}

function getEmbeddedModelCacheKey(data: Uint8Array): string {
  let hash = 2_166_136_261
  for (const value of data) {
    hash ^= value
    hash = Math.imul(hash, 16_777_619)
  }
  return `embedded-data:${data.byteLength}:${(hash >>> 0).toString(16)}`
}

function loadGltfScene(url: string | undefined, data: Uint8Array | undefined): Promise<THREE.Group> {
  return new Promise<THREE.Group>((resolve, reject) => {
    const loader = new GLTFLoader()
    loader.setMeshoptDecoder(MeshoptDecoder)

    let loadUrl = url
    let blobUrl: string | null = null
    if (data && data.byteLength > 0) {
      const bytes = new Uint8Array(Array.from(data))
      const blob = new Blob([bytes], { type: 'model/gltf-binary' })
      blobUrl = URL.createObjectURL(blob)
      loadUrl = blobUrl
    }

    if (!loadUrl) {
      reject(new Error('No valid URL or binary data for model'))
      return
    }

    const releaseBlobUrl = () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl)
      }
    }
    loader.load(
      loadUrl,
      (gltf) => {
        releaseBlobUrl()
        resolve(gltf.scene)
      },
      undefined,
      (error) => {
        releaseBlobUrl()
        reject(error)
      },
    )
  })
}

function EgoVehicleModel({ assetLoadTracker, model }: { assetLoadTracker: AssetLoadTracker, model: ParsedModel }) {
  const [gltfScene, setGltfScene] = useState<THREE.Group | null>(null)

  const url = model.url
  const hasData = Boolean(model.data && model.data.byteLength > 0)
  const cacheKey = useMemo(
    () => url || (model.data && hasData ? getEmbeddedModelCacheKey(model.data) : ''),
    [hasData, model.data, url],
  )

  useEffect(() => {
    let isMounted = true
    let resourceHandle: DisposableResourceHandle<THREE.Group> | null = null

    if (!cacheKey) {
      return
    }

    setGltfScene(null)
    const assetLoad = gltfCache.has(cacheKey)
      ? null
      : assetLoadTracker.begin(cacheKey, getAssetLabel(url || '', 'Embedded 3D model'))
    gltfCache.acquire(cacheKey, () => loadGltfScene(url, model.data))
      .then((handle) => {
        resourceHandle = handle
        assetLoad?.finish()
        if (isMounted) {
          setGltfScene(cloneGltfScene(handle.resource))
        }
        else {
          handle.release()
          resourceHandle = null
        }
      })
      .catch((err) => {
        assetLoad?.finish()
        console.warn('Failed to load GLB vehicle model:', cacheKey, err)
      })

    return () => {
      isMounted = false
      resourceHandle?.release()
      assetLoad?.cancel()
    }
  }, [assetLoadTracker, cacheKey, model.data, url])

  return (
    <group position={model.position} quaternion={model.orientation} scale={model.scale}>
      {gltfScene
        ? <primitive object={gltfScene} rotation={[Math.PI / 2, 0, 0]} dispose={null} />
        : (
          // Fallback stylized vehicle model while loading GLB
            <group>
              <mesh position={[0, 0, 0.4]}>
                <boxGeometry args={[4.2, 1.9, 0.7]} />
                <meshStandardMaterial color="#3b82f6" metalness={0.4} roughness={0.3} />
              </mesh>
              <mesh position={[-0.3, 0, 1.05]}>
                <boxGeometry args={[2.2, 1.5, 0.6]} />
                <meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.1} transparent opacity={0.85} />
              </mesh>
            </group>
          )}
    </group>
  )
}

function splitSceneByFrame(scene: ParsedSceneUpdate): Array<[string, ParsedSceneUpdate]> {
  const groups = new Map<string, ParsedSceneUpdate>()
  const targetFor = <T extends { frameId: string }>(primitive: T) => {
    const frameId = primitive.frameId.replace(/^\/+/, '') || 'base_link'
    let target = groups.get(frameId)
    if (!target) {
      target = createEmptySceneUpdate()
      groups.set(frameId, target)
    }
    return target
  }

  for (const arrow of scene.arrows) targetFor(arrow).arrows.push(arrow)
  for (const cube of scene.cubes) targetFor(cube).cubes.push(cube)
  for (const sphere of scene.spheres) targetFor(sphere).spheres.push(sphere)
  for (const cylinder of scene.cylinders) targetFor(cylinder).cylinders.push(cylinder)
  for (const line of scene.lines) targetFor(line).lines.push(line)
  for (const triangles of scene.triangles) targetFor(triangles).triangles.push(triangles)
  for (const text of scene.texts) targetFor(text).texts.push(text)
  for (const model of scene.models) targetFor(model).models.push(model)

  return Array.from(groups)
}

function ScenePrimitives({ assetLoadTracker, scene }: { assetLoadTracker: AssetLoadTracker, scene: ParsedSceneUpdate }) {
  const cubeBatches = useMemo(() => {
    const groups = new Map<string, { cubes: ParsedCube[], color: string, alpha: number }>()
    for (const cube of scene.cubes) {
      const style = getCubeStyle(cube)
      const existing = groups.get(style.key)
      if (existing) {
        existing.cubes.push(cube)
      }
      else {
        groups.set(style.key, { cubes: [cube], color: style.color, alpha: style.alpha })
      }
    }
    return Array.from(groups, ([key, value]) => ({ key, ...value }))
  }, [scene.cubes])

  const lineBatches = useMemo(() => {
    const groups = new Map<string, { lines: ParsedLine[], alpha: number, thickness: number }>()
    for (const line of scene.lines) {
      const alpha = line.color[3]
      const key = `${alpha.toFixed(2)}-${line.thickness.toFixed(2)}`
      const existing = groups.get(key)
      if (existing) {
        existing.lines.push(line)
      }
      else {
        groups.set(key, { lines: [line], alpha, thickness: line.thickness })
      }
    }
    return Array.from(groups, ([key, value]) => ({ key, ...value }))
  }, [scene.lines])

  return (
    <>
      {cubeBatches.map(({ key, cubes, color, alpha }) => (
        <group key={key}>
          <CubeFillBatch cubes={cubes} color={color} alpha={alpha} />
          <CubeOutlineBatch cubes={cubes} color={color} />
        </group>
      ))}
      {lineBatches.map(({ key, lines, alpha, thickness }) => (
        <LineBatch key={key} lines={lines} alpha={alpha} thickness={thickness} />
      ))}
      {scene.triangles.map(triangles => <TriangleListView key={triangles.id} triangles={triangles} />)}
      {scene.spheres.map(sphere => <SpherePrimitiveView key={sphere.id} sphere={sphere} />)}
      {scene.cylinders.map(cylinder => <CylinderPrimitiveView key={cylinder.id} cylinder={cylinder} />)}
      {scene.arrows.map(arrow => <ArrowPrimitiveView key={arrow.id} arrow={arrow} />)}
      {scene.texts.map(text => <TextPrimitiveView key={text.id} text={text} />)}
      {scene.models.map(model => <EgoVehicleModel key={model.id} assetLoadTracker={assetLoadTracker} model={model} />)}
    </>
  )
}

function FrameSceneGroup({
  assetLoadTracker,
  focusRef,
  frameId,
  isFocusTarget = false,
  scene,
  tfCoordinator,
}: {
  assetLoadTracker: AssetLoadTracker
  focusRef?: SceneLayerProps['focusRef']
  frameId: string
  isFocusTarget?: boolean
  scene: ParsedSceneUpdate
  tfCoordinator: FrameTransformCoordinator
}) {
  const groupRef = useRef<THREE.Group>(null)
  const hasRenderableContent = scene.models.length > 0
    || scene.cubes.length > 0
    || scene.lines.length > 0
    || scene.triangles.length > 0
    || scene.spheres.length > 0
    || scene.cylinders.length > 0
    || scene.arrows.length > 0
    || scene.texts.length > 0

  useEffect(() => {
    const group = groupRef.current
    return group ? tfCoordinator.registerFrameTarget(group, frameId) : undefined
  }, [frameId, tfCoordinator])

  useEffect(() => {
    const group = groupRef.current
    if (!group || !focusRef || !isFocusTarget || !hasRenderableContent) {
      return
    }
    focusRef.current = group
    return () => {
      if (focusRef.current === group) {
        focusRef.current = null
      }
    }
  }, [focusRef, hasRenderableContent, isFocusTarget])

  return (
    <group ref={groupRef}>
      <ScenePrimitives assetLoadTracker={assetLoadTracker} scene={scene} />
    </group>
  )
}

interface PendingSceneUpdate {
  payload: any
  logTimeNs: bigint
  replaceState: boolean
}

function getLogTimeNs(message: any): bigint {
  const value = message?.logTime
  if (typeof value === 'bigint') {
    return value
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return BigInt(Math.trunc(value))
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return BigInt(value)
  }
  return 0n
}

export function SceneUpdateLayer({
  adapter,
  assetLoadTracker,
  channel,
  focusRef,
  panelId,
  settings,
  tfCoordinator,
}: SceneLayerProps) {
  const topic = channel.topic
  const isFocusTarget = isPreferredSceneFocusTopic(topic)
  const [scene, setScene] = useState<ParsedSceneUpdate>(createEmptySceneUpdate)
  const [adapterFrameId, setAdapterFrameId] = useState<string | null>(null)
  const labelFields = useMemo(
    () => Array.isArray(settings.labelFields)
      ? settings.labelFields.filter((field): field is string => typeof field === 'string')
      : emptyLabelFields,
    [settings.labelFields],
  )
  const pendingUpdatesRef = useRef<PendingSceneUpdate[]>([])
  const frameOverride = getSceneLayerFrameOverride(settings)
  const sceneStateRef = useRef(new SceneUpdateState())
  const rafIdRef = useRef<number | null>(null)
  const receivedSinceSeekRef = useRef(true)
  const labelFieldsRef = useRef(labelFields)
  labelFieldsRef.current = labelFields

  const sceneByFrame = useMemo(() => splitSceneByFrame(scene), [scene])

  useEffect(() => {
    if (!topic) {
      return
    }

    pendingUpdatesRef.current = []
    sceneStateRef.current.clear()
    setScene(createEmptySceneUpdate())
    setAdapterFrameId(null)

    const scheduleSceneUpdate = () => {
      if (rafIdRef.current !== null) {
        return
      }
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null
        const updates = pendingUpdatesRef.current.splice(0)
        if (updates.length > 0) {
          for (const update of updates) {
            if (update.replaceState) {
              sceneStateRef.current.replaceWithFullUpdate(update.payload, update.logTimeNs)
            }
            else {
              sceneStateRef.current.applyMutation(update.payload, update.logTimeNs)
            }
          }
          setScene(sceneStateRef.current.snapshot({ labelFields: labelFieldsRef.current }))
        }
      })
    }

    // Subscribe to SceneUpdate topic
    const unsubTopic = globalMessagePipeline.subscribe({
      panelId,
      subscriptionId: `scene-update:${topic}`,
      topics: [{ topic, mode: 'all' }],
    }, (msg: any) => {
      if (!msg || !msg.payload) {
        return
      }
      try {
        const adapted = adaptSceneMessage(adapter, msg.payload, channel)
        receivedSinceSeekRef.current = true
        if (adapted.frameId) {
          setAdapterFrameId(adapted.frameId)
        }
        pendingUpdatesRef.current.push({
          payload: adapted.payload,
          logTimeNs: getLogTimeNs(msg),
          replaceState: msg.sceneSnapshot === true,
        })
        scheduleSceneUpdate()
      }
      catch (error) {
        console.warn(`Failed to adapt Scene Update topic "${topic}":`, error)
      }
    })

    const unsubSeek = globalMessagePipeline.subscribeSeek(panelId, () => {
      receivedSinceSeekRef.current = false
      // Rebuild state from backfill while the last completed scene remains rendered.
      pendingUpdatesRef.current = []
      sceneStateRef.current.clear()
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
    })
    const unsubSeekComplete = globalMessagePipeline.subscribeSeekComplete(panelId, () => {
      if (!receivedSinceSeekRef.current) {
        setScene(createEmptySceneUpdate())
        setAdapterFrameId(null)
      }
    })

    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
      unsubTopic()
      unsubSeek()
      unsubSeekComplete()
    }
  }, [adapter, channel, panelId, topic])

  useEffect(() => {
    setScene(sceneStateRef.current.snapshot({ labelFields }))
  }, [labelFields])

  return (
    <group>
      {sceneByFrame.map(([frameId, frameScene]) => (
        <FrameSceneGroup
          key={frameId}
          assetLoadTracker={assetLoadTracker}
          focusRef={focusRef}
          frameId={frameOverride || adapterFrameId || frameId}
          isFocusTarget={isFocusTarget}
          scene={frameScene}
          tfCoordinator={tfCoordinator}
        />
      ))}
    </group>
  )
}
