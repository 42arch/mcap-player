import type { SceneLayerProps } from './scene-renderer-registry'
import type { PreparedPointCloud } from '@/core/parsers/point-cloud-parser'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { preparePointCloud, renderPreparedPointCloud } from '@/core/parsers/point-cloud-parser'
import { globalMessagePipeline } from '@/panels/runtime/message-pipeline'
import { readPointCloudSettings } from './point-cloud-config'
import { adaptSceneMessage } from './scene-message-adapter-registry'
import { getSceneLayerFrameOverride } from './scene-renderer-registry'

export function PointCloudLayer({ adapter, panelId, channel, settings, tfCoordinator }: SceneLayerProps) {
  const topic = channel.topic
  const pointsRef = useRef<THREE.Points>(null)
  const geometryRef = useRef<THREE.BufferGeometry>(null)
  const lastPointCloudRef = useRef<PreparedPointCloud | null>(null)
  const unregisterFrameRef = useRef<(() => void) | null>(null)
  const receivedSinceSeekRef = useRef(true)

  const { colorMode, maxPoints, pointSize, solidColor } = readPointCloudSettings(settings)
  const frameOverride = getSceneLayerFrameOverride(settings)

  // Stable refs: avoid re-subscribing when settings or callbacks change
  const settingsRef = useRef({ colorMode, solidColor, maxPoints })
  settingsRef.current = { colorMode, solidColor, maxPoints }

  const posBufferRef = useRef<Float32Array>(new Float32Array(maxPoints * 3))
  const colBufferRef = useRef<Float32Array>(new Float32Array(maxPoints * 3))
  const boundsCenterRef = useRef(new THREE.Vector3())

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

  const renderPointCloud = (pointCloud: PreparedPointCloud) => {
    if (!geometryRef.current) {
      return
    }

    const geometry = geometryRef.current
    const posAttr = geometry.attributes.position as THREE.BufferAttribute
    const colAttr = geometry.attributes.color as THREE.BufferAttribute
    if (!posAttr || !colAttr) {
      return
    }

    const { colorMode: cm, solidColor: sc, maxPoints: mp } = settingsRef.current
    const parsed = renderPreparedPointCloud(pointCloud, {
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

    const min = new THREE.Vector3(parsed.minX, parsed.minY, parsed.minZ)
    const max = new THREE.Vector3(parsed.maxX, parsed.maxY, parsed.maxZ)
    const center = boundsCenterRef.current.copy(min).add(max).multiplyScalar(0.5)
    geometry.boundingSphere = new THREE.Sphere(center, center.distanceTo(max))
  }

  useEffect(() => {
    if (lastPointCloudRef.current) {
      renderPointCloud(lastPointCloudRef.current)
    }
  }, [colorMode, solidColor, maxPoints])

  useEffect(() => {
    if (!topic) {
      return
    }

    const points = pointsRef.current
    if (!points) {
      return
    }
    const inferredFrameId = topic.split('/').filter(Boolean).at(-1) || ''
    unregisterFrameRef.current = tfCoordinator.registerFrameTarget(points, frameOverride || inferredFrameId)
    const canPrepareInWorker = adapter === null || adapter.id === 'foxglove-ros-point-cloud'

    const unsub = globalMessagePipeline.subscribe({
      panelId,
      subscriptionId: `point-cloud:${topic}`,
      topics: [{
        topic,
        mode: 'latest',
        processor: canPrepareInWorker
          ? { type: 'point-cloud', maxPoints }
          : undefined,
      }],
    }, (msg: any) => {
      if (!msg || !msg.payload) {
        return
      }

      try {
        const adapted = adaptSceneMessage(adapter, msg.payload, channel)
        const pointCloud = preparePointCloud(adapted.payload, maxPoints)
        if (!pointCloud) {
          return
        }
        receivedSinceSeekRef.current = true
        lastPointCloudRef.current = pointCloud
        const frameId = frameOverride || adapted.frameId || pointCloud.frameId
        if (frameId) {
          tfCoordinator.setFrameTarget(points, frameId)
        }
        renderPointCloud(pointCloud)
      }
      catch (error) {
        console.warn(`Failed to adapt Point Cloud topic "${topic}":`, error)
      }
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
      lastPointCloudRef.current = null
    })
    return () => {
      unregisterFrameRef.current?.()
      unregisterFrameRef.current = null
      unsub()
      unsubSeek()
      unsubSeekComplete()
    }
  }, [adapter, channel, frameOverride, maxPoints, panelId, topic, tfCoordinator])

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
