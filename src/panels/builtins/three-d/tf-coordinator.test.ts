import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { globalMessagePipeline } from '@/panels/runtime/message-pipeline'
import { FrameTransformCoordinator } from './tf-coordinator'
import { getFrameIdsSnapshot } from './tf-frame-catalog'

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

  it('selects the same conventional fixed frame regardless of TF insertion order', () => {
    const coordinator = new FrameTransformCoordinator()

    coordinator.consume({
      parent_frame_id: 'odom',
      child_frame_id: 'body',
      translation: { x: 1, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    })
    coordinator.consume({
      parent_frame_id: 'world',
      child_frame_id: 'unrelated_sensor',
      translation: { x: 2, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    })

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

  it('exposes display-frame transforms relative to the resolved fixed frame', () => {
    const coordinator = new FrameTransformCoordinator()
    coordinator.consume({
      parent_frame_id: 'map',
      child_frame_id: 'base_link',
      translation: { x: 411, y: 1181, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    })

    expect(coordinator.getFrameTransform('map')?.elements).toEqual(new THREE.Matrix4().identity().elements)
    expect(coordinator.getFrameTransform('/base_link')?.elements[12]).toBeCloseTo(411)
    expect(coordinator.getFrameTransform('missing')).toBeNull()
  })

  it('publishes every available parent and child frame for panel settings', () => {
    const panelId = 'tf-frame-options-test'
    const coordinator = new FrameTransformCoordinator(panelId)
    coordinator.consume({
      parent_frame_id: 'map',
      child_frame_id: 'base_link',
      translation: { x: 1, y: 2, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    })
    coordinator.consume({
      parent_frame_id: 'base_link',
      child_frame_id: '/LIDAR_TOP',
      translation: { x: 1, y: 0, z: 2 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    })

    expect(getFrameIdsSnapshot(panelId)).toEqual(['LIDAR_TOP', 'base_link', 'map'])
    coordinator.disconnect()
    expect(getFrameIdsSnapshot(panelId)).toEqual([])
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

  it('uses one deterministic authority when TF topics publish the same child', () => {
    const coordinator = new FrameTransformCoordinator()
    const body = new THREE.Group()
    coordinator.registerFrameTarget(body, 'body')

    coordinator.consume({
      parent_frame_id: 'world',
      child_frame_id: 'body',
      translation: { x: 1, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    }, false, '/refined/tf')
    expect(body.position.x).toBeCloseTo(1)

    coordinator.consume({
      parent_frame_id: 'world',
      child_frame_id: 'body',
      translation: { x: 2, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    }, false, '/tf')
    expect(body.position.x).toBeCloseTo(2)

    coordinator.consume({
      parent_frame_id: 'world',
      child_frame_id: 'body',
      translation: { x: 3, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    }, false, '/refined/tf')
    expect(body.position.x).toBeCloseTo(2)

    coordinator.consume({
      parent_frame_id: 'world',
      child_frame_id: 'body',
      translation: { x: 4, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    }, false, '/tf')
    expect(body.position.x).toBeCloseTo(4)
  })

  it('lets dynamic TF override a conflicting static transform', () => {
    const coordinator = new FrameTransformCoordinator()
    const lidar = new THREE.Group()
    coordinator.registerFrameTarget(lidar, 'lidar')

    coordinator.consume({
      parent_frame_id: 'world',
      child_frame_id: 'lidar',
      translation: { x: 1, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    }, false, '/tf_static')
    coordinator.consume({
      parent_frame_id: 'world',
      child_frame_id: 'lidar',
      translation: { x: 2, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    }, false, '/refined/tf')
    coordinator.consume({
      parent_frame_id: 'world',
      child_frame_id: 'lidar',
      translation: { x: 3, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    }, false, '/tf_static')

    expect(lidar.position.x).toBeCloseTo(2)
  })

  it('applies the authoritative TF snapshot atomically after seek', () => {
    const panelId = 'tf-seek-atomic-test'
    const coordinator = new FrameTransformCoordinator(panelId)
    const body = new THREE.Group()
    coordinator.registerFrameTarget(body, 'body')
    coordinator.connect(['/refined/tf', '/tf'])

    const message = (topic: string, x: number, transformSnapshot = false) => ({
      topic,
      channelId: 1,
      logTime: 1n,
      publishTime: 1n,
      sequence: 1,
      dataLength: 0,
      transformSnapshot,
      payload: {
        parent_frame_id: 'world',
        child_frame_id: 'body',
        translation: { x, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
      },
    })

    try {
      globalMessagePipeline.dispatchToPanel(panelId, [message('/tf', 1)])
      expect(body.position.x).toBeCloseTo(1)
      expect(getFrameIdsSnapshot(panelId)).toEqual(['body', 'world'])

      globalMessagePipeline.emitSeek(10n)
      globalMessagePipeline.dispatchToPanel(panelId, [
        message('/refined/tf', 100, true),
        message('/tf', 2),
      ])
      expect(body.position.x).toBeCloseTo(1)
      expect(getFrameIdsSnapshot(panelId)).toEqual(['body', 'world'])

      globalMessagePipeline.emitSeekComplete(10n)
      expect(body.position.x).toBeCloseTo(2)
      expect(getFrameIdsSnapshot(panelId)).toEqual(['body', 'world'])

      globalMessagePipeline.dispatchToPanel(panelId, [message('/refined/tf', 200)])
      expect(body.position.x).toBeCloseTo(2)
    }
    finally {
      coordinator.disconnect()
    }
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
