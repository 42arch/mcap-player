import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { FrameTransformCoordinator } from './tf-coordinator'

describe('frameTransformCoordinator', () => {
  it('updates registered map and lidar targets without React state', () => {
    const coordinator = new FrameTransformCoordinator()
    const map = new THREE.Group()
    const lidar = new THREE.Points()

    coordinator.setFixedFrame('base_link')
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
    coordinator.setFixedFrame('base_link')
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

  it('replaces stale transforms when consuming a seek snapshot', () => {
    const coordinator = new FrameTransformCoordinator()
    const camera = new THREE.Group()
    coordinator.registerFrameTarget(camera, 'camera')

    coordinator.consume({
      parent_frame_id: 'base_link',
      child_frame_id: 'camera',
      translation: { x: 5, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    })
    expect(camera.position.x).toBeCloseTo(5)

    coordinator.consume({
      parent_frame_id: 'base_link',
      child_frame_id: 'lidar',
      translation: { x: 8, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    }, true)
    expect(camera.position.toArray()).toEqual([0, 0, 0])

    coordinator.consume({
      parent_frame_id: 'base_link',
      child_frame_id: 'camera',
      translation: { x: 2, y: 1, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    }, true)
    expect(camera.position.toArray()).toEqual([2, 1, 0])
  })

  it('uses a registered fallback pose until a complete TF path is available', () => {
    const coordinator = new FrameTransformCoordinator()
    const arm = new THREE.Group()
    arm.position.set(1, 2, 3)
    coordinator.registerFrameTarget(arm, 'arm', true)

    coordinator.consume({
      parent_frame_id: 'base_link',
      child_frame_id: 'unrelated',
      translation: { x: 8, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    }, true)
    expect(arm.position.toArray()).toEqual([1, 2, 3])

    coordinator.consume({
      parent_frame_id: 'base_link',
      child_frame_id: 'arm',
      translation: { x: 4, y: 5, z: 6 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    })
    expect(arm.position.toArray()).toEqual([4, 5, 6])
  })

  it('derives the fixed frame from the transform graph in auto mode', () => {
    const coordinator = new FrameTransformCoordinator()
    const base = new THREE.Group()
    coordinator.registerFrameTarget(base, 'base_link_underpan')

    coordinator.consume({
      parent_frame_id: 'world',
      child_frame_id: 'base_link_underpan',
      translation: { x: 1, y: 2, z: 3 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    })
    expect(base.position.toArray()).toEqual([1, 2, 3])
    expect(coordinator.getFixedFrameSnapshot()).toBe('world')
  })

  it('lets the panel fixed-frame setting override automatic root selection', () => {
    const coordinator = new FrameTransformCoordinator()
    const base = new THREE.Group()
    coordinator.registerFrameTarget(base, 'base_link_underpan')
    coordinator.consume({
      parent_frame_id: 'world',
      child_frame_id: 'base_link_underpan',
      translation: { x: 1, y: 2, z: 3 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    })

    coordinator.setFixedFrame('base_link_underpan')
    expect(base.position.toArray()).toEqual([0, 0, 0])
    expect(coordinator.getFixedFrameSnapshot()).toBe('base_link_underpan')
  })

  it('notifies subscribers only when the resolved fixed frame changes', () => {
    const coordinator = new FrameTransformCoordinator()
    let notifications = 0
    const unsubscribe = coordinator.subscribe(() => notifications++)

    coordinator.consume({
      parent_frame_id: 'world',
      child_frame_id: 'base_link',
      translation: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    })
    coordinator.consume({
      parent_frame_id: 'base_link',
      child_frame_id: 'camera',
      translation: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    })
    coordinator.setFixedFrame('camera')
    unsubscribe()

    expect(notifications).toBe(2)
  })

  it('recomputes the automatic root when a frame is reparented', () => {
    const coordinator = new FrameTransformCoordinator()
    const camera = new THREE.Group()
    coordinator.registerFrameTarget(camera, 'camera')

    coordinator.consume({
      parent_frame_id: 'old_world',
      child_frame_id: 'camera',
      translation: { x: 1, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    })
    coordinator.consume({
      parent_frame_id: 'new_world',
      child_frame_id: 'camera',
      translation: { x: 2, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    })

    expect(coordinator.getFixedFrameSnapshot()).toBe('new_world')
    expect(camera.position.x).toBeCloseTo(2)
  })

  it('keeps frame targets registered while transform subscriptions reconnect', () => {
    const coordinator = new FrameTransformCoordinator()
    const camera = new THREE.Group()
    coordinator.registerFrameTarget(camera, 'camera')

    coordinator.disconnect()
    coordinator.consume({
      parent_frame_id: 'world',
      child_frame_id: 'camera',
      translation: { x: 3, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    })

    expect(camera.position.x).toBeCloseTo(3)
  })
})
