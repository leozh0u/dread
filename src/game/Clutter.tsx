import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/** A cheap "poster" — a flat colored rectangle with one torn/peeling
 * corner (a small triangle offset from the main plane), pinned to a wall.
 * `rotY` should point it out of whichever wall it's mounted on. */
function Poster({
  position,
  rotY,
  color,
}: {
  position: [number, number, number]
  rotY: number
  color: string
}) {
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      <mesh>
        <planeGeometry args={[0.55, 0.75]} />
        <meshStandardMaterial color={color} roughness={0.85} side={2} />
      </mesh>
      <mesh position={[0.22, -0.32, 0.01]} rotation={[0, 0, 0.6]}>
        <planeGeometry args={[0.14, 0.1]} />
        <meshStandardMaterial color="#0a0a0a" roughness={1} side={2} />
      </mesh>
    </group>
  )
}

/** A hand-drawn map or sketch — pale paper plane with a few dark scrawled
 * lines (thin boxes) suggesting a floor plan someone else drew, left
 * behind. Reads as "a clue about the clue" without being one. */
function SketchPage({ position, rotY }: { position: [number, number, number]; rotY: number }) {
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      <mesh>
        <planeGeometry args={[0.4, 0.5]} />
        <meshStandardMaterial color="#c9bfa0" roughness={0.95} side={2} />
      </mesh>
      {[
        [0, 0.12, 0.3, 0],
        [-0.08, -0.02, 0.2, 0.9],
        [0.06, -0.15, 0.16, -0.5],
      ].map(([x, y, len, rot], i) => (
        <mesh key={i} position={[x, y, 0.005]} rotation={[0, 0, rot]}>
          <planeGeometry args={[len, 0.015]} />
          <meshStandardMaterial color="#2a2016" side={2} />
        </mesh>
      ))}
    </group>
  )
}

/** A child's toy left on the floor — small, bright, wrong for this house.
 * The single splash of a "normal" color in the whole level is the point. */
function Toy({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.06, 0]} rotation={[0.3, 0.4, 0.1]}>
        <boxGeometry args={[0.12, 0.12, 0.12]} />
        <meshStandardMaterial color="#8a2a2a" roughness={0.6} />
      </mesh>
      <mesh position={[0.1, 0.04, 0.05]}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshStandardMaterial color="#c9a020" roughness={0.6} />
      </mesh>
    </group>
  )
}

/** A few scratched-in arrows on a wall — someone clawed a direction into
 * the plaster. Distinct from the floor chevrons (Signage.tsx): those are
 * ambient wayfinding, these are texture/story. */
function ScratchMarks({ position, rotY }: { position: [number, number, number]; rotY: number }) {
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      {[-0.06, 0, 0.06].map((x, i) => (
        <mesh key={i} position={[x, 0, 0.005]} rotation={[0, 0, 1.1]}>
          <planeGeometry args={[0.012, 0.35]} />
          <meshStandardMaterial color="#3a1414" roughness={1} side={2} />
        </mesh>
      ))}
    </group>
  )
}

/** Pure set-dressing — no colliders, no triggers, just breaking up the
 * "flat wall and hallway" feel with a lot of unique objects instead of
 * repeated geometry. Cheap on purpose: this is atmosphere, not content. */
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
      {/* Swinging bare bulb over a corridor junction */}
      <mesh position={[0, 4.6, 5]}>
        <cylinderGeometry args={[0.01, 0.01, 0.6, 4]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      <mesh ref={bulbMesh} position={[0, 4.2, 5]}>
        <sphereGeometry args={[0.08, 8, 8]} />
        <meshStandardMaterial color="#ffdd88" emissive="#ffcc55" emissiveIntensity={2} toneMapped={false} />
      </mesh>
      <pointLight ref={bulb} position={[0, 4.2, 5]} color="#ffcc77" intensity={25} distance={5} />

      {/* A second bulb further down, past the midpoint, so the whole
          bigger corridor doesn't rely on one light source */}
      <pointLight position={[0, 4.2, -14]} color="#ffcc77" intensity={20} distance={5} />
      <mesh position={[0, 4.2, -14]}>
        <sphereGeometry args={[0.07, 8, 8]} />
        <meshStandardMaterial color="#ffdd88" emissive="#ffcc55" emissiveIntensity={2} toneMapped={false} />
      </mesh>

      {/* Tilted picture frames along the corridor — abstract, not literal art */}
      <mesh position={[2.9, 2.2, 14]} rotation={[0, -Math.PI / 2, 0.08]}>
        <boxGeometry args={[0.05, 0.9, 0.7]} />
        <meshStandardMaterial color="#151515" roughness={0.7} />
      </mesh>
      <mesh position={[-2.9, 2.4, -10]} rotation={[0, Math.PI / 2, -0.05]}>
        <boxGeometry args={[0.05, 0.7, 0.5]} />
        <meshStandardMaterial color="#151515" roughness={0.7} />
      </mesh>
      <mesh position={[2.9, 2.0, -2]} rotation={[0, -Math.PI / 2, -0.06]}>
        <boxGeometry args={[0.05, 0.6, 0.5]} />
        <meshStandardMaterial color="#151515" roughness={0.7} />
      </mesh>

      {/* Posters, scratches, a sketch, a toy — the "walls have nothing on
          them" fix. Each is a different object, not a repeated prop. */}
      <Poster position={[2.94, 1.7, 17]} rotY={-Math.PI / 2} color="#5a2020" />
      <Poster position={[-2.94, 1.5, 10]} rotY={Math.PI / 2} color="#2a3a2a" />
      <Poster position={[2.94, 1.6, -12]} rotY={-Math.PI / 2} color="#3a3020" />
      <SketchPage position={[-2.94, 1.3, -3]} rotY={Math.PI / 2} />
      <ScratchMarks position={[-2.94, 1.5, 6]} rotY={Math.PI / 2} />
      <ScratchMarks position={[2.94, 1.4, -16]} rotY={-Math.PI / 2} />
      <Toy position={[1, -0.84, 10.5]} />
      <Toy position={[-1.2, -0.84, -13]} />

      {/* The west branch's dead end — small, lit just enough to see there
          is something there, deliberately away from the monster's reach */}
      <pointLight position={[-14, 1.6, 6]} color="#7a6a4a" intensity={14} distance={4} />
      <Poster position={[-14.94, 1.5, 6]} rotY={Math.PI / 2} color="#403030" />
      <SketchPage position={[-13.5, 1.2, 5.15]} rotY={0} />
      <Toy position={[-13, -0.84, 6.3]} />

      {/* A toppled chair between rooms C and D */}
      <group position={[2.2, 0, -6]} rotation={[0, 0.6, Math.PI / 2.3]}>
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

      {/* Cracked, uneven ceiling patch over room A — small "wrong geometry" detail */}
      <mesh position={[5.5, 4.95, 14]} rotation={[0.05, 0.3, 0.02]}>
        <boxGeometry args={[1.4, 0.1, 1.2]} />
        <meshStandardMaterial color="#0c0c0c" roughness={1} />
      </mesh>
    </group>
  )
}
