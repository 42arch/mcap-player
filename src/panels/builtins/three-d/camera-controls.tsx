import type { RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls as OrbitControlsImpl } from 'three/examples/jsm/controls/OrbitControls.js'

interface CameraControlsProps {
  contentRef: RefObject<THREE.Group | null>
  focusRef?: RefObject<THREE.Object3D | null>
  focusKey: string
  waitForFrame: boolean
}

const MAX_FOCUS_WAIT_FRAMES = 120

export function CameraControls({ contentRef, focusRef, focusKey, waitForFrame }: CameraControlsProps) {
  const { camera, gl } = useThree()
  const controlsRef = useRef<OrbitControlsImpl | null>(null)
  const hasFocusedRef = useRef(false)
  const focusWaitFramesRef = useRef(0)
  const boundsRef = useRef(new THREE.Box3())
  const preferredBoundsRef = useRef(new THREE.Box3())
  const centerRef = useRef(new THREE.Vector3())
  const sizeRef = useRef(new THREE.Vector3())
  const offsetRef = useRef(new THREE.Vector3())

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
    hasFocusedRef.current = false
    focusWaitFramesRef.current = 0
  }, [focusKey])

  useFrame(() => {
    const controls = controlsRef.current
    controls?.update()
    if (!controls || hasFocusedRef.current || !waitForFrame) {
      return
    }

    const content = contentRef.current
    if (!content) {
      return
    }

    const preferredContent = focusRef?.current
    let bounds: THREE.Box3
    if (focusRef) {
      if (!preferredContent) {
        if (++focusWaitFramesRef.current < MAX_FOCUS_WAIT_FRAMES) {
          return
        }
        bounds = boundsRef.current.setFromObject(content)
      }
      else {
        bounds = preferredBoundsRef.current.setFromObject(preferredContent)
        if (bounds.isEmpty()) {
          if (++focusWaitFramesRef.current < MAX_FOCUS_WAIT_FRAMES) {
            return
          }
          bounds = boundsRef.current.setFromObject(content)
        }
      }
    }
    else {
      bounds = boundsRef.current.setFromObject(content)
    }
    if (bounds.isEmpty()) {
      return
    }

    const center = bounds.getCenter(centerRef.current)
    const size = bounds.getSize(sizeRef.current)
    const maxDimension = Math.max(size.x, size.y, size.z, 1)
    const perspectiveCamera = camera as THREE.PerspectiveCamera
    const fovRadians = THREE.MathUtils.degToRad(perspectiveCamera.fov || 50)
    const distance = Math.max(8, maxDimension / (2 * Math.tan(fovRadians / 2)) * 1.35)
    const offset = offsetRef.current.set(-distance, -distance, distance * 0.8)

    controls.target.copy(center)
    camera.position.copy(center).add(offset)
    perspectiveCamera.near = Math.max(0.01, distance / 10000)
    perspectiveCamera.far = Math.max(1000, distance * 2 + maxDimension * 4)
    camera.updateProjectionMatrix()
    controls.update()
    hasFocusedRef.current = true
  })

  return null
}
