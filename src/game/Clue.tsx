import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useThreat } from './threat'

/**
 * Purely visual — collection is decided by useTriggersLoop's distance
 * check against triggers.ts, not a physics sensor (see playerPosition.ts
 * for why). Deliberately abstract: a glowing shard, no floating label and
 * no story-object framing. The HUD already tracks how many you've found,
 * which is all the player actually needs to know.
 */
export function Clue({ id, position }: { id: string; position: [number, number, number] }) {
  const mesh = useRef<THREE.Mesh>(null!)
  const collected = useThreat((s) => s.cluesCollected.has(id))

  useFrame(({ clock, camera }) => {
    if (!mesh.current) return
    mesh.current.rotation.y = clock.elapsedTime * 1.2
    mesh.current.position.set(
      position[0],
      position[1] + Math.sin(clock.elapsedTime * 2) * 0.08,
      position[2],
    )
    const dist = camera.position.distanceTo(new THREE.Vector3(...position))
    ;(mesh.current.material as THREE.MeshStandardMaterial).emissiveIntensity = dist < 4 ? 2.5 : 1.5
  })

  if (collected) return null

  return (
    <group>
      <mesh ref={mesh} position={position}>
        <octahedronGeometry args={[0.25]} />
        <meshStandardMaterial
          color="#ffcc66"
          emissive="#ffaa22"
          emissiveIntensity={1.5}
          toneMapped={false}
        />
      </mesh>
      <pointLight position={position} color="#ffaa22" intensity={60} distance={3} />
    </group>
  )
}
