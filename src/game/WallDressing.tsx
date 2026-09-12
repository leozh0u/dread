import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { EDGES, findJunction, HALF_WIDTH } from './maze'

/**
 * Dresses every corridor wall in the maze, procedurally.
 *
 * Hand-placing props doesn't scale past a few and leaves most of the
 * level bare — which is why the corridors still read as empty after
 * three passes of adding things. This walks the actual graph (maze.ts),
 * steps along both walls of every edge, and places a prop at intervals,
 * choosing the type from a deterministic hash of the position. Stable
 * between runs, no layout roulette, and it dresses all ~18 corridors
 * rather than the four I'd get to by hand.
 *
 * Everything here is non-colliding decoration mounted flat to a wall.
 */

const WALL_H = 3.2
type Vec3 = [number, number, number]

/** Deterministic 0..1 from a position — same spot always gets the same
 * prop, so the level doesn't reshuffle itself between runs. */
function hash(x: number, z: number, salt = 0) {
  const v = Math.sin(x * 127.1 + z * 311.7 + salt * 74.7) * 43758.5453
  return v - Math.floor(v)
}

const PAPER = ['#b9ad8c', '#a8a089', '#c2b696', '#95998a']
const INK = '#2a2218'

/** A poster/notice, foxed and curling. */
function Poster({ position, rotY, seed }: { position: Vec3; rotY: number; seed: number }) {
  const w = 0.4 + seed * 0.3
  const h = 0.5 + seed * 0.35
  return (
    <group position={position} rotation={[0, rotY, (seed - 0.5) * 0.12]}>
      <mesh>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial color={PAPER[Math.floor(seed * 4) % 4]} roughness={0.95} side={2} />
      </mesh>
      {/* printed blocks — reads as text/graphics without needing a texture */}
      {Array.from({ length: 3 + Math.floor(seed * 3) }).map((_, i) => (
        <mesh key={i} position={[0, h * 0.3 - i * h * 0.16, 0.004]}>
          <planeGeometry args={[w * (0.45 + hash(i, seed * 10) * 0.4), h * 0.045]} />
          <meshStandardMaterial color={INK} side={2} />
        </mesh>
      ))}
      {/* a big dark shape at the top, like a photo or logo */}
      <mesh position={[0, h * 0.32, 0.003]}>
        <planeGeometry args={[w * 0.55, h * 0.22]} />
        <meshStandardMaterial color="#3b3226" side={2} />
      </mesh>
      {/* peeling corner */}
      <mesh position={[w * 0.42, -h * 0.44, 0.012]} rotation={[0, 0, 0.8]}>
        <planeGeometry args={[w * 0.22, h * 0.14]} />
        <meshStandardMaterial color="#6f6650" side={2} />
      </mesh>
    </group>
  )
}

/** A floor-plan / evacuation map behind glass — the single most
 * "institution that people left" object there is. */
function EvacMap({ position, rotY, seed }: { position: Vec3; rotY: number; seed: number }) {
  return (
    <group position={position} rotation={[0, rotY, (seed - 0.5) * 0.05]}>
      <mesh>
        <planeGeometry args={[0.62, 0.46]} />
        <meshStandardMaterial color="#1d1d18" roughness={0.6} metalness={0.3} side={2} />
      </mesh>
      <mesh position={[0, 0, 0.005]}>
        <planeGeometry args={[0.55, 0.39]} />
        <meshStandardMaterial color="#9aa08c" roughness={0.9} side={2} />
      </mesh>
      {/* schematic corridors */}
      {[
        [-0.12, 0.08, 0.26, 0.014],
        [0.1, -0.02, 0.2, 0.014],
        [0, -0.12, 0.34, 0.014],
      ].map(([x, y, w, t], i) => (
        <mesh key={i} position={[x, y, 0.008]}>
          <planeGeometry args={[w, t]} />
          <meshStandardMaterial color="#39392e" side={2} />
        </mesh>
      ))}
      {[
        [-0.22, 0.0, 0.014, 0.18],
        [0.19, 0.04, 0.014, 0.22],
      ].map(([x, y, w, h], i) => (
        <mesh key={`v${i}`} position={[x, y, 0.008]}>
          <planeGeometry args={[w, h]} />
          <meshStandardMaterial color="#39392e" side={2} />
        </mesh>
      ))}
      {/* YOU ARE HERE — the only red thing on any wall in the game */}
      <mesh position={[0.02, -0.04, 0.01]}>
        <circleGeometry args={[0.018, 10]} />
        <meshStandardMaterial color="#8c2020" emissive="#6a1414" emissiveIntensity={0.6} side={2} />
      </mesh>
    </group>
  )
}

/** A child's crayon drawing, taped up crooked. */
function Drawing({ position, rotY, seed }: { position: Vec3; rotY: number; seed: number }) {
  return (
    <group position={position} rotation={[0, rotY, (seed - 0.5) * 0.35]}>
      <mesh>
        <planeGeometry args={[0.32, 0.26]} />
        <meshStandardMaterial color="#bdb295" roughness={0.97} side={2} />
      </mesh>
      {/* a figure: head, body, splayed limbs */}
      <mesh position={[-0.04, 0.05, 0.004]}>
        <circleGeometry args={[0.026, 10]} />
        <meshStandardMaterial color="#5e2a24" side={2} />
      </mesh>
      {[
        [-0.04, -0.02, 0.008, 0.07, 0],
        [-0.08, -0.02, 0.006, 0.05, 0.7],
        [0.0, -0.02, 0.006, 0.05, -0.7],
        [-0.06, -0.08, 0.006, 0.05, 0.3],
        [-0.02, -0.08, 0.006, 0.05, -0.3],
      ].map(([x, y, w, h, r], i) => (
        <mesh key={i} position={[x, y, 0.004]} rotation={[0, 0, r]}>
          <planeGeometry args={[w, h]} />
          <meshStandardMaterial color="#5e2a24" side={2} />
        </mesh>
      ))}
      {/* and a much taller one beside it, with too many arms */}
      <mesh position={[0.09, 0.0, 0.004]}>
        <planeGeometry args={[0.008, 0.17]} />
        <meshStandardMaterial color="#22201a" side={2} />
      </mesh>
      {[0.5, -0.5, 1.1, -1.1].map((r, i) => (
        <mesh key={i} position={[0.09, 0.04 - i * 0.012, 0.004]} rotation={[0, 0, r]}>
          <planeGeometry args={[0.006, 0.09]} />
          <meshStandardMaterial color="#22201a" side={2} />
        </mesh>
      ))}
      <mesh position={[0.09, 0.1, 0.004]}>
        <circleGeometry args={[0.016, 8]} />
        <meshStandardMaterial color="#22201a" side={2} />
      </mesh>
    </group>
  )
}

/** Tally marks scratched into the plaster — someone counted something. */
function Tallies({ position, rotY, seed }: { position: Vec3; rotY: number; seed: number }) {
  const count = 7 + Math.floor(seed * 14)
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      {Array.from({ length: count }).map((_, i) => {
        const group5 = Math.floor(i / 5)
        const inGroup = i % 5
        const x = group5 * 0.1 + inGroup * 0.017 - count * 0.008
        const strike = inGroup === 4
        return (
          <mesh
            key={i}
            position={[x, 0, 0.004]}
            rotation={[0, 0, strike ? 1.15 : (hash(i, seed) - 0.5) * 0.12]}
          >
            <planeGeometry args={[strike ? 0.006 : 0.005, strike ? 0.1 : 0.075]} />
            <meshStandardMaterial color="#2e2620" side={2} />
          </mesh>
        )
      })}
    </group>
  )
}

/** Long claw gouges dragged down the wall. */
function Gouges({ position, rotY, seed }: { position: Vec3; rotY: number; seed: number }) {
  return (
    <group position={position} rotation={[0, rotY, (seed - 0.5) * 0.3]}>
      {[-0.05, -0.017, 0.017, 0.05].map((x, i) => (
        <mesh key={i} position={[x, (hash(i, seed) - 0.5) * 0.06, 0.004]} rotation={[0, 0, 0.08]}>
          <planeGeometry args={[0.008, 0.42 + hash(i, seed * 3) * 0.3]} />
          <meshStandardMaterial color="#231c16" side={2} />
        </mesh>
      ))}
    </group>
  )
}

/** A water stain bleeding down from the ceiling. */
function Stain({ position, rotY, seed }: { position: Vec3; rotY: number; seed: number }) {
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      <mesh position={[0, 0, 0.003]}>
        <planeGeometry args={[0.5 + seed * 0.5, 0.9 + seed * 0.7]} />
        <meshStandardMaterial color="#3f3624" transparent opacity={0.55} roughness={1} side={2} />
      </mesh>
      <mesh position={[(seed - 0.5) * 0.2, -0.2, 0.004]}>
        <planeGeometry args={[0.2 + seed * 0.2, 0.5]} />
        <meshStandardMaterial color="#332c1d" transparent opacity={0.5} roughness={1} side={2} />
      </mesh>
    </group>
  )
}

/** An institutional door that doesn't open — corridors that only lead
 * onward feel like a set; doors you can't use feel like a building. */
function DeadDoor({ position, rotY }: { position: Vec3; rotY: number }) {
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      <mesh position={[0, 0, 0.02]}>
        <planeGeometry args={[0.95, 2.05]} />
        <meshStandardMaterial color="#2e2820" roughness={0.85} side={2} />
      </mesh>
      {/* frame */}
      <mesh position={[0, 0, 0.01]}>
        <planeGeometry args={[1.06, 2.16]} />
        <meshStandardMaterial color="#1c1812" roughness={0.9} side={2} />
      </mesh>
      {/* small wired-glass window */}
      <mesh position={[0, 0.58, 0.03]}>
        <planeGeometry args={[0.34, 0.4]} />
        <meshStandardMaterial color="#0a0a08" roughness={0.4} metalness={0.2} side={2} />
      </mesh>
      {/* handle */}
      <mesh position={[0.36, -0.05, 0.035]}>
        <boxGeometry args={[0.12, 0.03, 0.03]} />
        <meshStandardMaterial color="#7a6f55" roughness={0.5} metalness={0.6} />
      </mesh>
    </group>
  )
}

type PropKind = 'poster' | 'map' | 'drawing' | 'tallies' | 'gouges' | 'stain' | 'door'

interface Placement {
  kind: PropKind
  position: Vec3
  rotY: number
  seed: number
}

/** Walk every corridor, stepping along both walls, placing props. */
function buildPlacements(): Placement[] {
  const out: Placement[] = []
  const STEP = 3.4 // metres between candidate spots

  for (const edge of EDGES) {
    const a = findJunction(edge.a)
    const b = findJunction(edge.b)
    const vertical = a.x === b.x
    const len = vertical ? Math.abs(b.z - a.z) : Math.abs(b.x - a.x)
    const usable = len - HALF_WIDTH * 2
    if (usable < STEP) continue
    const steps = Math.floor(usable / STEP)

    for (let i = 1; i <= steps; i++) {
      const t = (HALF_WIDTH + (i * usable) / (steps + 1)) / len
      const cx = a.x + (b.x - a.x) * t
      const cz = a.z + (b.z - a.z) * t

      for (const side of [-1, 1] as const) {
        const h = hash(cx, cz, side)
        if (h > 0.72) continue // leave gaps — wall-to-wall props read as a gallery

        // Mount just inside the wall face, pointing into the corridor
        const px = vertical ? cx + side * (HALF_WIDTH - 0.06) : cx
        const pz = vertical ? cz : cz + side * (HALF_WIDTH - 0.06)
        const rotY = vertical ? (side > 0 ? -Math.PI / 2 : Math.PI / 2) : side > 0 ? Math.PI : 0

        const pick = hash(cx, cz, side * 7 + 3)
        let kind: PropKind
        let y: number
        if (pick < 0.3) {
          kind = 'poster'
          y = 1.5 + h * 0.3
        } else if (pick < 0.42) {
          kind = 'map'
          y = 1.6
        } else if (pick < 0.54) {
          kind = 'drawing'
          y = 0.95 + h * 0.25
        } else if (pick < 0.64) {
          kind = 'tallies'
          y = 1.25
        } else if (pick < 0.74) {
          kind = 'gouges'
          y = 1.45
        } else if (pick < 0.88) {
          kind = 'stain'
          y = WALL_H - 1.4
        } else {
          kind = 'door'
          y = 0.15
        }

        out.push({ kind, position: [px, y, pz], rotY, seed: h })
      }
    }
  }
  return out
}

/** A few of the stains get a slow drip of light across them from a
 * failing fixture — motion on an otherwise static wall. */
export function WallDressing() {
  const placements = useMemo(buildPlacements, [])
  const group = useRef<THREE.Group>(null!)

  useFrame(({ camera }) => {
    // Cull by distance: ~200 props is fine to have in the scene, but no
    // reason to have them all drawing every frame across a 95m level.
    if (!group.current) return
    for (const child of group.current.children) {
      const dx = child.position.x - camera.position.x
      const dz = child.position.z - camera.position.z
      child.visible = dx * dx + dz * dz < 900 // 30m
    }
  })

  return (
    <group ref={group}>
      {placements.map((p, i) => {
        const common = { position: p.position, rotY: p.rotY, seed: p.seed }
        switch (p.kind) {
          case 'poster':
            return <Poster key={i} {...common} />
          case 'map':
            return <EvacMap key={i} {...common} />
          case 'drawing':
            return <Drawing key={i} {...common} />
          case 'tallies':
            return <Tallies key={i} {...common} />
          case 'gouges':
            return <Gouges key={i} {...common} />
          case 'stain':
            return <Stain key={i} {...common} />
          case 'door':
            return <DeadDoor key={i} position={p.position} rotY={p.rotY} />
        }
      })}
    </group>
  )
}
