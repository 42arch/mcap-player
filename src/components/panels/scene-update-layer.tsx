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
} from '@/lib/scene-update-parser'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { globalMessageBus } from '@/core/message-bus'
import { createEmptySceneUpdate, isMapFrame, SceneUpdateState } from '@/lib/scene-update-parser'

// Single global unit box geometry & edges geometry shared by all bounding box instances
const unitBoxGeo = new THREE.BoxGeometry(1, 1, 1)
const unitEdgesGeo = new THREE.EdgesGeometry(unitBoxGeo)

// Global material caches to prevent allocating new Three.js materials on every frame
const boxMaterialCache = new Map<string, THREE.MeshStandardMaterial>()
const lineMaterialCache = new Map<string, THREE.LineBasicMaterial>()

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

function TextPrimitiveView({ text }: { text: ParsedText }) {
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null)
  const { color, alpha } = getColorStyle(text.color)

  useEffect(() => {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context || !text.text) {
      return
    }

    const pixelSize = Math.max(16, Math.round(text.fontSize * 32))
    context.font = `${pixelSize}px sans-serif`
    const width = Math.ceil(context.measureText(text.text).width) + 12
    canvas.width = width
    canvas.height = pixelSize + 12
    context.font = `${pixelSize}px sans-serif`
    context.fillStyle = color
    context.globalAlpha = alpha
    context.textBaseline = 'middle'
    context.fillText(text.text, 6, canvas.height / 2)

    const nextTexture = new THREE.CanvasTexture(canvas)
    nextTexture.colorSpace = THREE.SRGBColorSpace
    setTexture(nextTexture)
    return () => {
      nextTexture.dispose()
    }
  }, [text.text, text.fontSize, color, alpha])

  if (!texture) {
    return null
  }

  const height = Math.max(text.fontSize, 0.25)
  const width = height * (texture.image.width / texture.image.height)
  return (
    <group position={text.position} quaternion={text.orientation}>
      <sprite scale={[width, height, 1]}>
        <spriteMaterial map={texture} transparent depthWrite={false} />
      </sprite>
    </group>
  )
}

const gltfCache = new Map<string, THREE.Group>()
const loadingPromises = new Map<string, Promise<THREE.Group>>()

function cloneGltfScene(scene: THREE.Group): THREE.Group {
  return scene.clone(true)
}

function EgoVehicleModel({ model }: { model: ParsedModel }) {
  const [gltfScene, setGltfScene] = useState<THREE.Group | null>(null)

  const url = model.url
  const hasData = Boolean(model.data && model.data.byteLength > 0)

  useEffect(() => {
    let isMounted = true
    const cacheKey = url || (hasData ? 'embedded-data' : '')

    if (!cacheKey) {
      return
    }

    if (gltfCache.has(cacheKey)) {
      setGltfScene(cloneGltfScene(gltfCache.get(cacheKey)!))
      return
    }

    if (!loadingPromises.has(cacheKey)) {
      const promise = new Promise<THREE.Group>((resolve, reject) => {
        const loader = new GLTFLoader()
        loader.setMeshoptDecoder(MeshoptDecoder)

        let loadUrl = url
        let blobUrl: string | null = null

        if (hasData && model.data) {
          const u8 = new Uint8Array(Array.from(model.data))
          const blob = new Blob([u8], { type: 'model/gltf-binary' })
          blobUrl = URL.createObjectURL(blob)
          loadUrl = blobUrl
        }

        if (!loadUrl) {
          reject(new Error('No valid URL or binary data for model'))
          return
        }

        loader.load(
          loadUrl,
          (gltf) => {
            if (blobUrl) {
              URL.revokeObjectURL(blobUrl)
            }
            gltfCache.set(cacheKey, gltf.scene)
            loadingPromises.delete(cacheKey)
            resolve(gltf.scene)
          },
          undefined,
          (err) => {
            if (blobUrl) {
              URL.revokeObjectURL(blobUrl)
            }
            loadingPromises.delete(cacheKey)
            reject(err)
          },
        )
      })
      loadingPromises.set(cacheKey, promise)
    }

    loadingPromises
      .get(cacheKey)!
      .then((scene) => {
        if (isMounted) {
          setGltfScene(cloneGltfScene(scene))
        }
      })
      .catch((err) => {
        console.warn('Failed to load GLB vehicle model:', cacheKey, err)
      })

    return () => {
      isMounted = false
    }
  }, [url, hasData])

  return (
    <group position={model.position} quaternion={model.orientation} scale={model.scale}>
      {gltfScene ? (
        <primitive object={gltfScene} rotation={[Math.PI / 2, 0, 0]} />
      ) : (
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

function splitSceneByFrame(scene: ParsedSceneUpdate): { map: ParsedSceneUpdate, local: ParsedSceneUpdate } {
  const map = createEmptySceneUpdate()
  const local = createEmptySceneUpdate()
  const targetFor = <T extends { frameId: string }>(primitive: T) => isMapFrame(primitive.frameId) ? map : local

  for (const arrow of scene.arrows) targetFor(arrow).arrows.push(arrow)
  for (const cube of scene.cubes) targetFor(cube).cubes.push(cube)
  for (const sphere of scene.spheres) targetFor(sphere).spheres.push(sphere)
  for (const cylinder of scene.cylinders) targetFor(cylinder).cylinders.push(cylinder)
  for (const line of scene.lines) targetFor(line).lines.push(line)
  for (const triangles of scene.triangles) targetFor(triangles).triangles.push(triangles)
  for (const text of scene.texts) targetFor(text).texts.push(text)
  for (const model of scene.models) targetFor(model).models.push(model)

  return { map, local }
}

function ScenePrimitives({ scene }: { scene: ParsedSceneUpdate }) {
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
      {scene.models.map(model => <EgoVehicleModel key={model.id} model={model} />)}
    </>
  )
}

interface PendingSceneUpdate {
  payload: any
  logTimeNs: bigint
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

export function SceneUpdateLayer({ topic }: { topic: string }) {
  const [scene, setScene] = useState<ParsedSceneUpdate>(createEmptySceneUpdate)
  const pendingUpdatesRef = useRef<PendingSceneUpdate[]>([])
  const sceneStateRef = useRef(new SceneUpdateState())
  const rafIdRef = useRef<number | null>(null)
  const mapGroupRef = useRef<THREE.Group>(null)
  const transformRef = useRef({
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
  })

  const sceneByFrame = useMemo(() => splitSceneByFrame(scene), [scene])

  useEffect(() => {
    if (!topic) {
      return
    }

    pendingUpdatesRef.current = []
    sceneStateRef.current.clear()

    const scheduleSceneUpdate = () => {
      if (rafIdRef.current !== null) {
        return
      }
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null
        const updates = pendingUpdatesRef.current.splice(0)
        if (updates.length > 0) {
          let nextScene = createEmptySceneUpdate()
          for (const update of updates) {
            nextScene = sceneStateRef.current.apply(update.payload, update.logTimeNs)
          }
          setScene(nextScene)
        }
      })
    }

    // Moving map-frame objects only requires updating their shared root transform.
    const unsubTf = globalMessageBus.subscribe('/tf', (msg: any) => {
      if (!msg || !msg.payload) {
        return
      }
      const p = msg.payload
      if (p.parent_frame_id === 'map' && p.child_frame_id === 'base_link') {
        const mapGroup = mapGroupRef.current
        if (!mapGroup) {
          return
        }

        const { position, quaternion } = transformRef.current
        quaternion.set(
          p.rotation?.x ?? 0,
          p.rotation?.y ?? 0,
          p.rotation?.z ?? 0,
          p.rotation?.w ?? 1,
        ).invert()
        position.set(
          p.translation?.x ?? 0,
          p.translation?.y ?? 0,
          p.translation?.z ?? 0,
        ).applyQuaternion(quaternion).multiplyScalar(-1)
        mapGroup.position.copy(position)
        mapGroup.quaternion.copy(quaternion)
        mapGroup.updateMatrix()
      }
    })

    // Subscribe to SceneUpdate topic
    const unsubTopic = globalMessageBus.subscribe(topic, (msg: any) => {
      if (!msg || !msg.payload) {
        return
      }
      pendingUpdatesRef.current.push({
        payload: msg.payload,
        logTimeNs: getLogTimeNs(msg),
      })
      scheduleSceneUpdate()
    })

    const unsubSeek = globalMessageBus.subscribe('__seek__', () => {
      pendingUpdatesRef.current = []
      sceneStateRef.current.clear()
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
      setScene(createEmptySceneUpdate())
      mapGroupRef.current?.position.set(0, 0, 0)
      mapGroupRef.current?.quaternion.identity()
    })

    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
      unsubTf()
      unsubTopic()
      unsubSeek()
    }
  }, [topic])

  return (
    <group>
      <group ref={mapGroupRef}>
        <ScenePrimitives scene={sceneByFrame.map} />
      </group>

      <group>
        <ScenePrimitives scene={sceneByFrame.local} />
      </group>
    </group>
  )
}
