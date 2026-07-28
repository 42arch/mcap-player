import type { PanelComponentProps, ThreeDPanelConfig } from '@/panels/core/types'
import { Canvas } from '@react-three/fiber'
import { Box, ChevronDown, Eye, EyeOff, Layers, Maximize2, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { usePanelConfig } from '@/panels/core/panel-context'
import { usePlayerStore } from '@/stores/use-player-store'
import { CameraControls } from './camera-controls'
import { GridLayer } from './grid-layer'
import { PointCloudLayer } from './point-cloud-layer'
import { RobotLayer } from './robot-layer'
import { inferSceneProfile } from './scene-profile'
import { SceneUpdateLayer } from './scene-update-layer'
import { FrameTransformCoordinator } from './tf-coordinator'
import { getThreeDTopicKind, isThreeDChannel } from './three-d-topic'

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

export default function ThreeDPanel({ panelId }: PanelComponentProps<ThreeDPanelConfig>) {
  const fileSummary = usePlayerStore(state => state.fileSummary)
  const [threeDSettings, updateThreeDSettings] = usePanelConfig<ThreeDPanelConfig>()

  const [topicCounts, setTopicCounts] = useState<Record<string, number>>({})
  const [resetTrigger, setResetTrigger] = useState<number>(0)
  const [topViewTrigger, setTopViewTrigger] = useState<number>(0)
  const tfCoordinator = useMemo(() => new FrameTransformCoordinator(panelId), [panelId])

  const bgColor = threeDSettings.backgroundColor || '#ffffff'
  const isLightBg = isLightHexColor(bgColor)

  const spatialChannels = useMemo(() => {
    return (fileSummary?.channels || []).filter(isThreeDChannel)
  }, [fileSummary])

  const spatialTopics = useMemo(() => spatialChannels.map(ch => ch.topic), [spatialChannels])
  const sceneProfile = useMemo(() => inferSceneProfile(fileSummary?.channels || []), [fileSummary?.channels])
  const transformTopics = sceneProfile.transformTopics
  const transformSubscriptionTopics = useMemo(
    () => transformTopics.length > 0 ? transformTopics : ['/tf'],
    [transformTopics],
  )

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
    tfCoordinator.setRootFrame(sceneProfile.rootFrame)
    tfCoordinator.connect(transformSubscriptionTopics)
    return () => tfCoordinator.disconnect()
  }, [sceneProfile.rootFrame, tfCoordinator, transformSubscriptionTopics])

  const handlePointCountUpdate = useCallback((topic: string, count: number) => {
    setTopicCounts(prev => ({ ...prev, [topic]: count }))
  }, [])

  const totalPoints = activeTopics.reduce((acc, t) => acc + (topicCounts[t] || 0), 0)

  const handleSelectAll = (visible: boolean) => {
    updateThreeDSettings({
      visibleTopics: Object.fromEntries(spatialTopics.map(topic => [topic, visible])),
    })
  }

  const toggleTopicVisibility = (topic: string) => {
    const visible = threeDSettings.visibleTopics[topic] === false
    updateThreeDSettings({
      visibleTopics: { ...threeDSettings.visibleTopics, [topic]: visible },
    })
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
            {sceneProfile.label}
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
                        {activeTopics.length > 0 ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 opacity-40" />}
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
                            toggleTopicVisibility(topic)
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
            <Maximize2 className={`w-3.5 h-3.5 ${isLightBg ? 'text-blue-600' : 'text-cyan-400'}`} />
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
            <RefreshCw className="w-3.5 h-3.5 text-emerald-500" />
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
            const kind = getThreeDTopicKind(topicSchemaMap.get(topic), topic)
            if (kind === 'scene-update') {
              return <SceneUpdateLayer key={topic} panelId={panelId} topic={topic} tfCoordinator={tfCoordinator} />
            }
            if (kind === 'grid') {
              return <GridLayer key={topic} panelId={panelId} topic={topic} tfCoordinator={tfCoordinator} />
            }
            if (kind === 'point-cloud') {
              return (
                <PointCloudLayer
                  key={topic}
                  panelId={panelId}
                  topic={topic}
                  onPointCountUpdate={handlePointCountUpdate}
                  tfCoordinator={tfCoordinator}
                />
              )
            }
            if (kind === 'robot-model') {
              return <RobotLayer key={topic} panelId={panelId} topic={topic} tfCoordinator={tfCoordinator} />
            }
            return null
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
