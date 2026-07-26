import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { OrbitControls as OrbitControlsImpl } from 'three/examples/jsm/controls/OrbitControls.js'

interface CameraControlsProps {
  resetTrigger: number
  topViewTrigger: number
}

export function CameraControls({ resetTrigger, topViewTrigger }: CameraControlsProps) {
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
