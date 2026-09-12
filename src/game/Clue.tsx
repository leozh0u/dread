import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { useThreat, CLUES_REQUIRED } from './threat'

/**
 * Purely visual now — collection is decided by useTriggersLoop's distance
 * check against triggers.ts, not a physics sensor (see playerPosition.ts
 * for why). These are meant to read as actual objects with a story behind
 * them (a photograph, a journal page, a key) rather than unlabeled glowing
 * shapes — the label fades in as the player gets close so it's legible
 * without cluttering the view from across a room.
 */
export function Clue({
  id,
  position,
  label,
}: {
  id: string
  position: [number, number, number]
  label: string
}) {
  const mesh = useRef<THREE.Mesh>(null!)
  const collected = useThreat((s) => s.cluesCollected.has(id))
  const collectedCount = useThreat((s) => s.cluesCollected.size)

  useFrame(({ clock, camera }) => {
    if (!mesh.current) return
    mesh.current.rotation.y = clock.elapsedTime * 1.2
    mesh.current.position.set(
      position[0],
      position[1] + Math.sin(clock.elapsedTime * 2) * 0.08,
      position[2],
    )
    const dist = camera.position.distanceTo(new THREE.Vector3(...position))
    mesh.current.visible = true
    ;(mesh.current.material as THREE.MeshStandardMaterial).emissiveIntensity =
      dist < 4 ? 2.5 : 1.5
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
      <Html position={[position[0], position[1] + 0.5, position[2]]} center distanceFactor={8}>
        <div
          style={{
            fontFamily: 'monospace',
            fontSize: 11,
            color: '#ffcc88',
            background: 'rgba(0,0,0,0.55)',
            padding: '2px 6px',
            borderRadius: 3,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            letterSpacing: 0.5,
          }}
        >
          {label} · {collectedCount}/{CLUES_REQUIRED}
        </div>
      </Html>
    </group>
  )
}
