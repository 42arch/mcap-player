import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Box, ChevronDown, Eye, EyeOff, Layers, Maximize2, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls as OrbitControlsImpl } from 'three/examples/jsm/controls/OrbitControls.js'
import { SceneUpdateLayer } from '@/components/panels/scene-update-layer'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { globalMessageBus } from '@/core/message-bus'
import { globalPlaybackController } from '@/core/playback-controller'
import { parsePointCloud } from '@/lib/point-cloud-parser'
import { usePlayerStore } from '@/stores/use-player-store'

// Helper to determine if a hex color is light or dark
function isLightHexColor(hex: string): boolean {
  let cleanHex = hex.replace('#', '')
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split('').map(c => c + c).join('')
  }
  const num = Number.parseInt(cleanHex, 16)
  if (Number.isNaN(num)) {
    return true
  }
  const r = (num >> 16) & 255
  const g = (num >> 8) & 255
  const b = num & 255
  // Perceived brightness formula
  const brightness = (r * 299 + g * 587 + b * 114) / 1000
  return brightness > 140
}

function CameraControls({
  resetTrigger,
  topViewTrigger,
}: {
  resetTrigger: number
  topViewTrigger: number
}) {
  const { camera, gl } = useThree()
  const controlsRef = useRef<OrbitControlsImpl | null>(null)

  useEffect(() => {
    const controls = new OrbitControlsImpl(camera, gl.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.target.set(0, 0, 0)
    controlsRef.current = controls

    return () => {
      controls.dispose()
    }
  }, [camera, gl])

  useEffect(() => {
    if (resetTrigger > 0 && controlsRef.current) {
      camera.position.set(-15, -15, 12)
      controlsRef.current.target.set(0, 0, 0)
      camera.lookAt(0, 0, 0)
      controlsRef.current.update()
    }
  }, [resetTrigger, camera])

  useEffect(() => {
    if (topViewTrigger > 0 && controlsRef.current) {
      camera.position.set(0, 0, 35)
      controlsRef.current.target.set(0, 0, 0)
      camera.lookAt(0, 0, 0)
      controlsRef.current.update()
    }
  }, [topViewTrigger, camera])

  useFrame(() => {
    controlsRef.current?.update()
  })

  return null
}

function PointCloudLayer({
  topic,
  onPointCountUpdate,
}: {
  topic: string
  onPointCountUpdate: (topic: string, count: number) => void
}) {
  const pointsRef = useRef<THREE.Points>(null)
  const geometryRef = useRef<THREE.BufferGeometry>(null)
  const lastPayloadRef = useRef<any>(null)

  const [lidarPos, setLidarPos] = useState<[number, number, number]>([0.9437, 0, 1.8402])
  const [lidarRot, setLidarRot] = useState<[number, number, number, number]>([
    -0.0065,
    0.0106,
    -0.7063,
    0.7078,
  ])

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

    // Parse directly into GPU-backing buffers (zero-copy)
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

    // Throttled point count notification via stable ref
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

    // Subscribe to TF transforms for LIDAR sensor orientation alignment
    const unsubTf = globalMessageBus.subscribe('/tf', (msg: any) => {
      if (!msg || !msg.payload) {
        return
      }
      const p = msg.payload
      if (
        p.parent_frame_id === 'base_link'
        && (p.child_frame_id === 'LIDAR_TOP' || topic.toLowerCase().includes(p.child_frame_id.toLowerCase()))
      ) {
        setLidarPos([p.translation?.x ?? 0, p.translation?.y ?? 0, p.translation?.z ?? 0])
        setLidarRot([
          p.rotation?.x ?? 0,
          p.rotation?.y ?? 0,
          p.rotation?.z ?? -0.7071,
          p.rotation?.w ?? 0.7071,
        ])
      }
    })

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
      unsubTf()
      unsub()
      unsubSeek()
      onPointCountUpdateRef.current(topic, 0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic])

  return (
    <points ref={pointsRef} position={lidarPos} quaternion={lidarRot}>
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

export default function ThreeDPanel() {
  const fileSummary = usePlayerStore(state => state.fileSummary)
  const threeDSettings = usePlayerStore(state => state.threeDSettings)
  const setAllTopicsVisibility = usePlayerStore(state => state.setAllTopicsVisibility)

  const [topicCounts, setTopicCounts] = useState<Record<string, number>>({})
  const [resetTrigger, setResetTrigger] = useState<number>(0)
  const [topViewTrigger, setTopViewTrigger] = useState<number>(0)

  const bgColor = threeDSettings.backgroundColor || '#ffffff'
  const isLightBg = isLightHexColor(bgColor)

  const spatialChannels = useMemo(() => {
    return (fileSummary?.channels || []).filter((ch) => {
      const name = (ch.schemaName || '').toLowerCase()
      const t = ch.topic.toLowerCase()
      return (
        name.includes('pointcloud')
        || name.includes('point_cloud')
        || name.includes('foxglove.pointcloud')
        || name.includes('sceneupdate')
        || name.includes('foxglove.sceneupdate')
        || t.includes('pointcloud')
        || t.includes('points')
        || t.includes('lidar')
        || t.includes('marker')
        || t.includes('annotation')
      )
    })
  }, [fileSummary])

  const spatialTopics = useMemo(() => spatialChannels.map(ch => ch.topic), [spatialChannels])

  const activeTopics = useMemo(
    () => spatialTopics.filter(t => threeDSettings.visibleTopics[t] !== false),
    [spatialTopics, threeDSettings.visibleTopics],
  )

  const topicSchemaMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const ch of spatialChannels) {
      map.set(ch.topic, ch.schemaName || '')
    }
    return map
  }, [spatialChannels])

  useEffect(() => {
    const currentSubscribed = usePlayerStore.getState().subscribedTopics
    let hasNewSubscription = false
    const nextSubscribed = new Set(currentSubscribed)

    for (const t of activeTopics) {
      if (!nextSubscribed.has(t)) {
        nextSubscribed.add(t)
        hasNewSubscription = true
      }
    }

    if (spatialTopics.some(t => topicSchemaMap.get(t)?.toLowerCase().includes('sceneupdate') || t.includes('marker') || t.includes('annotation'))) {
      if (!nextSubscribed.has('/tf')) {
        nextSubscribed.add('/tf')
        hasNewSubscription = true
      }
    }

    if (hasNewSubscription) {
      usePlayerStore.getState().setSubscribedTopics(nextSubscribed)
      globalPlaybackController.triggerBackfill()
    }

    return () => {
      // When 3D panel unmounts (switching to another panel), clean up 3D topics
      const current = usePlayerStore.getState().subscribedTopics
      const cleaned = new Set(current)
      for (const t of spatialTopics) {
        cleaned.delete(t)
      }
      cleaned.delete('/tf')
      if (cleaned.size !== current.size) {
        usePlayerStore.getState().setSubscribedTopics(cleaned)
      }
    }
  }, [activeTopics, spatialTopics, topicSchemaMap])

  const handlePointCountUpdate = useCallback((topic: string, count: number) => {
    setTopicCounts(prev => ({ ...prev, [topic]: count }))
  }, [])

  const totalPoints = activeTopics.reduce((acc, t) => acc + (topicCounts[t] || 0), 0)

  const handleSelectAll = (visible: boolean) => {
    setAllTopicsVisibility(spatialTopics, visible)
    if (visible) {
      const current = usePlayerStore.getState().subscribedTopics
      const next = new Set(current)
      for (const t of spatialTopics) {
        next.add(t)
      }
      next.add('/tf')
      usePlayerStore.getState().setSubscribedTopics(next)
      globalPlaybackController.triggerBackfill()
    }
  }

  return (
    <div
      className="relative w-full h-full flex flex-col overflow-hidden select-none transition-colors duration-200"
      style={{ backgroundColor: bgColor }}
    >
      <div className="absolute top-3 left-3 right-3 z-10 flex items-center justify-between pointer-events-none">
        <div className={`flex items-center gap-2 pointer-events-auto px-3 py-1.5 rounded-lg border shadow-md text-[11px] backdrop-blur-md transition-all ${
          isLightBg
            ? 'bg-white/90 text-slate-800 border-slate-200/80 shadow-slate-200/50'
            : 'bg-slate-900/80 text-slate-200 border-slate-800 shadow-slate-950/50'
        }`}
        >
          <span className="flex items-center gap-1.5 font-bold">
            <Box className={`w-3.5 h-3.5 ${isLightBg ? 'text-blue-600' : 'text-cyan-400'}`} />
            3D Spatial View
          </span>

          {spatialTopics.length > 0
            ? (
                <DropdownMenu>
                  <DropdownMenuTrigger className={`flex items-center gap-1.5 font-mono text-[10px] px-2 py-1 rounded border cursor-pointer outline-hidden transition-all ${
                    isLightBg
                      ? 'bg-slate-100/80 hover:bg-slate-100 text-blue-700 border-slate-300 hover:border-blue-500'
                      : 'bg-slate-950/90 hover:bg-slate-950 text-cyan-300 border-slate-700 hover:border-cyan-500'
                  }`}
                  >
                    <Layers className={`w-3 h-3 ${isLightBg ? 'text-blue-600' : 'text-cyan-400'}`} />
                    <span>
                      3D Layers (
                      {activeTopics.length}
                      /
                      {spatialTopics.length}
                      )
                    </span>
                    <ChevronDown className="w-3 h-3 opacity-60" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    className={`p-1.5 text-[10px] w-64 shadow-xl z-50 border ${
                      isLightBg
                        ? 'bg-white text-slate-800 border-slate-200'
                        : 'bg-slate-900 text-slate-200 border-slate-800'
                    }`}
                  >
                    <div className={`flex items-center justify-between px-2 py-1 border-b mb-1 ${
                      isLightBg ? 'border-slate-200' : 'border-slate-800'
                    }`}
                    >
                      <span className={`font-bold text-[9px] uppercase tracking-wider ${
                        isLightBg ? 'text-slate-500' : 'text-slate-400'
                      }`}
                      >
                        Spatial Layers
                      </span>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => handleSelectAll(activeTopics.length === 0)}
                        className={activeTopics.length > 0 ? (isLightBg ? 'text-blue-600 hover:bg-blue-50' : 'text-cyan-400 hover:bg-slate-800') : (isLightBg ? 'text-slate-400' : 'text-slate-500')}
                        title={activeTopics.length > 0 ? 'Hide All' : 'Show All'}
                      >
                        {activeTopics.length > 0 ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5 opacity-40" />}
                      </Button>
                    </div>

                    {spatialTopics.map((topic) => {
                      const isVisible = threeDSettings.visibleTopics[topic] !== false
                      const count = topicCounts[topic] || 0
                      return (
                        <DropdownMenuItem
                          key={topic}
                          onClick={(e) => {
                            e.preventDefault()
                            usePlayerStore.getState().toggleTopicVisibility(topic)
                          }}
                          className={`flex items-center justify-between px-2 py-1.5 cursor-pointer text-[10px] ${
                            isLightBg
                              ? 'hover:bg-slate-100 focus:bg-slate-100 text-slate-800'
                              : 'hover:bg-slate-800 focus:bg-slate-800 text-slate-200'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate max-w-42.5" title={topic}>
                            <span className={isVisible ? 'text-primary' : 'text-muted-foreground/40'}>
                              {isVisible ? <Eye className="w-3.5 h-3.5 text-blue-600" /> : <EyeOff className="w-3.5 h-3.5 opacity-40" />}
                            </span>
                            <span className={isVisible ? 'font-medium' : 'opacity-40 line-through'}>
                              {topic}
                            </span>
                          </div>
                          {isVisible && count > 0 && (
                            <span className={`text-[9px] font-semibold ${
                              isLightBg ? 'text-blue-600' : 'text-cyan-400'
                            }`}
                            >
                              {(count / 1000).toFixed(0)}
                              k
                            </span>
                          )}
                        </DropdownMenuItem>
                      )
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              )
            : (
                <span className="text-[10px] text-amber-500 font-medium px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                  No 3D Topic Found
                </span>
              )}

          {totalPoints > 0 && (
            <span className={`text-[10px] font-mono pl-1 border-l ${
              isLightBg ? 'text-slate-500 border-slate-200' : 'text-slate-400 border-slate-800'
            }`}
            >
              {totalPoints.toLocaleString()}
              {' '}
              pts
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 pointer-events-auto">
          <Button
            variant="outline"
            size="xs"
            onClick={() => setTopViewTrigger(prev => prev + 1)}
            title="BEV Top View"
            className={
              isLightBg
                ? 'bg-white/90 hover:bg-white text-slate-700 border-slate-200 shadow-xs backdrop-blur-md'
                : 'bg-slate-900/80 hover:bg-slate-800 text-slate-300 border-slate-800 shadow-xs backdrop-blur-md'
            }
          >
            <Maximize2 className={`size-3 ${isLightBg ? 'text-blue-600' : 'text-cyan-400'}`} />
            BEV View
          </Button>
          <Button
            variant="outline"
            size="xs"
            onClick={() => setResetTrigger(prev => prev + 1)}
            title="Reset Perspective"
            className={
              isLightBg
                ? 'bg-white/90 hover:bg-white text-slate-700 border-slate-200 shadow-xs backdrop-blur-md'
                : 'bg-slate-900/80 hover:bg-slate-800 text-slate-300 border-slate-800 shadow-xs backdrop-blur-md'
            }
          >
            <RefreshCw className="size-3 text-emerald-500" />
            Reset Camera
          </Button>
        </div>
      </div>

      <div className="flex-1 w-full h-full">
        <Canvas
          camera={{ position: [-15, -15, 12], fov: 50, up: [0, 0, 1] }}
          gl={{ antialias: true, alpha: false }}
          className="w-full h-full"
        >
          <color attach="background" args={[bgColor]} />
          <ambientLight intensity={0.8} />
          <directionalLight position={[10, 20, 15]} intensity={1.0} />

          <CameraControls resetTrigger={resetTrigger} topViewTrigger={topViewTrigger} />

          {threeDSettings.showGrid && (
            <gridHelper
              args={[100, 50, isLightBg ? '#cbd5e1' : '#334155', isLightBg ? '#e2e8f0' : '#1e293b']}
              rotation={[Math.PI / 2, 0, 0]}
            />
          )}
          {threeDSettings.showAxes && <axesHelper args={[5]} />}

          {activeTopics.map((topic) => {
            const schema = (topicSchemaMap.get(topic) || '').toLowerCase()
            const isSceneUpdate = schema.includes('sceneupdate') || topic.includes('marker') || topic.includes('annotation')
            if (isSceneUpdate) {
              return <SceneUpdateLayer key={topic} topic={topic} />
            }
            return (
              <PointCloudLayer
                key={topic}
                topic={topic}
                onPointCountUpdate={handlePointCountUpdate}
              />
            )
          })}
        </Canvas>
      </div>

      <div className={`absolute bottom-2 left-3 z-10 pointer-events-none flex items-center gap-3 text-[10px] font-mono px-2.5 py-1 rounded border backdrop-blur-xs shadow-xs ${
        isLightBg
          ? 'bg-white/80 text-slate-600 border-slate-200'
          : 'bg-slate-950/70 text-slate-400/80 border-slate-800/60'
      }`}
      >
        <span className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${
            isLightBg ? 'bg-blue-600' : 'bg-cyan-400'
          }`}
          />
          ROS Coordinates: Red=X(Fwd), Green=Y(Left), Blue=Z(Up)
        </span>
      </div>
    </div>
  )
}
