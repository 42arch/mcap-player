export type UrdfGeometry
  = | { type: 'box', size: [number, number, number] }
    | { type: 'cylinder', radius: number, length: number }
    | { type: 'sphere', radius: number }
    | { type: 'mesh', filename: string, scale: [number, number, number] }

export interface UrdfVisual {
  id: string
  position: [number, number, number]
  orientation: [number, number, number, number]
  color: string
  geometry: UrdfGeometry
}

export interface UrdfLink {
  name: string
  position: [number, number, number]
  orientation: [number, number, number, number]
  visuals: UrdfVisual[]
}

export interface UrdfRobot {
  name: string
  rootFrame: string
  links: UrdfLink[]
}

const defaultColor = '#75a6c8'

function numberList(value: string | null, fallback: number[]): number[] {
  const values = (value || '').trim().split(/\s+/).map(Number)
  return values.length === fallback.length && values.every(Number.isFinite) ? values : fallback
}

function toColor(value: string | null): string {
  const [r, g, b] = numberList(value, [0.46, 0.65, 0.78, 1])
  const toHex = (channel: number) => Math.round(Math.min(1, Math.max(0, channel)) * 255).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function rpyToQuaternion([roll, pitch, yaw]: number[]): [number, number, number, number] {
  const halfRoll = roll / 2
  const halfPitch = pitch / 2
  const halfYaw = yaw / 2
  const cr = Math.cos(halfRoll)
  const sr = Math.sin(halfRoll)
  const cp = Math.cos(halfPitch)
  const sp = Math.sin(halfPitch)
  const cy = Math.cos(halfYaw)
  const sy = Math.sin(halfYaw)
  return [
    sr * cp * cy - cr * sp * sy,
    cr * sp * cy + sr * cp * sy,
    cr * cp * sy - sr * sp * cy,
    cr * cp * cy + sr * sp * sy,
  ]
}

interface UrdfPose {
  position: [number, number, number]
  orientation: [number, number, number, number]
}

function composePoses(parent: UrdfPose, child: UrdfPose): UrdfPose {
  const [qx, qy, qz, qw] = parent.orientation
  const [x, y, z] = child.position
  const uvx = qy * z - qz * y
  const uvy = qz * x - qx * z
  const uvz = qx * y - qy * x
  const uuvx = qy * uvz - qz * uvy
  const uuvy = qz * uvx - qx * uvz
  const uuvz = qx * uvy - qy * uvx
  const [cx, cy, cz, cw] = child.orientation

  return {
    position: [
      parent.position[0] + x + 2 * (qw * uvx + uuvx),
      parent.position[1] + y + 2 * (qw * uvy + uuvy),
      parent.position[2] + z + 2 * (qw * uvz + uuvz),
    ],
    orientation: [
      qw * cx + qx * cw + qy * cz - qz * cy,
      qw * cy - qx * cz + qy * cw + qz * cx,
      qw * cz + qx * cy - qy * cx + qz * cw,
      qw * cw - qx * cx - qy * cy - qz * cz,
    ],
  }
}

function parseGeometry(geometry: Element): UrdfGeometry | null {
  const box = geometry.querySelector('box')
  if (box) {
    return { type: 'box', size: numberList(box.getAttribute('size'), [0.1, 0.1, 0.1]) as [number, number, number] }
  }
  const cylinder = geometry.querySelector('cylinder')
  if (cylinder) {
    return { type: 'cylinder', radius: Number(cylinder.getAttribute('radius')) || 0.05, length: Number(cylinder.getAttribute('length')) || 0.1 }
  }
  const sphere = geometry.querySelector('sphere')
  if (sphere) {
    return { type: 'sphere', radius: Number(sphere.getAttribute('radius')) || 0.05 }
  }
  const mesh = geometry.querySelector('mesh')
  if (mesh) {
    return {
      type: 'mesh',
      filename: mesh.getAttribute('filename')?.trim() || '',
      scale: numberList(mesh.getAttribute('scale'), [1, 1, 1]) as [number, number, number],
    }
  }
  return null
}

/** Parses visual primitives from an in-bag ROS robot_description URDF. */
export function parseUrdfRobot(xml: unknown): UrdfRobot | null {
  if (typeof xml !== 'string' || !xml.trim() || typeof DOMParser === 'undefined') {
    return null
  }
  const document = new DOMParser().parseFromString(xml, 'application/xml')
  const robot = document.querySelector('robot')
  if (!robot || document.querySelector('parsererror')) {
    return null
  }

  const linkElements = Array.from(robot.querySelectorAll('link'))
  const identityPose = (): UrdfPose => ({
    position: [0, 0, 0],
    orientation: [0, 0, 0, 1],
  })
  const jointByChild = new Map<string, { parent: string, pose: UrdfPose }>()
  const childLinks = new Set<string>()
  for (const joint of robot.querySelectorAll('joint')) {
    const parent = joint.querySelector('parent')?.getAttribute('link')?.trim()
    const child = joint.querySelector('child')?.getAttribute('link')?.trim()
    if (!parent || !child) {
      continue
    }
    childLinks.add(child)
    const origin = joint.querySelector('origin')
    jointByChild.set(child, {
      parent,
      pose: {
        position: numberList(origin?.getAttribute('xyz') || null, [0, 0, 0]) as [number, number, number],
        orientation: rpyToQuaternion(numberList(origin?.getAttribute('rpy') || null, [0, 0, 0])),
      },
    })
  }

  const posesByLink = new Map<string, UrdfPose>()
  const resolving = new Set<string>()
  const resolveLinkPose = (linkName: string): UrdfPose => {
    const cached = posesByLink.get(linkName)
    if (cached) {
      return cached
    }
    const joint = jointByChild.get(linkName)
    if (!joint || resolving.has(linkName)) {
      return identityPose()
    }
    resolving.add(linkName)
    const pose = composePoses(resolveLinkPose(joint.parent), joint.pose)
    resolving.delete(linkName)
    posesByLink.set(linkName, pose)
    return pose
  }

  return {
    name: robot.getAttribute('name') || 'Robot',
    rootFrame: linkElements.find(link => !childLinks.has(link.getAttribute('name') || ''))?.getAttribute('name')
      || linkElements[0]?.getAttribute('name')
      || 'base_link',
    links: linkElements.map((link) => {
      const name = link.getAttribute('name') || 'unnamed-link'
      const pose = resolveLinkPose(name)
      const visuals = Array.from(link.children)
        .filter(child => child.tagName === 'visual')
        .map((visual, index): UrdfVisual | null => {
          const origin = visual.querySelector('origin')
          const geometryElement = visual.querySelector('geometry')
          const geometry = geometryElement ? parseGeometry(geometryElement) : null
          if (!geometry) {
            return null
          }
          const color = toColor(visual.querySelector('material > color')?.getAttribute('rgba') || null)
          return {
            id: `${name}-${index}`,
            position: numberList(origin?.getAttribute('xyz') || null, [0, 0, 0]) as [number, number, number],
            orientation: rpyToQuaternion(numberList(origin?.getAttribute('rpy') || null, [0, 0, 0])),
            color: color || defaultColor,
            geometry,
          }
        })
        .filter((visual): visual is UrdfVisual => visual !== null)
      return {
        name,
        position: pose.position,
        orientation: pose.orientation,
        visuals,
      }
    }),
  }
}
