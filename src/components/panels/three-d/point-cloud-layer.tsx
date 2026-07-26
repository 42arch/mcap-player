import type { FrameTransformCoordinator } from '@/components/panels/three-d/tf-coordinator'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { globalMessageBus } from '@/core/message-bus'
import { parsePointCloud } from '@/lib/point-cloud-parser'
import { usePlayerStore } from '@/stores/use-player-store'

interface PointCloudLayerProps {
  topic: string
  onPointCountUpdate: (topic: string, count: number) => void
  tfCoordinator: FrameTransformCoordinator
}

export function PointCloudLayer({ topic, onPointCountUpdate, tfCoordinator }: PointCloudLayerProps) {
  const pointsRef = useRef<THREE.Points>(null)
  const geometryRef = useRef<THREE.BufferGeometry>(null)
  const lastPayloadRef = useRef<any>(null)

  const threeDSettings = usePlayerStore(state => state.threeDSettings)
  const colorMode = threeDSettings.colorMode
  const solidColor = threeDSettings.solidColor
  const maxPoints = threeDSettings.maxPoints
  const pointSize = threeDSettings.pointSize

  // Stable refs: avoid re-subscribing when settings or callbacks change
  const settingsRef = useRef({ colorMode, solidColor, maxPoints })
  settingsRef.current = { colorMode, solidColor, maxPoints }

  const onPointCountUpdateRef = useRef(onPointCountUpdate)
  onPointCountUpdateRef.current = onPointCountUpdate

  const posBufferRef = useRef<Float32Array>(new Float32Array(maxPoints * 3))
  const colBufferRef = useRef<Float32Array>(new Float32Array(maxPoints * 3))

  useEffect(() => {
    if (posBufferRef.current.length < maxPoints * 3) {
      posBufferRef.current = new Float32Array(maxPoints * 3)
      colBufferRef.current = new Float32Array(maxPoints * 3)
    }

    const geometry = geometryRef.current
    if (geometry) {
      const posAttr = new THREE.BufferAttribute(posBufferRef.current, 3)
      const colAttr = new THREE.BufferAttribute(colBufferRef.current, 3)
      posAttr.setUsage(THREE.DynamicDrawUsage)
      colAttr.setUsage(THREE.DynamicDrawUsage)
      geometry.setAttribute('position', posAttr)
      geometry.setAttribute('color', colAttr)
      geometry.setDrawRange(0, 0)
      geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 300)
    }
  }, [maxPoints])

  const lastReportedCountRef = useRef<number>(-1)
  const lastReportTimeRef = useRef<number>(0)

  const renderPayload = (payload: any) => {
    if (!payload || !geometryRef.current) {
      return
    }

    const geometry = geometryRef.current
    const posAttr = geometry.attributes.position as THREE.BufferAttribute
    const colAttr = geometry.attributes.color as THREE.BufferAttribute
    if (!posAttr || !colAttr) {
      return
    }

    const { colorMode: cm, solidColor: sc, maxPoints: mp } = settingsRef.current
    const parsed = parsePointCloud(payload, {
      colorMode: cm,
      solidColor: sc,
      maxPoints: mp,
    }, {
      positions: posAttr.array as Float32Array,
      colors: colAttr.array as Float32Array,
    })

    if (!parsed) {
      return
    }

    posAttr.needsUpdate = true
    colAttr.needsUpdate = true
    geometry.setDrawRange(0, parsed.pointCount)

    const now = performance.now()
    if (
      Math.abs(parsed.pointCount - lastReportedCountRef.current) > 500
      || now - lastReportTimeRef.current > 1000
    ) {
      lastReportedCountRef.current = parsed.pointCount
      lastReportTimeRef.current = now
      onPointCountUpdateRef.current(topic, parsed.pointCount)
    }
  }

  useEffect(() => {
    if (lastPayloadRef.current) {
      renderPayload(lastPayloadRef.current)
    }
  }, [colorMode, solidColor, maxPoints])

  useEffect(() => {
    if (!topic) {
      onPointCountUpdateRef.current(topic, 0)
      return
    }

    const points = pointsRef.current
    if (!points) {
      return
    }
    points.position.set(0.9437, 0, 1.8402)
    points.quaternion.set(-0.0065, 0.0106, -0.7063, 0.7078)
    const unregisterTf = tfCoordinator.registerLidarTarget(
      points,
      childFrameId => childFrameId === 'LIDAR_TOP' || topic.toLowerCase().includes(childFrameId.toLowerCase()),
    )

    const unsub = globalMessageBus.subscribe(topic, (msg: any) => {
      if (!msg || !msg.payload) {
        return
      }

      lastPayloadRef.current = msg.payload
      renderPayload(msg.payload)
    })

    const unsubSeek = globalMessageBus.subscribe('__seek__', () => {
      if (geometryRef.current) {
        geometryRef.current.setDrawRange(0, 0)
      }
      lastPayloadRef.current = null
      onPointCountUpdateRef.current(topic, 0)
    })

    return () => {
      unregisterTf()
      unsub()
      unsubSeek()
      onPointCountUpdateRef.current(topic, 0)
    }
  }, [topic, tfCoordinator])

  return (
    <points ref={pointsRef}>
      <bufferGeometry ref={geometryRef} />
      <pointsMaterial
        key={`${pointSize}`}
        size={pointSize}
        sizeAttenuation={false}
        vertexColors={true}
        transparent={false}
        depthWrite={true}
      />
    </points>
  )
}
