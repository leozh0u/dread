import { useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { PointerLockControls } from '@react-three/drei'
import { Physics } from '@react-three/rapier'
import { Player } from './Player'
import { House } from './House'
import { Monster } from './Monster'
import { EffectComposer, Vignette, Noise, ChromaticAberration } from '@react-three/postprocessing'
import * as THREE from 'three'
import { updateAudioListener } from './scareFx'

/** Flashlight rigidly attached to the camera. */
function Flashlight() {
  const light = useRef<THREE.SpotLight>(null!)
  const target = useRef<THREE.Object3D>(null!)
  const { camera } = useThree()

  useFrame(() => {
    light.current.position.copy(camera.position)
    const dir = new THREE.Vector3()
    camera.getWorldDirection(dir)
    updateAudioListener(camera.position.x, camera.position.y, camera.position.z, dir.x, dir.y, dir.z)
    target.current.position.copy(camera.position).add(dir.clone().multiplyScalar(5))
    light.current.target = target.current
  })

  return (
    <>
      <spotLight
        ref={light}
        intensity={2500}
        angle={0.35}
        penumbra={0.5}
        distance={15}
        color="#fff2d0"
        castShadow
      />
      <object3D ref={target} />
    </>
  )
}

export function Scene() {
  return (
    <Canvas
      shadows
      camera={{ fov: 75, position: [0, 0.5, 10] }}
      gl={{ antialias: true }}
      onCreated={({ scene }) => {
        scene.fog = new THREE.Fog('#000000', 2, 12)
      }}
    >
      <color attach="background" args={['#000']} />
      <ambientLight intensity={0.08} />
      <Physics gravity={[0, -20, 0]}>
        <House />
        <Monster />
        <Player />
      </Physics>
      <Flashlight />
      <PointerLockControls />
      <EffectComposer>
        <Noise opacity={0.06} />
        <Vignette darkness={0.9} offset={0.3} />
        <ChromaticAberration offset={[0.0006, 0.0006]} />
      </EffectComposer>
    </Canvas>
  )
}
