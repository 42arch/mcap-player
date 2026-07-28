import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { FrameTransformCoordinator } from './tf-coordinator'

describe('frameTransformCoordinator', () => {
  it('updates registered map and lidar targets without React state', () => {
    const coordinator = new FrameTransformCoordinator()
    const map = new THREE.Group()
    const lidar = new THREE.Points()

    coordinator.registerMapTarget(map)
    coordinator.registerLidarTarget(lidar, frame => frame === 'LIDAR_TOP')

    coordinator.consume({
      parent_frame_id: 'map',
      child_frame_id: 'base_link',
      translation: { x: 10, y: 2, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    })
    coordinator.consume({
      parent_frame_id: 'base_link',
      child_frame_id: '/LIDAR_TOP',
      translation: { x: 1, y: 2, z: 3 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    })

    expect(map.position.x).toBeCloseTo(-10)
    expect(map.position.y).toBeCloseTo(-2)
    expect(map.position.z).toBeCloseTo(0)
    expect(lidar.position.toArray()).toEqual([1, 2, 3])
  })

  it('applies the latest map transform to targets registered later', () => {
    const coordinator = new FrameTransformCoordinator()
    coordinator.consume({
      parent_frame_id: '/map',
      child_frame_id: '/base_link',
      translation: { x: 4, y: 0, z: 1 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    })

    const map = new THREE.Group()
    coordinator.registerMapTarget(map)

    expect(map.position.x).toBeCloseTo(-4)
    expect(map.position.y).toBeCloseTo(0)
    expect(map.position.z).toBeCloseTo(-1)
  })

  it('consumes every transform carried by a ROS TFMessage', () => {
    const coordinator = new FrameTransformCoordinator()
    const hand = new THREE.Group()
    coordinator.registerFrameTarget(hand, 'right_hand')

    coordinator.consume({
      transforms: [
        {
          header: { frame_id: 'base_link' },
          child_frame_id: 'shoulder',
          transform: {
            translation: { x: 1, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
          },
        },
        {
          header: { frame_id: 'shoulder' },
          child_frame_id: 'right_hand',
          transform: {
            translation: { x: 0, y: 2, z: 0 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
          },
        },
      ],
    })

    expect(hand.position.toArray()).toEqual([1, 2, 0])
  })
})
