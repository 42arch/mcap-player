import type { Remote } from 'comlink'
import type { SceneLayerProps } from './scene-renderer-registry'
import type { ParsedGrid } from '@/core/parsers/grid-parser'
import type { PlaybackMessage } from '@/panels/runtime/message-pipeline'
import { wrap } from 'comlink'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { globalMessagePipeline } from '@/panels/runtime/message-pipeline'
import { adaptSceneMessage } from './scene-message-adapter-registry'
import { getSceneLayerFrameOverride } from './scene-renderer-registry'

interface GridWorkerApi {
  parse: (payload: unknown) => Promise<ParsedGrid | null>
}

let gridWorkerApi: Remote<GridWorkerApi> | null = null

function getGridWorkerApi(): Remote<GridWorkerApi> {
  if (!gridWorkerApi) {
    const worker = new Worker(
      new URL('./grid.worker.ts', import.meta.url),
      { type: 'module' },
    )
    gridWorkerApi = wrap<GridWorkerApi>(worker)
  }
  return gridWorkerApi
}

interface GridProcessingRequest {
  messageKey: string
  promise: Promise<ParsedGrid | null>
}

function getGridMessageKey(message: PlaybackMessage, adapterId: string): string {
  return `${adapterId}:${message.channelId}:${message.logTime}:${message.sequence}:${message.dataLength}`
}

export function GridLayer({ adapter, panelId, channel, settings, tfCoordinator }: SceneLayerProps) {
  const topic = channel.topic
  const retainAcrossSeeks = channel.messageCount === 1
  const [grid, setGrid] = useState<ParsedGrid | null>(null)
  const frameGroupRef = useRef<THREE.Group>(null)
  const pendingMessageRef = useRef<{
    adapterFrameId: string | null
    generation: number
    message: PlaybackMessage
    messageKey: string
  } | null>(null)
  const parseGenerationRef = useRef(0)
  const processingRequestRef = useRef<GridProcessingRequest | null>(null)
  const rafIdRef = useRef<number | null>(null)
  const receivedSinceSeekRef = useRef(true)
  const renderedCacheKeyRef = useRef<string | null>(null)
  const renderedLogTimeRef = useRef<bigint | null>(null)
  const gridFrameId = grid?.frameId
  const frameOverride = getSceneLayerFrameOverride(settings)
  const effectiveFrameId = frameOverride || gridFrameId

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
    return effectiveFrameId
      ? tfCoordinator.registerFrameTarget(frameGroup, effectiveFrameId)
      : undefined
  }, [effectiveFrameId, tfCoordinator])

  useEffect(() => {
    const parseGeneration = parseGenerationRef
    const scheduleUpdate = () => {
      if (rafIdRef.current !== null) {
        return
      }
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null
        const pending = pendingMessageRef.current
        pendingMessageRef.current = null
        if (!pending) {
          return
        }

        let processingRequest = processingRequestRef.current
        if (!processingRequest || processingRequest.messageKey !== pending.messageKey) {
          processingRequest = {
            messageKey: pending.messageKey,
            promise: getGridWorkerApi().parse(pending.message.payload).then(nextGrid => (
              nextGrid && pending.adapterFrameId
                ? { ...nextGrid, frameId: pending.adapterFrameId }
                : nextGrid
            )),
          }
          processingRequestRef.current = processingRequest
          const startedRequest = processingRequest
          void startedRequest.promise.then(() => {
            if (processingRequestRef.current === startedRequest) {
              processingRequestRef.current = null
            }
          }, () => {
            if (processingRequestRef.current === startedRequest) {
              processingRequestRef.current = null
            }
          })
        }

        processingRequest.promise
          .then((nextGrid) => {
            if (pending.generation !== parseGeneration.current) {
              return
            }
            renderedCacheKeyRef.current = nextGrid ? pending.messageKey : null
            renderedLogTimeRef.current = nextGrid ? pending.message.logTime : null
            setGrid(nextGrid)
          })
          .catch((error: unknown) => {
            if (pending.generation === parseGeneration.current) {
              console.warn(`Failed to process Grid topic "${topic}":`, error)
            }
          })
      })
    }

    const unsubscribeTopic = globalMessagePipeline.subscribe({
      panelId,
      subscriptionId: `grid:${topic}`,
      topics: [{
        topic,
        mode: 'latest',
        retainOnSeek: timeNs => retainAcrossSeeks
          && renderedLogTimeRef.current !== null
          && renderedLogTimeRef.current <= timeNs,
      }],
    }, (message) => {
      if (!message?.payload) {
        return
      }
      let adapted
      try {
        adapted = adaptSceneMessage(adapter, message.payload, channel)
      }
      catch (error) {
        console.warn(`Failed to adapt Grid topic "${topic}":`, error)
        return
      }
      receivedSinceSeekRef.current = true
      const messageKey = getGridMessageKey(message, adapter?.id || 'raw')
      if (messageKey === renderedCacheKeyRef.current) {
        // Static maps are commonly returned by every seek backfill. Keeping the
        // existing Grid object also keeps its GPU texture alive.
        return
      }
      const generation = ++parseGeneration.current
      pendingMessageRef.current = {
        adapterFrameId: adapted.frameId || null,
        generation,
        message: { ...message, payload: adapted.payload },
        messageKey,
      }
      scheduleUpdate()
    })
    const unsubscribeSeek = globalMessagePipeline.subscribeSeek(panelId, (timeNs) => {
      receivedSinceSeekRef.current = retainAcrossSeeks
        && renderedLogTimeRef.current !== null
        && renderedLogTimeRef.current <= timeNs
      // Drop queued pre-seek data, but keep the rendered grid until replacement data arrives.
      pendingMessageRef.current = null
      parseGeneration.current++
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
    })
    const unsubscribeSeekComplete = globalMessagePipeline.subscribeSeekComplete(panelId, () => {
      if (!receivedSinceSeekRef.current) {
        renderedCacheKeyRef.current = null
        renderedLogTimeRef.current = null
        setGrid(null)
      }
    })

    return () => {
      parseGeneration.current++
      pendingMessageRef.current = null
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
      unsubscribeTopic()
      unsubscribeSeek()
      unsubscribeSeekComplete()
    }
  }, [adapter, channel, panelId, retainAcrossSeeks, topic])

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
