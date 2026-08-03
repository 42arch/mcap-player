import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { applyCameraFollow } from './camera-follow'

function transform(position: [number, number, number], yaw = 0, pitch = 0): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, pitch, yaw)),
    new THREE.Vector3(1, 1, 1),
  )
}

function viewport() {
  return {
    cameraPosition: new THREE.Vector3(-5, -5, 5),
    cameraUp: new THREE.Vector3(0, 0, 1),
    target: new THREE.Vector3(0, 0, 0),
  }
}

describe('applyCameraFollow', () => {
  it('does not update the viewport when follow mode is off', () => {
    const view = viewport()
    applyCameraFollow(view, transform([0, 0, 0]), transform([10, 2, 0], Math.PI / 2), 'follow-none')

    expect(view.cameraPosition.toArray()).toEqual([-5, -5, 5])
    expect(view.target.toArray()).toEqual([0, 0, 0])
  })

  it('follows translation without rotation in position mode', () => {
    const view = viewport()
    view.cameraUp.set(0, 1, 0)
    applyCameraFollow(view, transform([1, 2, 0]), transform([4, 6, 1], Math.PI / 2), 'follow-position')

    expect(view.cameraPosition.toArray()).toEqual([-2, -1, 6])
    expect(view.target.toArray()).toEqual([3, 4, 1])
    expect(view.cameraUp.toArray()).toEqual([0, 0, 1])
  })

  it('follows translation and yaw while keeping the horizon level in heading mode', () => {
    const view = viewport()
    view.cameraUp.set(0, 1, 0)
    applyCameraFollow(view, transform([0, 0, 0]), transform([10, 0, 0], Math.PI / 2, Math.PI / 4), 'follow-heading')

    expect(view.cameraPosition.x).toBeCloseTo(15)
    expect(view.cameraPosition.y).toBeCloseTo(-5)
    expect(view.cameraPosition.z).toBeCloseTo(5)
    expect(view.target.toArray()).toEqual([10, 0, 0])
    expect(view.cameraUp.toArray()).toEqual([0, 0, 1])
  })

  it('follows the full display-frame pose in pose mode', () => {
    const view = viewport()
    applyCameraFollow(view, transform([0, 0, 0]), transform([10, 0, 0], Math.PI / 2), 'follow-pose')

    expect(view.cameraPosition.x).toBeCloseTo(15)
    expect(view.cameraPosition.y).toBeCloseTo(-5)
    expect(view.cameraPosition.z).toBeCloseTo(5)
    expect(view.target.toArray()).toEqual([10, 0, 0])
    expect(view.cameraUp.toArray()).toEqual([0, 0, 1])
  })
})
