import * as THREE from 'three'
import { globalMessagePipeline } from '@/panels/runtime/message-pipeline'
import { clearFrameIds, setFrameIds } from './tf-frame-catalog'

interface TransformRecord {
  parentFrameId: string
  childFrameId: string
  translation: { x?: number, y?: number, z?: number }
  rotation: { x?: number, y?: number, z?: number, w?: number }
}

function normalizeFrameId(frameId: unknown): string {
  return typeof frameId === 'string' ? frameId.replace(/^\/+/, '') : ''
}

function normalizeTransformTopic(topic: unknown): string {
  if (typeof topic !== 'string') {
    return ''
  }
  const normalized = topic.trim().toLowerCase().replace(/\/+$/, '')
  return normalized.startsWith('/') ? normalized : `/${normalized}`
}

function getTransformTopicPriority(topic: string): number {
  if (topic === '/tf') {
    return 3
  }
  if (topic.endsWith('/tf_static')) {
    return 1
  }
  return topic ? 2 : 0
}

/**
 * A TF tree may contain the same child on several discovered TF topics. ROS
 * requires a child to have one authority, so choose one deterministically:
 * canonical /tf, then another dynamic topic, then a static topic. This keeps
 * seek snapshots and live playback from alternating between authorities.
 */
function isPreferredTransformTopic(incoming: string, current: string): boolean {
  const incomingPriority = getTransformTopicPriority(incoming)
  const currentPriority = getTransformTopicPriority(current)
  if (incomingPriority !== currentPriority) {
    return incomingPriority > currentPriority
  }
  return incoming.localeCompare(current) < 0
}

function getAutomaticFixedFramePriority(frameId: string): number {
  const frameName = frameId.split('/').at(-1)?.toLowerCase()
  switch (frameName) {
    case 'earth':
      return 4
    case 'world':
      return 3
    case 'map':
      return 2
    case 'odom':
      return 1
    default:
      return 0
  }
}

function compareAutomaticFixedFrames(a: string, b: string): number {
  const priorityDifference = getAutomaticFixedFramePriority(b) - getAutomaticFixedFramePriority(a)
  return priorityDifference || a.localeCompare(b)
}

function extractTransforms(payload: any): TransformRecord[] {
  if (!payload) {
    return []
  }

  // foxglove.FrameTransform represents one transform per MCAP message.
  if (payload.parent_frame_id || payload.parentFrameId) {
    return [{
      parentFrameId: payload.parent_frame_id || payload.parentFrameId,
      childFrameId: payload.child_frame_id || payload.childFrameId,
      translation: payload.translation,
      rotation: payload.rotation,
    }]
  }

  // ROS tf2_msgs/TFMessage batches transforms in one message.
  if (!Array.isArray(payload.transforms)) {
    return []
  }
  return payload.transforms.map((transform: any) => ({
    parentFrameId: transform?.header?.frame_id || transform?.header?.frameId,
    childFrameId: transform?.child_frame_id || transform?.childFrameId,
    translation: transform?.transform?.translation,
    rotation: transform?.transform?.rotation,
  }))
}

/**
 * Resolves the complete, current TF tree into the render root. Targets are
 * updated imperatively so high-rate TF traffic never enters React state.
 */
export class FrameTransformCoordinator {
  private unsubscribers: (() => void)[] = []
  private listeners = new Set<() => void>()
  private transformsByChild = new Map<string, THREE.Matrix4>()
  private sourceTopicByChild = new Map<string, string>()
  private parentByChild = new Map<string, string>()
  private childrenByParent = new Map<string, Set<string>>()
  private targets = new Map<THREE.Object3D, string>()
  private fallbackTransforms = new Map<THREE.Object3D, THREE.Matrix4>()
  private legacyLidarMatchers = new Map<THREE.Object3D, (frameId: string) => boolean>()
  private configuredFixedFrameId: string | null = null
  private receivedSinceSeek = true
  private isSeeking = false
  private fixedFrameBeforeSeek: string | null = null

  constructor(private readonly panelId = 'standalone') {}

  connect(topics: readonly string[] = ['/tf']) {
    this.disconnectSubscriptions()
    this.isSeeking = false
    this.fixedFrameBeforeSeek = null
    this.receivedSinceSeek = true
    this.unsubscribers.push(globalMessagePipeline.subscribeSeek(this.panelId, () => {
      this.fixedFrameBeforeSeek = this.getResolvedFixedFrame()
      this.isSeeking = true
      this.receivedSinceSeek = false
    }))
    this.unsubscribers.push(globalMessagePipeline.subscribeSeekComplete(this.panelId, () => {
      if (!this.receivedSinceSeek) {
        this.clearTransformState(false)
      }
      this.isSeeking = false
      this.publishFrameIds()
      this.updateTargets()
      this.notifyIfFixedFrameChanged(this.fixedFrameBeforeSeek)
      this.fixedFrameBeforeSeek = null
    }))
    for (const topic of new Set(topics)) {
      this.unsubscribers.push(globalMessagePipeline.subscribe({
        panelId: this.panelId,
        subscriptionId: `tf:${topic}`,
        topics: [{ topic, mode: 'all' }],
      }, (message: any) => {
        this.receivedSinceSeek = true
        this.consume(message?.payload, message?.transformSnapshot === true, message?.topic)
      }))
    }
  }

  disconnect() {
    this.disconnectSubscriptions()
    this.isSeeking = false
    this.fixedFrameBeforeSeek = null
    this.receivedSinceSeek = true
    this.clearTransformState()
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getFixedFrameSnapshot = (): string => this.getResolvedFixedFrame() || ''

  /** Returns T(fixed <- frame) for viewport and tool consumers. */
  getFrameTransform(frameId: string): THREE.Matrix4 | null {
    const normalizedFrameId = normalizeFrameId(frameId)
    const fixedFrameId = this.getResolvedFixedFrame()
    if (!normalizedFrameId || !fixedFrameId) {
      return null
    }
    if (normalizedFrameId === fixedFrameId) {
      return new THREE.Matrix4().identity()
    }
    return this.lookupTransform(normalizedFrameId, fixedFrameId)
  }

  /** Selects an explicit fixed frame, or derives one from the TF graph in auto mode. */
  setFixedFrame(frameId: string) {
    const normalized = frameId.trim().toLowerCase() === 'auto'
      ? null
      : normalizeFrameId(frameId)
    if (normalized === this.configuredFixedFrameId) {
      return
    }
    const previousFixedFrame = this.getResolvedFixedFrame()
    this.configuredFixedFrameId = normalized
    this.updateTargets()
    this.notifyIfFixedFrameChanged(previousFixedFrame)
  }

  registerFrameTarget(object: THREE.Object3D, frameId: string, preserveCurrentTransform = false): () => void {
    if (preserveCurrentTransform) {
      object.updateMatrix()
      this.fallbackTransforms.set(object, object.matrix.clone())
    }
    this.targets.set(object, normalizeFrameId(frameId))
    this.applyTransform(object)
    return () => {
      this.targets.delete(object)
      this.fallbackTransforms.delete(object)
    }
  }

  setFrameTarget(object: THREE.Object3D, frameId: string) {
    if (!this.targets.has(object)) {
      return
    }
    this.targets.set(object, normalizeFrameId(frameId))
    this.applyTransform(object)
  }

  /** @deprecated Use registerFrameTarget with a message frame_id instead. */
  registerMapTarget(object: THREE.Object3D): () => void {
    return this.registerFrameTarget(object, 'map')
  }

  /** @deprecated Use registerFrameTarget with a message frame_id instead. */
  registerLidarTarget(object: THREE.Object3D, matches: (frameId: string) => boolean): () => void {
    this.targets.set(object, '')
    this.legacyLidarMatchers.set(object, matches)
    return () => {
      this.targets.delete(object)
      this.fallbackTransforms.delete(object)
      this.legacyLidarMatchers.delete(object)
    }
  }

  consume(payload: any, replaceState = false, sourceTopic = '') {
    const previousFixedFrame = this.getResolvedFixedFrame()
    if (replaceState) {
      this.clearTransformState(false)
    }
    const normalizedSourceTopic = normalizeTransformTopic(sourceTopic)
    let hasChanges = false
    for (const transform of extractTransforms(payload)) {
      const parent = normalizeFrameId(transform.parentFrameId)
      const child = normalizeFrameId(transform.childFrameId)
      if (!parent || !child) {
        continue
      }
      const currentSourceTopic = this.sourceTopicByChild.get(child)
      if (
        currentSourceTopic !== undefined
        && currentSourceTopic !== normalizedSourceTopic
        && !isPreferredTransformTopic(normalizedSourceTopic, currentSourceTopic)
      ) {
        continue
      }
      const translation = transform.translation || {}
      const rotation = transform.rotation || {}
      const matrix = new THREE.Matrix4().compose(
        new THREE.Vector3(translation.x || 0, translation.y || 0, translation.z || 0),
        new THREE.Quaternion(rotation.x || 0, rotation.y || 0, rotation.z || 0, rotation.w ?? 1),
        new THREE.Vector3(1, 1, 1),
      )
      const previousParent = this.parentByChild.get(child)
      if (previousParent && previousParent !== parent) {
        const previousChildren = this.childrenByParent.get(previousParent)
        previousChildren?.delete(child)
        if (previousChildren?.size === 0) {
          this.childrenByParent.delete(previousParent)
        }
      }
      this.transformsByChild.set(child, matrix)
      this.sourceTopicByChild.set(child, normalizedSourceTopic)
      this.parentByChild.set(child, parent)
      let children = this.childrenByParent.get(parent)
      if (!children) {
        children = new Set()
        this.childrenByParent.set(parent, children)
      }
      children.add(child)
      for (const [object, matches] of this.legacyLidarMatchers) {
        if (matches(child)) {
          this.targets.set(object, child)
        }
      }
      hasChanges = true
    }
    if (hasChanges && !this.isSeeking) {
      this.publishFrameIds()
      this.updateTargets()
    }
    if (!this.isSeeking) {
      this.notifyIfFixedFrameChanged(previousFixedFrame)
    }
  }

  private clearTransformState(notify = true) {
    const previousFixedFrame = this.getResolvedFixedFrame()
    this.transformsByChild.clear()
    this.sourceTopicByChild.clear()
    this.parentByChild.clear()
    this.childrenByParent.clear()
    if (!this.isSeeking) {
      clearFrameIds(this.panelId)
      for (const object of this.targets.keys()) {
        this.applyFallbackTransform(object)
      }
    }
    if (notify) {
      this.notifyIfFixedFrameChanged(previousFixedFrame)
    }
  }

  private disconnectSubscriptions() {
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe()
    }
    this.unsubscribers = []
  }

  private publishFrameIds() {
    setFrameIds(this.panelId, [
      ...this.childrenByParent.keys(),
      ...this.parentByChild.keys(),
    ])
  }

  private updateTargets() {
    for (const object of this.targets.keys()) {
      this.applyTransform(object)
    }
  }

  private getResolvedFixedFrame(): string | null {
    if (this.configuredFixedFrameId) {
      return this.configuredFixedFrameId
    }

    // A valid TF tree root is a parent frame that never appears as a child.
    // Snapshot reconstruction can insert the same roots in a different order
    // than live playback, so never let Map insertion order select the fixed
    // frame. Prefer conventional global frames, then a lexical fallback.
    const roots = Array.from(this.childrenByParent.keys())
      .filter(parentFrame => !this.parentByChild.has(parentFrame))
      .sort(compareAutomaticFixedFrames)
    return roots[0] || null
  }

  private notifyIfFixedFrameChanged(previousFixedFrame: string | null) {
    if (previousFixedFrame !== this.getResolvedFixedFrame()) {
      this.listeners.forEach(listener => listener())
    }
  }

  private applyTransform(object: THREE.Object3D) {
    const frameId = this.targets.get(object)
    const fixedFrameId = this.getResolvedFixedFrame()
    if (!frameId || frameId === fixedFrameId) {
      object.position.set(0, 0, 0)
      object.quaternion.identity()
      object.updateMatrix()
      return
    }

    if (!fixedFrameId) {
      this.applyFallbackTransform(object)
      return
    }

    const matrix = this.lookupTransform(frameId, fixedFrameId)
    if (!matrix) {
      this.applyFallbackTransform(object)
      return
    }
    matrix.decompose(object.position, object.quaternion, object.scale)
    object.updateMatrix()
  }

  private applyFallbackTransform(object: THREE.Object3D) {
    const fallback = this.fallbackTransforms.get(object)
    if (fallback) {
      fallback.decompose(object.position, object.quaternion, object.scale)
    }
    else {
      object.position.set(0, 0, 0)
      object.quaternion.identity()
      object.scale.set(1, 1, 1)
    }
    object.updateMatrix()
  }

  /** Returns T(fixed <- frame), traversing the latest known tree in either direction. */
  private lookupTransform(frameId: string, fixedFrameId: string): THREE.Matrix4 | null {
    const visited = new Set<string>()
    const pending = [{ frameId, matrix: new THREE.Matrix4().identity() }]

    while (pending.length > 0) {
      const current = pending.shift()!
      if (current.frameId === fixedFrameId) {
        return current.matrix
      }
      if (visited.has(current.frameId)) {
        continue
      }
      visited.add(current.frameId)

      const parent = this.parentByChild.get(current.frameId)
      const parentMatrix = this.transformsByChild.get(current.frameId)
      if (parent && parentMatrix) {
        pending.push({ frameId: parent, matrix: parentMatrix.clone().multiply(current.matrix) })
      }
      for (const child of this.childrenByParent.get(current.frameId) || []) {
        const childMatrix = this.transformsByChild.get(child)
        if (childMatrix) {
          pending.push({ frameId: child, matrix: childMatrix.clone().invert().multiply(current.matrix) })
        }
      }
    }
    return null
  }
}
