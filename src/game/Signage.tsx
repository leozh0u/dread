import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// One chevron per corridor segment of the maze (see maze.ts), oriented to
// point along that segment's direction of travel rather than a single
// fixed direction — the old single-spine version always pointed -z,
// which stopped making sense once the path actually turns.
const CHEVRONS: { x: number; z: number; rotY: number }[] = [
  { x: 0, z: 22, rotY: 0 }, // A -> B, south
  { x: 7, z: 14, rotY: -Math.PI / 2 }, // B -> C, east
  { x: 14, z: 7, rotY: 0 }, // C -> D, south
  { x: 7, z: 0, rotY: Math.PI / 2 }, // D -> E, west
  { x: 0, z: 7, rotY: 0 }, // B -> E shortcut, south
  { x: -6, z: 0, rotY: Math.PI / 2 }, // E -> F, west
  { x: -12, z: -7, rotY: 0 }, // F -> G, south
  { x: -6, z: -14, rotY: -Math.PI / 2 }, // G -> H, east
  { x: 0, z: -7, rotY: 0 }, // E -> H shortcut, south
  { x: 7, z: -14, rotY: -Math.PI / 2 }, // H -> I, east
  { x: 0, z: -21, rotY: 0 }, // H -> J, south
  { x: 8, z: -28, rotY: -Math.PI / 2 }, // J -> K, east
  { x: 16, z: -35, rotY: 0 }, // K -> L, south
  { x: -7, z: -28, rotY: Math.PI / 2 }, // J -> M, west
  { x: -14, z: -35, rotY: 0 }, // M -> N, south
  { x: -6, z: -42, rotY: -Math.PI / 2 }, // N -> O, east
  { x: 9, z: -42, rotY: Math.PI / 2 }, // L -> O, west
  { x: 2, z: -46, rotY: 0 }, // O -> door, south
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
