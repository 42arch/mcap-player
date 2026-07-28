import * as THREE from 'three'
import { globalMessagePipeline } from '@/panels/runtime/message-pipeline'

interface TransformRecord {
  parentFrameId: string
  childFrameId: string
  translation: { x?: number, y?: number, z?: number }
  rotation: { x?: number, y?: number, z?: number, w?: number }
}

function normalizeFrameId(frameId: unknown): string {
  return typeof frameId === 'string' ? frameId.replace(/^\/+/, '') : ''
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
  private transformsByChild = new Map<string, THREE.Matrix4>()
  private parentByChild = new Map<string, string>()
  private childrenByParent = new Map<string, Set<string>>()
  private targets = new Map<THREE.Object3D, string>()
  private legacyLidarMatchers = new Map<THREE.Object3D, (frameId: string) => boolean>()
  private rootFrameId = 'base_link'
  private receivedSinceSeek = true

  constructor(private readonly panelId = 'standalone') {}

  connect(topics: readonly string[] = ['/tf']) {
    this.disconnectSubscriptions()
    this.unsubscribers.push(globalMessagePipeline.subscribeSeek(this.panelId, () => {
      this.receivedSinceSeek = false
    }))
    this.unsubscribers.push(globalMessagePipeline.subscribeSeekComplete(this.panelId, () => {
      if (!this.receivedSinceSeek) {
        this.clearTransformState()
      }
    }))
    for (const topic of new Set(topics)) {
      this.unsubscribers.push(globalMessagePipeline.subscribe({
        panelId: this.panelId,
        subscriptionId: `tf:${topic}`,
        topics: [{ topic, mode: 'all' }],
      }, (message: any) => {
        this.receivedSinceSeek = true
        this.consume(message?.payload, message?.transformSnapshot === true)
      }))
    }
  }

  disconnect() {
    this.disconnectSubscriptions()
    this.clearTransformState()
    this.targets.clear()
    this.legacyLidarMatchers.clear()
  }

  setRootFrame(frameId: string) {
    const normalized = normalizeFrameId(frameId)
    if (!normalized || normalized === this.rootFrameId) {
      return
    }
    this.rootFrameId = normalized
    this.updateTargets()
  }

  registerFrameTarget(object: THREE.Object3D, frameId: string): () => void {
    this.targets.set(object, normalizeFrameId(frameId))
    this.applyTransform(object)
    return () => this.targets.delete(object)
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
      this.legacyLidarMatchers.delete(object)
    }
  }

  consume(payload: any, replaceState = false) {
    if (replaceState) {
      this.clearTransformState()
    }
    let hasChanges = false
    for (const transform of extractTransforms(payload)) {
      const parent = normalizeFrameId(transform.parentFrameId)
      const child = normalizeFrameId(transform.childFrameId)
      if (!parent || !child) {
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
        this.childrenByParent.get(previousParent)?.delete(child)
      }
      this.transformsByChild.set(child, matrix)
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
    if (hasChanges) {
      this.updateTargets()
    }
  }

  private clearTransformState() {
    this.transformsByChild.clear()
    this.parentByChild.clear()
    this.childrenByParent.clear()
    for (const object of this.targets.keys()) {
      object.position.set(0, 0, 0)
      object.quaternion.identity()
      object.scale.set(1, 1, 1)
      object.updateMatrix()
    }
  }

  private disconnectSubscriptions() {
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe()
    }
    this.unsubscribers = []
  }

  private updateTargets() {
    for (const object of this.targets.keys()) {
      this.applyTransform(object)
    }
  }

  private applyTransform(object: THREE.Object3D) {
    const frameId = this.targets.get(object)
    if (!frameId || frameId === this.rootFrameId) {
      object.position.set(0, 0, 0)
      object.quaternion.identity()
      object.updateMatrix()
      return
    }

    const matrix = this.lookupTransform(frameId)
    if (!matrix) {
      return
    }
    matrix.decompose(object.position, object.quaternion, object.scale)
    object.updateMatrix()
  }

  /** Returns T(root <- frame), traversing the latest known tree in either direction. */
  private lookupTransform(frameId: string): THREE.Matrix4 | null {
    const visited = new Set<string>()
    const pending = [{ frameId, matrix: new THREE.Matrix4().identity() }]

    while (pending.length > 0) {
      const current = pending.shift()!
      if (current.frameId === this.rootFrameId) {
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
