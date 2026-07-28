import type * as THREE from 'three'
import type { FrameTransformCoordinator } from './tf-coordinator'
import type { UrdfGeometry, UrdfLink, UrdfRobot, UrdfVisual } from '@/core/parsers/urdf-parser'
import { useEffect, useRef, useState } from 'react'
import { parseUrdfRobot } from '@/core/parsers/urdf-parser'
import { globalMessagePipeline } from '@/panels/runtime/message-pipeline'

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
  // Mesh paths in a robot_description often point to a ROS package that is not
  // bundled in MCAP. A bounded proxy keeps the kinematic structure inspectable.
  return <boxGeometry args={geometry.scale} />
}

function RobotVisual({ visual }: { visual: UrdfVisual }) {
  return (
    <mesh position={visual.position} quaternion={visual.orientation}>
      <RobotGeometry geometry={visual.geometry} />
      <meshStandardMaterial color={visual.color} roughness={0.65} metalness={0.05} />
    </mesh>
  )
}

function RobotLinkView({ link, tfCoordinator }: { link: UrdfLink, tfCoordinator: FrameTransformCoordinator }) {
  const groupRef = useRef<THREE.Group>(null)

  useEffect(() => {
    const group = groupRef.current
    return group ? tfCoordinator.registerFrameTarget(group, link.name) : undefined
  }, [link.name, tfCoordinator])

  if (link.visuals.length === 0) {
    return null
  }
  return (
    <group ref={groupRef}>
      {link.visuals.map(visual => <RobotVisual key={visual.id} visual={visual} />)}
    </group>
  )
}

/** Renders an in-bag robot_description and drives each link from the TF tree. */
export function RobotLayer({ panelId, topic, tfCoordinator }: { panelId: string, topic: string, tfCoordinator: FrameTransformCoordinator }) {
  const [robot, setRobot] = useState<UrdfRobot | null>(null)

  useEffect(() => {
    const unsubscribe = globalMessagePipeline.subscribe({
      panelId,
      subscriptionId: `robot:${topic}`,
      topics: [{ topic, mode: 'latest' }],
    }, (message) => {
      const payload = message.payload as { data?: unknown } | undefined
      const parsed = parseUrdfRobot(payload?.data)
      if (parsed) {
        setRobot(parsed)
      }
    })
    const unsubscribeSeek = globalMessagePipeline.subscribeSeek(panelId, () => setRobot(null))
    return () => {
      unsubscribe()
      unsubscribeSeek()
    }
  }, [panelId, topic])

  if (!robot) {
    return null
  }
  return (
    <group name={robot.name}>
      {robot.links.map(link => <RobotLinkView key={link.name} link={link} tfCoordinator={tfCoordinator} />)}
    </group>
  )
}
