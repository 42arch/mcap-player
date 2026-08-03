import type { ThreeDSettings } from '@/stores/use-player-store'
import * as THREE from 'three'

export type CameraFollowMode = ThreeDSettings['followMode']

export interface FollowViewport {
  cameraPosition: THREE.Vector3
  cameraUp: THREE.Vector3
  target: THREE.Vector3
}

const Z_AXIS = new THREE.Vector3(0, 0, 1)
const X_AXIS = new THREE.Vector3(1, 0, 0)

function headingFromMatrix(matrix: THREE.Matrix4): number {
  const rotation = new THREE.Quaternion().setFromRotationMatrix(matrix)
  const forward = X_AXIS.clone().applyQuaternion(rotation)
  return Math.atan2(forward.y, forward.x)
}

function normalizeAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle))
}

/** Applies the display-frame motion between two samples to the camera viewport. */
export function applyCameraFollow(
  viewport: FollowViewport,
  previous: THREE.Matrix4,
  current: THREE.Matrix4,
  mode: CameraFollowMode,
): void {
  if (mode === 'follow-none') {
    return
  }

  const previousPosition = new THREE.Vector3().setFromMatrixPosition(previous)
  const currentPosition = new THREE.Vector3().setFromMatrixPosition(current)

  if (mode === 'follow-position') {
    const translation = currentPosition.sub(previousPosition)
    viewport.cameraPosition.add(translation)
    viewport.target.add(translation)
    viewport.cameraUp.copy(Z_AXIS)
    return
  }

  if (mode === 'follow-heading') {
    const headingDelta = normalizeAngle(headingFromMatrix(current) - headingFromMatrix(previous))
    viewport.cameraPosition.sub(previousPosition).applyAxisAngle(Z_AXIS, headingDelta).add(currentPosition)
    viewport.target.sub(previousPosition).applyAxisAngle(Z_AXIS, headingDelta).add(currentPosition)
    viewport.cameraUp.copy(Z_AXIS)
    return
  }

  const delta = current.clone().multiply(previous.clone().invert())
  const deltaRotation = new THREE.Quaternion().setFromRotationMatrix(delta)
  viewport.cameraPosition.applyMatrix4(delta)
  viewport.target.applyMatrix4(delta)
  viewport.cameraUp.applyQuaternion(deltaRotation).normalize()
}
