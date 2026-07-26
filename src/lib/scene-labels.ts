interface SceneMetadata {
  key?: unknown
  value?: unknown
}

interface SceneEntity {
  id?: unknown
  frame_id?: unknown
  metadata?: unknown
  cubes?: unknown
}

interface SceneUpdatePayload {
  entities?: unknown
}

function asSceneUpdatePayload(value: unknown): SceneUpdatePayload | null {
  return typeof value === 'object' && value !== null
    ? value as SceneUpdatePayload
    : null
}

function asSceneEntity(value: unknown): SceneEntity | null {
  return typeof value === 'object' && value !== null
    ? value as SceneEntity
    : null
}

function asMetadata(value: unknown): SceneMetadata | null {
  return typeof value === 'object' && value !== null
    ? value as SceneMetadata
    : null
}

function formatFieldValue(value: unknown): string | null {
  if (typeof value === 'string') {
    return value.trim() || null
  }
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') {
    return String(value)
  }
  return null
}

export function collectSceneLabelFields(payload: unknown): string[] {
  const sceneUpdate = asSceneUpdatePayload(payload)
  if (!sceneUpdate || !Array.isArray(sceneUpdate.entities)) {
    return []
  }

  let hasId = false
  let hasFrameId = false
  const metadataFields = new Set<string>()

  for (const value of sceneUpdate.entities) {
    const entity = asSceneEntity(value)
    if (!entity || !Array.isArray(entity.cubes) || entity.cubes.length === 0) {
      continue
    }

    hasId ||= formatFieldValue(entity.id) !== null
    hasFrameId ||= formatFieldValue(entity.frame_id) !== null

    if (!Array.isArray(entity.metadata)) {
      continue
    }
    for (const metadataValue of entity.metadata) {
      const metadata = asMetadata(metadataValue)
      const key = formatFieldValue(metadata?.key)
      if (key) {
        metadataFields.add(`metadata.${key}`)
      }
    }
  }

  return [
    ...(hasId ? ['id'] : []),
    ...(hasFrameId ? ['frame_id'] : []),
    ...Array.from(metadataFields).sort(),
  ]
}

export function getSceneEntityLabel(entityValue: unknown, fields: readonly string[]): string | null {
  const entity = asSceneEntity(entityValue)
  if (!entity) {
    return null
  }

  const values: string[] = []
  for (const field of fields) {
    let value: string | null = null
    if (field === 'id') {
      value = formatFieldValue(entity.id)
    }
    else if (field === 'frame_id') {
      value = formatFieldValue(entity.frame_id)
    }
    else if (field.startsWith('metadata.') && Array.isArray(entity.metadata)) {
      const metadataKey = field.slice('metadata.'.length)
      const metadata = entity.metadata
        .map(asMetadata)
        .find(item => formatFieldValue(item?.key) === metadataKey)
      value = formatFieldValue(metadata?.value)
    }

    if (value) {
      values.push(value)
    }
  }

  return values.length > 0 ? values.join(' · ') : null
}
