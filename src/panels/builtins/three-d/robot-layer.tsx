import type * as THREE from 'three'
import type { AssetLoadTracker } from './asset-load-tracker'
import type { SceneLayerProps } from './scene-renderer-registry'
import type { FrameTransformCoordinator } from './tf-coordinator'
import type { UrdfGeometry, UrdfLink, UrdfRobot, UrdfVisual } from '@/core/parsers/urdf-parser'
import { useEffect, useRef, useState } from 'react'
import { getUrdfMeshFormat, loadUrdfMeshGeometry } from '@/core/loaders/urdf-mesh-loader'
import { parseUrdfRobot } from '@/core/parsers/urdf-parser'
import { globalPlaybackController } from '@/core/playback-controller'
import { globalMessagePipeline } from '@/panels/runtime/message-pipeline'
import { getAssetLabel } from './asset-load-tracker'
import { adaptSceneMessage } from './scene-message-adapter-registry'

const warnedMeshUrls = new Set<string>()
const stlToRosRotation: [number, number, number] = [Math.PI / 2, 0, 0]

function RobotGeometry({ geometry }: { geometry: UrdfGeometry }) {
  if (geometry.type === 'box') {
    return <boxGeometry args={geometry.size} />
  }
  if (geometry.type === 'cylinder') {
    return <cylinderGeometry args={[geometry.radius, geometry.radius, geometry.length, 12]} />
  }
  if (geometry.type === 'sphere') {
    return <sphereGeometry args={[geometry.radius, 12, 8]} />
  }
  return <boxGeometry args={[0.08, 0.08, 0.08]} />
}

function RobotMeshVisual({
  assetLoadTracker,
  geometry,
  visual,
}: {
  assetLoadTracker: AssetLoadTracker
  geometry: Extract<UrdfGeometry, { type: 'mesh' }>
  visual: UrdfVisual
}) {
  const [loadedGeometry, setLoadedGeometry] = useState<{
    filename: string
    value: THREE.BufferGeometry
  } | null>(null)

  useEffect(() => {
    let isCurrent = true
    const filename = geometry.filename

    if (!getUrdfMeshFormat(filename)) {
      return
    }

    const assetLoad = assetLoadTracker.begin(filename, getAssetLabel(filename, 'Robot mesh'))
    loadUrdfMeshGeometry(filename)
      .then((value) => {
        assetLoad.finish()
        if (isCurrent) {
          setLoadedGeometry({ filename, value })
        }
      })
      .catch((error: unknown) => {
        assetLoad.finish()
        if (!warnedMeshUrls.has(filename)) {
          warnedMeshUrls.add(filename)
          console.warn(`Failed to load URDF mesh "${filename}":`, error)
        }
      })

    return () => {
      isCurrent = false
      assetLoad.cancel()
    }
  }, [assetLoadTracker, geometry.filename])

  const meshGeometry = loadedGeometry?.filename === geometry.filename
    ? loadedGeometry.value
    : null

  return (
    <group position={visual.position} quaternion={visual.orientation}>
      {/* STL assets are loaded in Three's Y-up convention; the scene and TF tree use ROS Z-up. */}
      <mesh rotation={stlToRosRotation} scale={geometry.scale}>
        {meshGeometry
          ? <primitive object={meshGeometry} attach="geometry" />
          : <boxGeometry args={[0.08, 0.08, 0.08]} />}
        <meshStandardMaterial color={visual.color} roughness={0.65} metalness={0.05} />
      </mesh>
    </group>
  )
}

function RobotVisual({ assetLoadTracker, visual }: { assetLoadTracker: AssetLoadTracker, visual: UrdfVisual }) {
  if (visual.geometry.type === 'mesh') {
    return <RobotMeshVisual assetLoadTracker={assetLoadTracker} geometry={visual.geometry} visual={visual} />
  }

  return (
    <mesh position={visual.position} quaternion={visual.orientation}>
      <RobotGeometry geometry={visual.geometry} />
      <meshStandardMaterial color={visual.color} roughness={0.65} metalness={0.05} />
    </mesh>
  )
}

function RobotLinkView({
  assetLoadTracker,
  link,
  tfCoordinator,
}: {
  assetLoadTracker: AssetLoadTracker
  link: UrdfLink
  tfCoordinator: FrameTransformCoordinator
}) {
  const groupRef = useRef<THREE.Group>(null)

  useEffect(() => {
    const group = groupRef.current
    return group ? tfCoordinator.registerFrameTarget(group, link.name, true) : undefined
  }, [link.name, tfCoordinator])

  if (link.visuals.length === 0) {
    return null
  }
  return (
    <group ref={groupRef} position={link.position} quaternion={link.orientation}>
      {link.visuals.map(visual => <RobotVisual key={visual.id} assetLoadTracker={assetLoadTracker} visual={visual} />)}
    </group>
  )
}

/** Renders an in-bag robot_description and drives each link from the TF tree. */
export function RobotLayer({
  adapter,
  assetLoadTracker,
  channel,
  panelId,
  tfCoordinator,
}: SceneLayerProps) {
  const topic = channel.topic
  const [robot, setRobot] = useState<UrdfRobot | null>(null)
  const receivedSinceSeekRef = useRef(true)
  const lastDescriptionRef = useRef<unknown>(undefined)
  const hasRobotRef = useRef(false)

  useEffect(() => {
    let isCurrent = true
    let receivedFromPipeline = false

    const applyDescription = (description: unknown) => {
      if (hasRobotRef.current && Object.is(lastDescriptionRef.current, description)) {
        receivedSinceSeekRef.current = true
        return
      }
      const parsed = parseUrdfRobot(description)
      if (parsed) {
        receivedSinceSeekRef.current = true
        lastDescriptionRef.current = description
        hasRobotRef.current = true
        setRobot(parsed)
      }
    }

    const applyPayload = (payload: unknown) => {
      try {
        const adapted = adaptSceneMessage(adapter, payload, channel)
        applyDescription(adapter ? adapted.payload : (adapted.payload as { data?: unknown } | undefined)?.data)
      }
      catch (error) {
        console.warn(`Failed to adapt Robot Model topic "${topic}":`, error)
      }
    }

    const unsubscribe = globalMessagePipeline.subscribe({
      panelId,
      subscriptionId: `robot:${topic}`,
      topics: [{ topic, mode: 'latest' }],
    }, (message) => {
      receivedFromPipeline = true
      applyPayload(message.payload)
    })

    // A static robot_description can be logged just after the MCAP start time,
    // so a backfill at 00:00 may not include it. Read the first message directly
    // to make the robot available as soon as the panel opens.
    globalPlaybackController.getFirstMessagePayload(topic)
      .then((payload: unknown) => {
        if (isCurrent && !receivedFromPipeline) {
          applyPayload(payload)
        }
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          console.warn(`Failed to read robot description from "${topic}":`, error)
        }
      })

    // Robot descriptions are retained across seeks and replaced only when data changes.
    const unsubscribeSeek = globalMessagePipeline.subscribeSeek(panelId, () => {
      receivedSinceSeekRef.current = false
    })
    const unsubscribeSeekComplete = globalMessagePipeline.subscribeSeekComplete(panelId, () => {
      if (!receivedSinceSeekRef.current) {
        lastDescriptionRef.current = undefined
        hasRobotRef.current = false
        setRobot(null)
      }
    })
    return () => {
      isCurrent = false
      unsubscribe()
      unsubscribeSeek()
      unsubscribeSeekComplete()
    }
  }, [adapter, channel, panelId, topic])

  if (!robot) {
    return null
  }
  return (
    <group name={robot.name}>
      {robot.links.map(link => (
        <RobotLinkView
          key={link.name}
          assetLoadTracker={assetLoadTracker}
          link={link}
          tfCoordinator={tfCoordinator}
        />
      ))}
    </group>
  )
}
