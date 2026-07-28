import type { FrameTransformCoordinator } from './tf-coordinator'
import type { ThreeDPanelConfig } from '@/panels/core/types'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { parsePointCloud } from '@/core/parsers/point-cloud-parser'
import { usePanelConfigForId } from '@/panels/core/panel-context'
import { globalMessagePipeline } from '@/panels/runtime/message-pipeline'

interface PointCloudLayerProps {
  panelId: string
  topic: string
  onPointCountUpdate: (topic: string, count: number) => void
  tfCoordinator: FrameTransformCoordinator
}

export function PointCloudLayer({ panelId, topic, onPointCountUpdate, tfCoordinator }: PointCloudLayerProps) {
  const pointsRef = useRef<THREE.Points>(null)
  const geometryRef = useRef<THREE.BufferGeometry>(null)
  const lastPayloadRef = useRef<any>(null)
  const unregisterFrameRef = useRef<(() => void) | null>(null)
  const receivedSinceSeekRef = useRef(true)

  const [threeDSettings] = usePanelConfigForId<ThreeDPanelConfig>(panelId)
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
    const inferredFrameId = topic.split('/').filter(Boolean).at(-1) || ''
    unregisterFrameRef.current = tfCoordinator.registerFrameTarget(points, inferredFrameId)

    const unsub = globalMessagePipeline.subscribe({
      panelId,
      subscriptionId: `point-cloud:${topic}`,
      topics: [{ topic, mode: 'latest' }],
    }, (msg: any) => {
      if (!msg || !msg.payload) {
        return
      }

      receivedSinceSeekRef.current = true
      lastPayloadRef.current = msg.payload
      const frameId = msg.payload.frame_id || msg.payload.header?.frame_id
      if (typeof frameId === 'string' && frameId) {
        tfCoordinator.setFrameTarget(points, frameId)
      }
      renderPayload(msg.payload)
    })

    // The current point cloud intentionally remains visible until backfill replaces it.
    const unsubSeek = globalMessagePipeline.subscribeSeek(panelId, () => {
      receivedSinceSeekRef.current = false
    })
    const unsubSeekComplete = globalMessagePipeline.subscribeSeekComplete(panelId, () => {
      if (receivedSinceSeekRef.current) {
        return
      }
      geometryRef.current?.setDrawRange(0, 0)
      lastPayloadRef.current = null
      onPointCountUpdateRef.current(topic, 0)
    })
    return () => {
      unregisterFrameRef.current?.()
      unregisterFrameRef.current = null
      unsub()
      unsubSeek()
      unsubSeekComplete()
      onPointCountUpdateRef.current(topic, 0)
    }
  }, [panelId, topic, tfCoordinator])

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
