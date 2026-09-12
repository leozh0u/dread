import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const POSITIONS: number[] = [17, 9, 1, -9, -17] // z along the corridor spine

/** A single floor chevron pointing toward -z (deeper into the house,
 * toward the door). Reads as "something left a trail" rather than a
 * literal HUD arrow — thin, dim, on the floor, easy to miss if you're
 * not looking down, present if you need it. */
function Chevron({ z }: { z: number }) {
  const glow = useRef<THREE.MeshStandardMaterial>(null!)
  useFrame(({ clock }) => {
    if (glow.current) {
      glow.current.emissiveIntensity = 0.6 + Math.sin(clock.elapsedTime * 1.5 + z) * 0.2
    }
  })
  return (
    <group position={[0, -0.89, z]}>
      <mesh rotation={[-Math.PI / 2, 0, Math.PI / 4]} position={[-0.18, 0, 0]}>
        <planeGeometry args={[0.06, 0.5]} />
        <meshStandardMaterial ref={glow} color="#3a2010" emissive="#ff6622" emissiveIntensity={0.6} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, -Math.PI / 4]} position={[0.18, 0, 0]}>
        <planeGeometry args={[0.06, 0.5]} />
        <meshStandardMaterial color="#3a2010" emissive="#ff6622" emissiveIntensity={0.6} />
      </mesh>
    </group>
  )
}

export function Signage() {
  return (
    <>
      {POSITIONS.map((z) => (
        <Chevron key={z} z={z} />
      ))}
    </>
  )
}
