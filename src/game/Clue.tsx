import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useThreat } from './threat'

/**
 * A fragment: a broken length of fluorescent tube, still lit, resting
 * where it fell.
 *
 * It used to be a floating rotating octahedron, which is a videogame
 * token — it had no relationship to this building, so it read as an
 * abstract diamond nobody could explain the purpose of. This version
 * belongs to the world: the ceiling lights are failing everywhere in
 * here, so a piece of one lying on the floor still glowing is both
 * legible as "take this" and an explanation of its own light. It also
 * ties the collectibles to the one thing keeping you able to see.
 *
 * Collection is still decided by useTriggersLoop's distance check
 * against triggers.ts, not by a physics sensor (see playerPosition.ts).
 */
export function Clue({ id, position }: { id: string; position: [number, number, number] }) {
  const glass = useRef<THREE.Mesh>(null!)
  const mat = useRef<THREE.MeshStandardMaterial>(null!)
  const collected = useThreat((s) => s.cluesCollected.has(id))

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    // Failing, like every other light in the building — but never fully
    // out, or you'd never find it.
    const flicker = 0.55 + 0.45 * Math.abs(Math.sin(t * 2.3) * Math.sin(t * 0.7 + 1.1))
    if (mat.current) mat.current.emissiveIntensity = 1.1 + flicker * 1.6
  })

  if (collected) return null

  const [x, y, z] = position

  return (
    <group position={[x, y - 0.45, z]} rotation={[0, 0.6, 0.18]}>
      {/* the broken tube, lying at an angle against the floor */}
      <mesh ref={glass} rotation={[0, 0, Math.PI / 2.4]} castShadow>
        <cylinderGeometry args={[0.055, 0.055, 0.62, 8]} />
        <meshStandardMaterial
          ref={mat}
          color="#fff4d0"
          emissive="#ffe9a8"
          emissiveIntensity={1.8}
          roughness={0.3}
          toneMapped={false}
        />
      </mesh>
      {/* shattered end cap */}
      <mesh position={[0.26, 0.11, 0]} rotation={[0, 0, Math.PI / 2.4]}>
        <cylinderGeometry args={[0.062, 0.03, 0.07, 8]} />
        <meshStandardMaterial color="#3a352a" roughness={0.8} />
      </mesh>
      {/* splinters of glass scattered around it */}
      {[
        [0.2, -0.04, 0.12, 0.7],
        [-0.24, -0.05, -0.09, -0.4],
        [0.09, -0.05, -0.19, 1.3],
      ].map(([sx, sy, sz, rot], i) => (
        <mesh key={i} position={[sx, sy, sz]} rotation={[Math.PI / 2, rot, 0]}>
          <coneGeometry args={[0.018, 0.09, 3]} />
          <meshStandardMaterial
            color="#fff4d0"
            emissive="#ffe9a8"
            emissiveIntensity={0.9}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  )
}
