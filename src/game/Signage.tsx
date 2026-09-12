import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// One chevron per corridor segment of the maze (see maze.ts), oriented to
// point along that segment's direction of travel rather than a single
// fixed direction — the old single-spine version always pointed -z,
// which stopped making sense once the path actually turns.
const CHEVRONS: { x: number; z: number; rotY: number }[] = [
  { x: 0, z: 15, rotY: 0 }, // A -> B, heading south
  { x: 6, z: 8, rotY: -Math.PI / 2 }, // B -> C, heading east
  { x: 12, z: -1, rotY: 0 }, // C -> D, heading south
  { x: 12, z: -16, rotY: 0 }, // D -> F, heading south
  { x: 0, z: -24, rotY: Math.PI / 2 }, // F -> G, heading west
  { x: -10, z: -32, rotY: 0 }, // G -> H, heading south
  { x: -4, z: -40, rotY: -Math.PI / 2 }, // H -> I, heading east
  { x: 4, z: -44, rotY: 0 }, // I -> door, heading south
]

/** A single floor chevron pointing along its corridor's direction of
 * travel. Reads as "something left a trail" rather than a literal HUD
 * arrow — thin, dim, on the floor, easy to miss if you're not looking
 * down, present if you need it. */
function Chevron({ x, z, rotY }: { x: number; z: number; rotY: number }) {
  const glow = useRef<THREE.MeshStandardMaterial>(null!)
  useFrame(({ clock }) => {
    if (glow.current) {
      glow.current.emissiveIntensity = 0.6 + Math.sin(clock.elapsedTime * 1.5 + z) * 0.2
    }
  })
  return (
    <group position={[x, -0.89, z]} rotation={[0, rotY, 0]}>
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
      {CHEVRONS.map((c, i) => (
        <Chevron key={i} {...c} />
      ))}
    </>
  )
}
