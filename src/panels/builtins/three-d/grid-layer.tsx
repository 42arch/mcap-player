import type { FrameTransformCoordinator } from './tf-coordinator'
import type { ParsedGrid } from '@/core/parsers/grid-parser'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { parseGrid } from '@/core/parsers/grid-parser'
import { globalMessagePipeline } from '@/panels/runtime/message-pipeline'

interface GridLayerProps {
  panelId: string
  topic: string
  tfCoordinator: FrameTransformCoordinator
}

export function GridLayer({ panelId, topic, tfCoordinator }: GridLayerProps) {
  const [grid, setGrid] = useState<ParsedGrid | null>(null)
  const frameGroupRef = useRef<THREE.Group>(null)
  const lastPayloadRef = useRef<unknown>(null)
  const rafIdRef = useRef<number | null>(null)
  const receivedSinceSeekRef = useRef(true)

  const texture = useMemo(() => {
    if (!grid) {
      return null
    }
    const next = new THREE.DataTexture(
      grid.rgba,
      grid.columns,
      grid.rows,
      THREE.RGBAFormat,
      THREE.UnsignedByteType,
    )
    next.colorSpace = THREE.SRGBColorSpace
    next.flipY = false
    next.generateMipmaps = false
    next.minFilter = THREE.LinearFilter
    next.magFilter = THREE.LinearFilter
    next.needsUpdate = true
    return next
  }, [grid])

  useEffect(() => () => texture?.dispose(), [texture])

  useEffect(() => {
    const frameGroup = frameGroupRef.current
    if (!frameGroup) {
      return
    }
    frameGroup.position.set(0, 0, 0)
    frameGroup.quaternion.identity()
    return grid
      ? tfCoordinator.registerFrameTarget(frameGroup, grid.frameId)
      : undefined
  }, [grid?.frameId, tfCoordinator])

  useEffect(() => {
    const scheduleUpdate = () => {
      if (rafIdRef.current !== null) {
        return
      }
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null
        const payload = lastPayloadRef.current
        lastPayloadRef.current = null
        if (payload) {
          setGrid(parseGrid(payload))
        }
      })
    }

    const unsubscribeTopic = globalMessagePipeline.subscribe({
      panelId,
      subscriptionId: `grid:${topic}`,
      topics: [{ topic, mode: 'latest' }],
    }, (message: { payload?: unknown }) => {
      if (!message?.payload) {
        return
      }
      receivedSinceSeekRef.current = true
      lastPayloadRef.current = message.payload
      scheduleUpdate()
    })
    const unsubscribeSeek = globalMessagePipeline.subscribeSeek(panelId, () => {
      receivedSinceSeekRef.current = false
      // Drop queued pre-seek data, but keep the rendered grid until replacement data arrives.
      lastPayloadRef.current = null
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
    })
    const unsubscribeSeekComplete = globalMessagePipeline.subscribeSeekComplete(panelId, () => {
      if (!receivedSinceSeekRef.current) {
        setGrid(null)
      }
    })

    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
      unsubscribeTopic()
      unsubscribeSeek()
      unsubscribeSeekComplete()
    }
  }, [panelId, topic])

  if (!grid || !texture) {
    return null
  }

  return (
    <group ref={frameGroupRef}>
      <group position={grid.position} quaternion={grid.orientation}>
        <mesh position={[grid.width / 2, grid.height / 2, 0]} renderOrder={grid.colorGrid ? -10 : -9}>
          <planeGeometry args={[grid.width, grid.height]} />
          <meshBasicMaterial
            map={texture}
            transparent
            depthWrite={false}
            side={THREE.DoubleSide}
            toneMapped={false}
            polygonOffset
            polygonOffsetFactor={1}
            polygonOffsetUnits={1}
          />
        </mesh>
      </group>
    </group>
  )
}
