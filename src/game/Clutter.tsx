import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/** Pure set-dressing — no colliders, no triggers, just breaking up the
 * "flat wall and hallway" feel with a few unique objects per area instead
 * of repeated geometry. Cheap on purpose: this is atmosphere, not content. */
export function Clutter() {
  const bulb = useRef<THREE.PointLight>(null!)
  const bulbMesh = useRef<THREE.Mesh>(null!)

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const swing = Math.sin(t * 1.3) * 0.15
    if (bulb.current) {
      bulb.current.position.x = swing
      bulb.current.intensity = 25 + Math.sin(t * 9) * 4 // faint flicker
    }
    if (bulbMesh.current) bulbMesh.current.position.x = swing
  })

  return (
    <group>
      {/* Swinging bare bulb over the corridor junction */}
      <mesh position={[0, 4.6, 1]}>
        <cylinderGeometry args={[0.01, 0.01, 0.6, 4]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      <mesh ref={bulbMesh} position={[0, 4.2, 1]}>
        <sphereGeometry args={[0.08, 8, 8]} />
        <meshStandardMaterial color="#ffdd88" emissive="#ffcc55" emissiveIntensity={2} toneMapped={false} />
      </mesh>
      <pointLight ref={bulb} position={[0, 4.2, 1]} color="#ffcc77" intensity={25} distance={5} />

      {/* Tilted picture frames along the corridor — abstract, not literal art */}
      <mesh position={[2.9, 2.2, 3]} rotation={[0, -Math.PI / 2, 0.08]}>
        <boxGeometry args={[0.05, 0.9, 0.7]} />
        <meshStandardMaterial color="#151515" roughness={0.7} />
      </mesh>
      <mesh position={[-2.9, 2.4, -8]} rotation={[0, Math.PI / 2, -0.05]}>
        <boxGeometry args={[0.05, 0.7, 0.5]} />
        <meshStandardMaterial color="#151515" roughness={0.7} />
      </mesh>

      {/* A toppled chair near room 3, half in the corridor */}
      <group position={[2.4, 0, -6]} rotation={[0, 0.6, Math.PI / 2.3]}>
        <mesh position={[0, 0.4, 0]}>
          <boxGeometry args={[0.4, 0.05, 0.4]} />
          <meshStandardMaterial color="#1e1712" roughness={0.9} />
        </mesh>
        <mesh position={[0.15, 0.2, 0.15]}>
          <cylinderGeometry args={[0.02, 0.02, 0.4, 5]} />
          <meshStandardMaterial color="#1e1712" />
        </mesh>
        <mesh position={[-0.15, 0.2, 0.15]}>
          <cylinderGeometry args={[0.02, 0.02, 0.4, 5]} />
          <meshStandardMaterial color="#1e1712" />
        </mesh>
        <mesh position={[0.15, 0.2, -0.15]}>
          <cylinderGeometry args={[0.02, 0.02, 0.4, 5]} />
          <meshStandardMaterial color="#1e1712" />
        </mesh>
        <mesh position={[-0.15, 0.2, -0.15]}>
          <cylinderGeometry args={[0.02, 0.02, 0.4, 5]} />
          <meshStandardMaterial color="#1e1712" />
        </mesh>
      </group>

      {/* Cracked, uneven ceiling patch over room 1 — small "wrong geometry" detail */}
      <mesh position={[5, 4.95, 6.5]} rotation={[0.05, 0.3, 0.02]}>
        <boxGeometry args={[1.4, 0.1, 1.2]} />
        <meshStandardMaterial color="#0c0c0c" roughness={1} />
      </mesh>
    </group>
  )
}
