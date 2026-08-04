export type Vector3Tuple = [number, number, number]
export type QuaternionTuple = [number, number, number, number]
export type ColorTuple = [number, number, number, number]

interface ParsedPrimitive {
  id: string
  position: Vector3Tuple
  orientation: QuaternionTuple
  color: ColorTuple
  frameId: string
}

export interface ParsedArrow extends ParsedPrimitive {
  shaftLength: number
  shaftDiameter: number
  headLength: number
  headDiameter: number
}

export interface ParsedCube extends ParsedPrimitive {
  size: Vector3Tuple
  category?: string
}

export interface ParsedSphere extends ParsedPrimitive {
  size: Vector3Tuple
}

export interface ParsedCylinder extends ParsedPrimitive {
  size: Vector3Tuple
  bottomScale: number
  topScale: number
}

export type LineType = 'LINE_STRIP' | 'LINE_LOOP' | 'LINE_LIST'

export interface ParsedLine extends ParsedPrimitive {
  type: LineType
  thickness: number
  scaleInvariant: boolean
  points: Vector3Tuple[]
  colors: ColorTuple[]
  indices: number[]
}

export interface ParsedTriangleList extends ParsedPrimitive {
  points: Vector3Tuple[]
  colors: ColorTuple[]
  indices: number[]
}

export interface ParsedText extends ParsedPrimitive {
  text: string
  fontSize: number
  billboard: boolean
  scaleInvariant: boolean
  hasBackground?: boolean
  screenSize?: number
}

export interface ParsedModel extends ParsedPrimitive {
  scale: Vector3Tuple
  overrideColor: boolean
  url?: string
  mediaType?: string
  data?: Uint8Array
}

export interface ParsedSceneUpdate {
  arrows: ParsedArrow[]
  cubes: ParsedCube[]
  spheres: ParsedSphere[]
  cylinders: ParsedCylinder[]
  lines: ParsedLine[]
  triangles: ParsedTriangleList[]
  texts: ParsedText[]
  models: ParsedModel[]
}

interface StoredEntity {
  entity: any
  expiresAtNs: bigint | null
}

export function createEmptySceneUpdate(): ParsedSceneUpdate {
  return {
    arrows: [],
    cubes: [],
    spheres: [],
    cylinders: [],
    lines: [],
    triangles: [],
    texts: [],
    models: [],
  }
}

function toBigInt(value: unknown): bigint {
  if (typeof value === 'bigint') {
    return value
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return BigInt(Math.trunc(value))
  }
  if (typeof value === 'string' && /^-?\d+$/.test(value)) {
    return BigInt(value)
  }
  return 0n
}

function getLifetimeNs(entity: any): bigint | null {
  const seconds = toBigInt(entity?.lifetime?.sec)
  const nanoseconds = toBigInt(entity?.lifetime?.nsec)
  const lifetimeNs = seconds * 1_000_000_000n + nanoseconds
  return lifetimeNs > 0n ? lifetimeNs : null
}

/**
 * Keeps the state described by a sequence of foxglove.SceneUpdate messages.
 * SceneUpdate is incremental: entities replace matching IDs and deletions remove
 * prior entities, rather than every message representing a full scene snapshot.
 */
export class SceneUpdateState {
  private entities = new Map<string, StoredEntity>()
  private nextExpirationNs: bigint | null = null

  clear() {
    this.entities.clear()
    this.nextExpirationNs = null
  }

  clone(): SceneUpdateState {
    const clone = new SceneUpdateState()
    clone.entities = new Map(
      Array.from(this.entities, ([id, entry]) => [id, { ...entry }] as const),
    )
    clone.nextExpirationNs = this.nextExpirationNs
    return clone
  }

  apply(payload: any, logTimeNs: bigint): ParsedSceneUpdate {
    this.applyMutation(payload, logTimeNs)
    return this.snapshot()
  }

  applyMutation(payload: any, logTimeNs: bigint): void {
    this.removeExpired(logTimeNs)

    for (const id of Array.isArray(payload?.deletions) ? payload.deletions : []) {
      if (typeof id === 'string') {
        this.entities.delete(id)
      }
    }

    for (const entity of Array.isArray(payload?.entities) ? payload.entities : []) {
      if (!entity || typeof entity.id !== 'string' || !entity.id) {
        continue
      }

      const lifetimeNs = getLifetimeNs(entity)
      const expiresAtNs = lifetimeNs === null ? null : logTimeNs + lifetimeNs
      if (expiresAtNs !== null && expiresAtNs <= logTimeNs) {
        this.entities.delete(entity.id)
      }
      else {
        this.entities.set(entity.id, { entity, expiresAtNs })
        if (
          expiresAtNs !== null
          && (this.nextExpirationNs === null || expiresAtNs < this.nextExpirationNs)
        ) {
          this.nextExpirationNs = expiresAtNs
        }
      }
    }
  }

  replaceWithFullUpdate(payload: any, logTimeNs: bigint): void {
    this.clear()
    this.applyMutation(payload, logTimeNs)
  }

  advanceTo(logTimeNs: bigint): void {
    this.removeExpired(logTimeNs)
  }

  toFullUpdate(logTimeNs: bigint): { entities: any[] } {
    this.advanceTo(logTimeNs)
    return {
      entities: Array.from(this.entities.values(), ({ entity, expiresAtNs }) => {
        if (expiresAtNs === null) {
          return entity
        }
        const remainingNs = expiresAtNs - logTimeNs
        return {
          ...entity,
          lifetime: {
            ...entity.lifetime,
            sec: (remainingNs / 1_000_000_000n).toString(),
            nsec: Number(remainingNs % 1_000_000_000n),
          },
        }
      }),
    }
  }

  snapshot(): ParsedSceneUpdate {
    return parseSceneUpdate(
      { entities: Array.from(this.entities.values(), entry => entry.entity) },
    )
  }

  private removeExpired(logTimeNs: bigint) {
    if (this.nextExpirationNs === null || this.nextExpirationNs > logTimeNs) {
      return
    }
    let nextExpirationNs: bigint | null = null
    for (const [id, entry] of this.entities) {
      if (entry.expiresAtNs !== null && entry.expiresAtNs <= logTimeNs) {
        this.entities.delete(id)
      }
      else if (
        entry.expiresAtNs !== null
        && (nextExpirationNs === null || entry.expiresAtNs < nextExpirationNs)
      ) {
        nextExpirationNs = entry.expiresAtNs
      }
    }
    this.nextExpirationNs = nextExpirationNs
  }
}

function parseVector(value: any, fallback: Vector3Tuple = [0, 0, 0]): Vector3Tuple {
  return [value?.x ?? fallback[0], value?.y ?? fallback[1], value?.z ?? fallback[2]]
}

function parseOrientation(value: any): QuaternionTuple {
  return [value?.x ?? 0, value?.y ?? 0, value?.z ?? 0, value?.w ?? 1]
}

function parseColor(value: any, fallback: ColorTuple): ColorTuple {
  return [value?.r ?? fallback[0], value?.g ?? fallback[1], value?.b ?? fallback[2], value?.a ?? fallback[3]]
}

function parsePose(value: any): Pick<ParsedPrimitive, 'position' | 'orientation'> {
  return {
    position: parseVector(value?.pose?.position),
    orientation: parseOrientation(value?.pose?.orientation),
  }
}

function parseLineType(value: unknown): LineType {
  if (value === 'LINE_LOOP' || value === 1) {
    return 'LINE_LOOP'
  }
  if (value === 'LINE_LIST' || value === 2) {
    return 'LINE_LIST'
  }
  return 'LINE_STRIP'
}

function parsePoints(points: unknown): Vector3Tuple[] {
  if (!Array.isArray(points)) {
    return []
  }
  return points.map(point => parseVector(point))
}

function parseColors(colors: unknown): ColorTuple[] {
  if (!Array.isArray(colors)) {
    return []
  }
  return colors.map(color => parseColor(color, [1, 1, 1, 1]))
}

function parseIndices(indices: unknown): number[] {
  return Array.isArray(indices) ? indices.map(index => Number(index)) : []
}

export function parseSceneUpdate(payload: any): ParsedSceneUpdate {
  const scene = createEmptySceneUpdate()

  if (!payload || !Array.isArray(payload.entities)) {
    return scene
  }

  for (const entity of payload.entities) {
    const entityId = entity.id || 'entity'
    const frameId = entity.frame_id || 'base_link'
    let category: string | undefined
    if (Array.isArray(entity.metadata)) {
      const categoryMetadata = entity.metadata.find((metadata: any) => metadata.key === 'category')
      category = categoryMetadata?.value
    }

    for (const [index, arrow] of (entity.arrows || []).entries()) {
      const pose = parsePose(arrow)
      scene.arrows.push({
        id: `${entityId}-arrow-${index}`,
        ...pose,
        shaftLength: arrow.shaft_length || 1,
        shaftDiameter: arrow.shaft_diameter || 0.1,
        headLength: arrow.head_length || 0.25,
        headDiameter: arrow.head_diameter || 0.2,
        color: parseColor(arrow.color, [0.2, 0.8, 1, 1]),
        frameId,
      })
    }

    for (const [index, cube] of (entity.cubes || []).entries()) {
      const pose = parsePose(cube)
      const size = parseVector(cube.size, [1, 1, 1])
      scene.cubes.push({
        id: `${entityId}-cube-${index}`,
        ...pose,
        size,
        color: parseColor(cube.color, [0.2, 0.8, 1, 0.5]),
        category,
        frameId,
      })
    }

    for (const [index, sphere] of (entity.spheres || []).entries()) {
      const pose = parsePose(sphere)
      scene.spheres.push({
        id: `${entityId}-sphere-${index}`,
        ...pose,
        size: parseVector(sphere.size, [1, 1, 1]),
        color: parseColor(sphere.color, [0.2, 0.8, 1, 1]),
        frameId,
      })
    }

    for (const [index, cylinder] of (entity.cylinders || []).entries()) {
      const pose = parsePose(cylinder)
      scene.cylinders.push({
        id: `${entityId}-cylinder-${index}`,
        ...pose,
        size: parseVector(cylinder.size, [1, 1, 1]),
        bottomScale: cylinder.bottom_scale || 1,
        topScale: cylinder.top_scale || 1,
        color: parseColor(cylinder.color, [0.2, 0.8, 1, 1]),
        frameId,
      })
    }

    for (const [index, line] of (entity.lines || []).entries()) {
      const pose = parsePose(line)
      scene.lines.push({
        id: `${entityId}-line-${index}`,
        ...pose,
        type: parseLineType(line.type),
        thickness: line.thickness || 1,
        scaleInvariant: Boolean(line.scale_invariant),
        points: parsePoints(line.points),
        color: parseColor(line.color, [0.2, 0.8, 1, 1]),
        colors: parseColors(line.colors),
        indices: parseIndices(line.indices),
        frameId,
      })
    }

    for (const [index, triangles] of (entity.triangles || []).entries()) {
      const pose = parsePose(triangles)
      scene.triangles.push({
        id: `${entityId}-triangles-${index}`,
        ...pose,
        points: parsePoints(triangles.points),
        color: parseColor(triangles.color, [0.2, 0.8, 1, 1]),
        colors: parseColors(triangles.colors),
        indices: parseIndices(triangles.indices),
        frameId,
      })
    }

    for (const [index, text] of (entity.texts || []).entries()) {
      const pose = parsePose(text)
      scene.texts.push({
        id: `${entityId}-text-${index}`,
        ...pose,
        text: text.text || '',
        fontSize: text.font_size || 1,
        billboard: Boolean(text.billboard),
        scaleInvariant: Boolean(text.scale_invariant),
        color: parseColor(text.color, [1, 1, 1, 1]),
        frameId,
      })
    }

    for (const [index, model] of (entity.models || []).entries()) {
      const pose = parsePose(model)
      scene.models.push({
        id: `${entityId}-model-${index}`,
        ...pose,
        scale: parseVector(model.scale, [1, 1, 1]),
        color: parseColor(model.color, [1, 1, 1, 1]),
        overrideColor: Boolean(model.override_color),
        url: model.url,
        mediaType: model.media_type,
        data: model.data,
        frameId,
      })
    }
  }

  return scene
}
