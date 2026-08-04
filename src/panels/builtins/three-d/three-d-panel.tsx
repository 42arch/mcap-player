import type { Group, Object3D } from 'three'
import type { PanelComponentProps, ThreeDPanelConfig } from '@/panels/core/types'
import { GizmoHelper, GizmoViewport } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { usePanelConfig } from '@/panels/core/panel-context'
import { usePlayerStore } from '@/stores/use-player-store'
import { AssetLoadTracker } from './asset-load-tracker'
import { AssetLoadingIndicator } from './asset-loading-indicator'
import { CameraControls } from './camera-controls'
import { useRegisteredSceneMessageAdapters } from './scene-message-adapter-registry'
import {
  discoverSceneLayers,
  getSceneLayerId,
  isPreferredSceneFocusTopic,
  resolveSceneLayerSettings,
  useRegisteredSceneRenderers,
} from './scene-renderer-registry'
import { FrameTransformCoordinator } from './tf-coordinator'
import { isTransformChannel } from './three-d-topic'

function SceneInvalidationBridge({ tfCoordinator }: { tfCoordinator: FrameTransformCoordinator }) {
  const invalidate = useThree(state => state.invalidate)

  useEffect(() => {
    tfCoordinator.setSceneInvalidator(invalidate)
    invalidate()
    return () => tfCoordinator.setSceneInvalidator(null)
  }, [invalidate, tfCoordinator])

  return null
}

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
  const [threeDSettings] = usePanelConfig<ThreeDPanelConfig>()

  const assetLoadTracker = useMemo(() => new AssetLoadTracker(), [])
  const tfCoordinator = useMemo(() => new FrameTransformCoordinator(panelId), [panelId])
  const sceneContentRef = useRef<Group>(null)
  const sceneFocusRef = useRef<Object3D>(null)
  const sceneAdapters = useRegisteredSceneMessageAdapters()
  const sceneRenderers = useRegisteredSceneRenderers()

  const bgColor = threeDSettings.backgroundColor || '#ffffff'
  const isLightBg = isLightHexColor(bgColor)

  const discoveredLayers = useMemo(
    () => discoverSceneLayers(fileSummary?.channels || [], sceneRenderers, sceneAdapters),
    [fileSummary?.channels, sceneAdapters, sceneRenderers],
  )
  const transformSubscriptionTopics = useMemo(
    () => (fileSummary?.channels || []).filter(isTransformChannel).map(channel => channel.topic),
    [fileSummary?.channels],
  )
  const fixedFrameSetting = threeDSettings.fixedFrame || 'auto'
  const displayFrame = threeDSettings.displayFrame || 'map'
  const followMode = threeDSettings.followMode || 'follow-position'
  const resolvedFixedFrame = useSyncExternalStore(
    tfCoordinator.subscribe,
    tfCoordinator.getFixedFrameSnapshot,
    tfCoordinator.getFixedFrameSnapshot,
  )

  const activeLayers = useMemo(
    () => discoveredLayers
      .filter(layer => threeDSettings.visibleTopics[layer.channel.topic] !== false)
      .map(layer => ({
        ...layer,
        layerId: getSceneLayerId(layer.channel, layer.renderer.id),
        settings: resolveSceneLayerSettings(layer.renderer, layer.channel, threeDSettings),
      })),
    [discoveredLayers, threeDSettings],
  )
  const cameraFocusKey = `${fileSummary?.name || 'empty'}|${resolvedFixedFrame}|${activeLayers.map(layer => layer.layerId).join(',')}`
  const canFrameWithoutTransforms = transformSubscriptionTopics.length === 0
  const hasPreferredFocusLayer = activeLayers.some(layer => isPreferredSceneFocusTopic(layer.channel.topic))
  const cameraFocusRef = hasPreferredFocusLayer ? sceneFocusRef : undefined

  useEffect(() => {
    return () => assetLoadTracker.dispose()
  }, [assetLoadTracker])

  useEffect(() => {
    tfCoordinator.setFixedFrame(fixedFrameSetting)
  }, [fixedFrameSetting, tfCoordinator])

  useEffect(() => {
    tfCoordinator.connect(transformSubscriptionTopics)
    return () => tfCoordinator.disconnect()
  }, [tfCoordinator, transformSubscriptionTopics])

  return (
    <div
      className="relative w-full h-full flex flex-col overflow-hidden select-none transition-colors duration-200"
      style={{ backgroundColor: bgColor }}
    >
      <div className="flex-1 w-full h-full">
        <Canvas
          frameloop="demand"
          camera={{ position: [-15, -15, 12], fov: 50, near: 0.1, far: 5000, up: [0, 0, 1] }}
          gl={{ antialias: true, alpha: false }}
          className="w-full h-full"
        >
          <SceneInvalidationBridge tfCoordinator={tfCoordinator} />
          <color attach="background" args={[bgColor]} />
          <ambientLight intensity={0.8} />
          <directionalLight position={[10, 20, 15]} intensity={1.0} />

          <CameraControls
            contentRef={sceneContentRef}
            displayFrame={displayFrame}
            focusRef={cameraFocusRef}
            focusKey={cameraFocusKey}
            followMode={followMode}
            tfCoordinator={tfCoordinator}
            waitForFrame={Boolean(resolvedFixedFrame) || canFrameWithoutTransforms}
          />
          <GizmoHelper alignment="bottom-right" margin={[64, 64]}>
            <GizmoViewport
              axisColors={isLightBg ? ['#dc2626', '#16a34a', '#2563eb'] : ['#f87171', '#4ade80', '#22d3ee']}
              labelColor={isLightBg ? '#334155' : '#e2e8f0'}
            />
          </GizmoHelper>

          {threeDSettings.showGrid && (
            <gridHelper
              args={[100, 50, isLightBg ? '#cbd5e1' : '#334155', isLightBg ? '#e2e8f0' : '#1e293b']}
              rotation={[Math.PI / 2, 0, 0]}
            />
          )}
          {threeDSettings.showAxes && <axesHelper args={[5]} />}

          <Suspense fallback={null}>
            <group ref={sceneContentRef}>
              {activeLayers.map(({ adapter, channel, layerId, renderer, settings }) => {
                const Renderer = renderer.Renderer
                return (
                  <Renderer
                    key={layerId}
                    adapter={adapter}
                    assetLoadTracker={assetLoadTracker}
                    channel={channel}
                    layerId={layerId}
                    panelId={panelId}
                    settings={settings}
                    tfCoordinator={tfCoordinator}
                    focusRef={sceneFocusRef}
                  />
                )
              })}
            </group>
          </Suspense>
        </Canvas>
      </div>

      <AssetLoadingIndicator isLightBackground={isLightBg} tracker={assetLoadTracker} />

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
          Z-up · Fixed:
          {' '}
          {resolvedFixedFrame || 'local (waiting for transforms)'}
          {' '}
          · Display:
          {' '}
          {displayFrame}
          {' '}
          · Follow:
          {' '}
          {followMode.replace('follow-', '')}
          {' '}
          ·
          {' '}
          {activeLayers.length}
          {' '}
          layers
        </span>
      </div>
    </div>
  )
}
