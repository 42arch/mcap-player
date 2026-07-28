export type UrdfGeometry
  = | { type: 'box', size: [number, number, number] }
    | { type: 'cylinder', radius: number, length: number }
    | { type: 'sphere', radius: number }
    | { type: 'mesh', scale: [number, number, number] }

export interface UrdfVisual {
  id: string
  position: [number, number, number]
  orientation: [number, number, number, number]
  color: string
  geometry: UrdfGeometry
}

export interface UrdfLink {
  name: string
  visuals: UrdfVisual[]
}

export interface UrdfRobot {
  name: string
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
    return { type: 'mesh', scale: numberList(mesh.getAttribute('scale'), [0.12, 0.12, 0.12]) as [number, number, number] }
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

  return {
    name: robot.getAttribute('name') || 'Robot',
    links: Array.from(robot.querySelectorAll('link')).map((link) => {
      const name = link.getAttribute('name') || 'unnamed-link'
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
      return { name, visuals }
    }),
  }
}
