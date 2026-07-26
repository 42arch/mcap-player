import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { globalMessageBus } from '@/core/message-bus'
import type { ParsedGrid } from '@/lib/grid-parser'
import { parseGrid } from '@/lib/grid-parser'
import { isMapFrame } from '@/lib/scene-update-parser'
import type { FrameTransformCoordinator } from './tf-coordinator'

interface GridLayerProps {
  topic: string
  tfCoordinator: FrameTransformCoordinator
}

export function GridLayer({ topic, tfCoordinator }: GridLayerProps) {
  const [grid, setGrid] = useState<ParsedGrid | null>(null)
  const frameGroupRef = useRef<THREE.Group>(null)
  const lastPayloadRef = useRef<unknown>(null)
  const rafIdRef = useRef<number | null>(null)

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
    return grid && isMapFrame(grid.frameId)
      ? tfCoordinator.registerMapTarget(frameGroup)
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

    const unsubscribeTopic = globalMessageBus.subscribe(topic, (message: { payload?: unknown }) => {
      if (!message?.payload) {
        return
      }
      lastPayloadRef.current = message.payload
      scheduleUpdate()
    })
    const unsubscribeSeek = globalMessageBus.subscribe('__seek__', () => {
      lastPayloadRef.current = null
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
      setGrid(null)
    })

    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
      unsubscribeTopic()
      unsubscribeSeek()
    }
  }, [topic])

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
