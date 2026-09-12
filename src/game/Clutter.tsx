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

/** An abandoned desk — a real piece of furniture, the kind of thing left
 * behind in a building nobody came back to. Non-colliding: you walk
 * through it. At this scale in this darkness that reads fine, and it
 * avoids adding collision geometry that could trap the player. */
function Desk({ position, rotY = 0 }: { position: [number, number, number]; rotY?: number }) {
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      <mesh position={[0, 0.72, 0]}>
        <boxGeometry args={[1.5, 0.06, 0.7]} />
        <meshStandardMaterial color="#241c14" roughness={0.9} />
      </mesh>
      {/* drawer block on one side */}
      <mesh position={[-0.45, 0.42, 0]}>
        <boxGeometry args={[0.55, 0.55, 0.6]} />
        <meshStandardMaterial color="#1e1811" roughness={0.92} />
      </mesh>
      {[
        [0.65, 0.3],
        [0.65, -0.3],
        [-0.7, 0.3],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.36, z]}>
          <boxGeometry args={[0.06, 0.72, 0.06]} />
          <meshStandardMaterial color="#1a150e" roughness={0.95} />
        </mesh>
      ))}
      {/* something left on top */}
      <mesh position={[0.3, 0.77, 0.05]} rotation={[0, 0.4, 0]}>
        <boxGeometry args={[0.25, 0.03, 0.32]} />
        <meshStandardMaterial color="#3a352a" roughness={0.9} />
      </mesh>
    </group>
  )
}

/** A child's crayon drawing taped to the wall — off-kilter, scrawled,
 * the most "someone lived here" object in the level. */
function Drawing({ position, rotY }: { position: [number, number, number]; rotY: number }) {
  return (
    <group position={position} rotation={[0, rotY, 0.06]}>
      <mesh>
        <planeGeometry args={[0.38, 0.3]} />
        <meshStandardMaterial color="#b8ad91" roughness={0.95} side={2} />
      </mesh>
      {/* scrawled figures */}
      {[
        [-0.08, -0.02, 0.11, 0.2],
        [0.04, -0.03, 0.09, -0.3],
        [0.12, 0.05, 0.07, 1.2],
      ].map(([x, y, len, rot], i) => (
        <mesh key={i} position={[x, y, 0.005]} rotation={[0, 0, rot]}>
          <planeGeometry args={[0.012, len]} />
          <meshStandardMaterial color="#5a2a2a" side={2} />
        </mesh>
      ))}
      <mesh position={[-0.08, 0.06, 0.005]}>
        <circleGeometry args={[0.03, 8]} />
        <meshStandardMaterial color="#5a2a2a" side={2} />
      </mesh>
    </group>
  )
}

/** A dead/dying wall light — sputters at an irregular rate, never quite
 * settling. One of the "strange light sources" scattered around. */
function BrokenLight({ position, color = '#6a7a55' }: { position: [number, number, number]; color?: string }) {
  const light = useRef<THREE.PointLight>(null!)
  useFrame(({ clock }) => {
    if (!light.current) return
    const t = clock.elapsedTime
    // irregular, arrhythmic sputter — two detuned sines plus a hard cutoff
    const flicker = Math.sin(t * 11.3) * Math.sin(t * 2.7)
    light.current.intensity = flicker > -0.3 ? 9 + flicker * 5 : 0.4
  })
  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={[0.25, 0.12, 0.1]} />
        <meshStandardMaterial color="#15150f" roughness={0.9} />
      </mesh>
      <pointLight ref={light} color={color} intensity={9} distance={5} />
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
      {/* Swinging bare bulb at the B junction (first real turn) */}
      <mesh position={[0, 4.6, 8]}>
        <cylinderGeometry args={[0.01, 0.01, 0.6, 4]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      <mesh ref={bulbMesh} position={[0, 4.2, 8]}>
        <sphereGeometry args={[0.08, 8, 8]} />
        <meshStandardMaterial color="#ffdd88" emissive="#ffcc55" emissiveIntensity={2} toneMapped={false} />
      </mesh>
      <pointLight ref={bulb} position={[0, 4.2, 8]} color="#ffcc77" intensity={25} distance={5} />

      {/* A second bulb at the far side of the loop, so the maze doesn't
          rely on one light source */}
      <pointLight position={[-10, 4.2, -24]} color="#ffcc77" intensity={20} distance={5} />
      <mesh position={[-10, 4.2, -24]}>
        <sphereGeometry args={[0.07, 8, 8]} />
        <meshStandardMaterial color="#ffdd88" emissive="#ffcc55" emissiveIntensity={2} toneMapped={false} />
      </mesh>

      {/* Posters, scratches, a sketch, a toy — placed on real corridor
          walls throughout the maze (see maze.ts for the graph). Each is a
          different object, not a repeated prop. */}
      <Poster position={[-2.94, 1.7, 20]} rotY={Math.PI / 2} color="#5a2020" />
      <Poster position={[2.94, 1.6, 12]} rotY={-Math.PI / 2} color="#3a3020" />
      <Poster position={[8.94, 1.65, -4]} rotY={Math.PI / 2} color="#243040" />
      <Poster position={[-6.94, 1.5, -29]} rotY={-Math.PI / 2} color="#402a20" />
      <ScratchMarks position={[8.94, 1.5, 3]} rotY={Math.PI / 2} />
      <ScratchMarks position={[-1.94, 1.4, -19]} rotY={Math.PI / 2} />
      <SketchPage position={[-6.94, 1.3, -35]} rotY={-Math.PI / 2} />
      <SketchPage position={[1.94, 1.3, -18]} rotY={-Math.PI / 2} />
      <Drawing position={[2.94, 1.2, 3]} rotY={-Math.PI / 2} />
      <Drawing position={[-2.94, 1.15, -2]} rotY={Math.PI / 2} />
      <Drawing position={[8.94, 1.1, -18]} rotY={Math.PI / 2} />
      <Toy position={[13, -0.84, -8]} />
      <Toy position={[-9, -0.84, -40]} />
      <Toy position={[0, -0.84, -19]} />

      {/* Abandoned furniture — the "someone worked here and left" layer */}
      <Desk position={[10.6, -0.9, -14]} rotY={0.25} />
      <Desk position={[-8.6, -0.9, -30]} rotY={-1.4} />
      <Desk position={[1.4, -0.9, 11]} rotY={1.9} />

      {/* Strange, failing light sources scattered through the maze */}
      <BrokenLight position={[8.7, 2.6, -2]} color="#6a7a55" />
      <BrokenLight position={[-2.7, 2.6, -14]} color="#55606a" />
      <BrokenLight position={[-9.7, 2.6, -34]} color="#7a6a55" />
      <BrokenLight position={[2.7, 2.6, 15]} color="#6a5a6a" />

      {/* A toppled chair near the D junction */}
      <group position={[13, 0, -6]} rotation={[0, 0.6, Math.PI / 2.3]}>
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
