import * as THREE from 'three'
import { globalMessageBus } from '@/core/message-bus'

type FrameMatcher = (childFrameId: string) => boolean

interface LidarTarget {
  object: THREE.Object3D
  matches: FrameMatcher
}

function normalizeFrameId(frameId: unknown): string {
  return typeof frameId === 'string' ? frameId.replace(/^\/+/, '') : ''
}

/**
 * Owns the single high-frequency /tf subscription for a 3D panel.
 * Targets are updated imperatively so TF traffic never enters React state.
 */
export class FrameTransformCoordinator {
  private unsubscribe: (() => void) | null = null
  private mapTargets = new Set<THREE.Object3D>()
  private lidarTargets = new Set<LidarTarget>()
  private mapPosition = new THREE.Vector3()
  private mapQuaternion = new THREE.Quaternion()
  private hasMapTransform = false

  connect() {
    if (this.unsubscribe) {
      return
    }
    this.unsubscribe = globalMessageBus.subscribe('/tf', (message: any) => {
      this.consume(message?.payload)
    })
  }

  disconnect() {
    this.unsubscribe?.()
    this.unsubscribe = null
    this.mapTargets.clear()
    this.lidarTargets.clear()
    this.hasMapTransform = false
  }

  registerMapTarget(object: THREE.Object3D): () => void {
    this.mapTargets.add(object)
    if (this.hasMapTransform) {
      this.applyMapTransform(object)
    }
    return () => this.mapTargets.delete(object)
  }

  registerLidarTarget(object: THREE.Object3D, matches: FrameMatcher): () => void {
    const target = { object, matches }
    this.lidarTargets.add(target)
    return () => this.lidarTargets.delete(target)
  }

  consume(payload: any) {
    if (!payload) {
      return
    }

    const parentFrameId = normalizeFrameId(payload.parent_frame_id)
    const childFrameId = normalizeFrameId(payload.child_frame_id)
    const translation = payload.translation
    const rotation = payload.rotation

    if (parentFrameId === 'map' && childFrameId === 'base_link') {
      this.mapQuaternion.set(
        rotation?.x ?? 0,
        rotation?.y ?? 0,
        rotation?.z ?? 0,
        rotation?.w ?? 1,
      ).invert()
      this.mapPosition.set(
        translation?.x ?? 0,
        translation?.y ?? 0,
        translation?.z ?? 0,
      ).applyQuaternion(this.mapQuaternion).multiplyScalar(-1)
      this.hasMapTransform = true
      for (const target of this.mapTargets) {
        this.applyMapTransform(target)
      }
      return
    }

    if (parentFrameId !== 'base_link') {
      return
    }

    for (const target of this.lidarTargets) {
      if (!target.matches(childFrameId)) {
        continue
      }
      target.object.position.set(
        translation?.x ?? 0,
        translation?.y ?? 0,
        translation?.z ?? 0,
      )
      target.object.quaternion.set(
        rotation?.x ?? 0,
        rotation?.y ?? 0,
        rotation?.z ?? -0.7071,
        rotation?.w ?? 0.7071,
      )
      target.object.updateMatrix()
    }
  }

  private applyMapTransform(object: THREE.Object3D) {
    object.position.copy(this.mapPosition)
    object.quaternion.copy(this.mapQuaternion)
    object.updateMatrix()
  }
}
