import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useThreat } from './threat'

/**
 * Purely visual now — collection is decided by useTriggersLoop's distance
 * check against triggers.ts, not a physics sensor (see playerPosition.ts
 * for why). Glows so it's findable by flashlight alone.
 */
export function Clue({ id, position }: { id: string; position: [number, number, number] }) {
  const mesh = useRef<THREE.Mesh>(null!)
  const collected = useThreat((s) => s.cluesCollected.has(id))

  useFrame(({ clock }) => {
    if (!mesh.current) return
    mesh.current.rotation.y = clock.elapsedTime * 1.2
    mesh.current.position.set(
      position[0],
      position[1] + Math.sin(clock.elapsedTime * 2) * 0.08,
      position[2],
    )
  })

  if (collected) return null

  return (
    <group>
      <mesh ref={mesh} position={position}>
        <octahedronGeometry args={[0.25]} />
        <meshStandardMaterial
          color="#ffcc66"
          emissive="#ffaa22"
          emissiveIntensity={2}
          toneMapped={false}
        />
      </mesh>
      <pointLight position={position} color="#ffaa22" intensity={60} distance={3} />
    </group>
  )
}
