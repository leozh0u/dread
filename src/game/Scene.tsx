import { useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { PointerLockControls } from '@react-three/drei'
import { Physics } from '@react-three/rapier'
import { Player } from './Player'
import { House } from './House'
import { EffectComposer, Vignette, Noise, ChromaticAberration } from '@react-three/postprocessing'
import * as THREE from 'three'
import { useDirector } from './director'
import { setMonsterProximity } from './scareFx'

/** Flashlight rigidly attached to the camera. */
function Flashlight() {
  const light = useRef<THREE.SpotLight>(null!)
  const target = useRef<THREE.Object3D>(null!)
  const { camera } = useThree()

  useFrame(() => {
    light.current.position.copy(camera.position)
    const dir = new THREE.Vector3()
    camera.getWorldDirection(dir)
    target.current.position.copy(camera.position).add(dir.multiplyScalar(5))
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

/** The thing hunting you. Distance driven by Director state (see director.ts).
 * Clamped to stay within the calm room's far wall (z=-30) at max distance. */
function Monster() {
  const distance = useDirector((s) => s.monsterDistance)
  const ref = useRef<THREE.Mesh>(null!)
  useFrame(() => {
    const z = -2 - distance * 27 // distance 0 -> z=-2 (on top of you), 1 -> z=-29
    ref.current.position.z = THREE.MathUtils.lerp(ref.current.position.z, z, 0.02)
    setMonsterProximity(distance)
  })
  return (
    <mesh ref={ref} position={[0, 0.5, -25]}>
      <boxGeometry args={[0.8, 2, 0.5]} />
      <meshStandardMaterial color="#000" roughness={1} />
    </mesh>
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
      <ambientLight intensity={0.02} />
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
