import { useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { PointerLockControls } from '@react-three/drei'
import { Physics, RigidBody } from '@react-three/rapier'
import { EffectComposer, Vignette, Noise, ChromaticAberration } from '@react-three/postprocessing'
import * as THREE from 'three'
import { useDirector } from './director'

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
        intensity={8}
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

/**
 * Placeholder corridor — swap for a Kenney/Quaternius CC0 modular kit.
 * Deliberately blocky: darkness + fog does the concealing, not geometry
 * fidelity. See plan notes on why this is the correct tradeoff here.
 */
function Corridor() {
  return (
    <RigidBody type="fixed" colliders="cuboid">
      <mesh position={[0, -1, 0]} receiveShadow>
        <boxGeometry args={[6, 0.2, 40]} />
        <meshStandardMaterial color="#141414" />
      </mesh>
      <mesh position={[-3, 1.5, 0]} receiveShadow>
        <boxGeometry args={[0.2, 5, 40]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      <mesh position={[3, 1.5, 0]} receiveShadow>
        <boxGeometry args={[0.2, 5, 40]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
    </RigidBody>
  )
}

/** The thing hunting you. Distance driven by Director state (see director.ts). */
function Monster() {
  const distance = useDirector((s) => s.monsterDistance)
  const ref = useRef<THREE.Mesh>(null!)
  useFrame(() => {
    // Lerp toward the player along +z as distance shrinks. Placeholder box
    // until a Mixamo model is dropped in — kept mostly out of light on purpose.
    const z = -2 - distance * 30
    ref.current.position.z = THREE.MathUtils.lerp(ref.current.position.z, z, 0.02)
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
        <Corridor />
        <Monster />
        <RigidBody type="dynamic" colliders="ball" position={[0, 1, 10]} enabledRotations={[false, false, false]}>
          <mesh>
            <sphereGeometry args={[0.4]} />
            <meshStandardMaterial visible={false} />
          </mesh>
        </RigidBody>
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
