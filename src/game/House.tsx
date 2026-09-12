import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { RigidBody, CuboidCollider } from '@react-three/rapier'
import { Clue } from './Clue'
import { HidingSpot } from './HidingSpot'
import { Clutter } from './Clutter'
import { Signage } from './Signage'
import { WallDressing } from './WallDressing'
import { Fluorescents } from './Fluorescents'
import { ExitDoorLight } from './ExitDoor'
import { useThreat, CLUES_REQUIRED } from './threat'
import { CLUES, HIDING_SPOTS } from './triggers'
import { buildCorridorWalls, buildJunctionCaps, type WallSpec } from './maze'

// Low, oppressive ceiling — Backrooms interiors are office-height, not
// cathedral-height, and the low ceiling is half of why they feel wrong.
const WALL_H = 3.2
const DOOR_Z = -48

// Mono-yellow: aged wallpaper over damp carpet. The whole palette is one
// sickly hue with small value shifts, which is what makes the space read
// as endless and same-y rather than as designed rooms.
const WALL_TINT = '#6f6540'
const WALL_TINT_ALT = '#665c39'
const FLOOR_TINT = '#4a3f28'
const CEILING_TINT = '#5d5638'

function Wall({ spec, tint = WALL_TINT }: { spec: WallSpec; tint?: string }) {
  const len = Math.abs(spec.to - spec.from)
  if (len <= 0.01) return null // a gap that consumed the whole run — nothing to draw
  const mid = (spec.from + spec.to) / 2
  const position: [number, number, number] =
    spec.axis === 'x' ? [spec.fixed, WALL_H / 2, mid] : [mid, WALL_H / 2, spec.fixed]
  const size: [number, number, number] = spec.axis === 'x' ? [0.2, WALL_H, len] : [len, WALL_H, 0.2]
  return (
    <mesh position={position} receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={tint} roughness={0.9} />
    </mesh>
  )
}

/** Wall segment running along X at a fixed Z — kept for the hand-placed
 * rooms/branch/exit stub, which aren't part of the graph generator. */
function WallX({ z, x1, x2, y = WALL_H / 2 }: { z: number; x1: number; x2: number; y?: number }) {
  const len = Math.abs(x2 - x1)
  const cx = (x1 + x2) / 2
  return (
    <mesh position={[cx, y, z]} receiveShadow>
      <boxGeometry args={[len, WALL_H, 0.2]} />
      <meshStandardMaterial color={WALL_TINT_ALT} roughness={0.95} />
    </mesh>
  )
}

function WallZ({ x, z1, z2, y = WALL_H / 2 }: { x: number; z1: number; z2: number; y?: number }) {
  const len = Math.abs(z2 - z1)
  const cz = (z1 + z2) / 2
  return (
    <mesh position={[x, y, cz]} receiveShadow>
      <boxGeometry args={[0.2, WALL_H, len]} />
      <meshStandardMaterial color={WALL_TINT_ALT} roughness={0.95} />
    </mesh>
  )
}

/**
 * The level, as a real maze: a graph of junctions and corridors (see
 * maze.ts) instead of one straight spine with alcoves off it. Real turns,
 * a loop the player can use to lose the monster (B <-> D has two routes),
 * dead ends, and four rooms + a branch hanging off specific corridors.
 * The monster (Monster.tsx) walks the loop + exit spur and can never
 * leave it, so every room here is genuinely safe ground, not just
 * implied to be.
 *
 * Structural walls (corridors + junction caps, from maze.ts's generator)
 * plus the hand-placed rooms/branch/exit all live in one shared RigidBody
 * with auto "cuboid" colliders — the pattern already confirmed solid via
 * direct physics-position sampling earlier in the project. The exit door
 * is its own isolated RigidBody (mixing it into the shared one silently
 * drops its collider — see commit history).
 */
/** Slow warm pulse deep in the calm-room passage — visible from the fork,
 * paced at roughly a resting breath so it reads as an invitation to slow
 * down rather than another alarm. */
function CalmBeacon() {
  const light = useRef<THREE.PointLight>(null!)
  useFrame(({ clock }) => {
    if (!light.current) return
    // ~10s cycle: the same pace as the breathing pacer asks for
    light.current.intensity = 16 + Math.sin(clock.elapsedTime * 0.63) * 9
  })
  return <pointLight ref={light} position={[2, 2, -58]} color="#4a9a86" intensity={16} distance={14} />
}

/**
 * One pooled light shared by all three fragments, moved to whichever
 * uncollected one is nearest.
 *
 * Each fragment used to carry its own point light. Dynamic lights are
 * the scarcest resource in this scene — every one of them is uniforms
 * and per-fragment cost, and piling them up is a good way to get a
 * shader that fails to link and a screen that goes black with no error.
 * You can only ever be near one fragment at a time, so one light does
 * the same job.
 */
function FragmentLight() {
  const light = useRef<THREE.PointLight>(null!)
  const collected = useThreat((s) => s.cluesCollected)

  useFrame(({ clock, camera }) => {
    if (!light.current) return
    let best: [number, number, number] | null = null
    let bestD = Infinity
    for (const c of CLUES) {
      if (collected.has(c.id)) continue
      const d = (c.position[0] - camera.position.x) ** 2 + (c.position[2] - camera.position.z) ** 2
      if (d < bestD) {
        bestD = d
        best = c.position
      }
    }
    if (!best) {
      light.current.intensity = 0
      return
    }
    light.current.position.set(best[0], best[1] - 0.3, best[2])
    const flicker = 0.55 + 0.45 * Math.abs(Math.sin(clock.elapsedTime * 2.3) * Math.sin(clock.elapsedTime * 0.7 + 1.1))
    light.current.intensity = 14 + flicker * 16
  })

  return <pointLight ref={light} color="#ffdf9a" intensity={18} distance={6} />
}

export function House() {
  const collected = useThreat((s) => s.cluesCollected.size)
  const unlocked = collected >= CLUES_REQUIRED
  const corridorWalls = buildCorridorWalls()
  const junctionCaps = buildJunctionCaps()

  return (
    <>
      <RigidBody type="fixed" colliders="cuboid">
        {/* one floor slab under the whole maze */}
        <mesh position={[2, -1, -17]} receiveShadow>
          <boxGeometry args={[52, 0.2, 106]} />
          <meshStandardMaterial color={FLOOR_TINT} roughness={1} />
        </mesh>

        {/* Ceiling — the level had none, which is a large part of why it
            read as a void rather than an interior. Low and close. */}
        <mesh position={[2, WALL_H, -17]} receiveShadow>
          <boxGeometry args={[52, 0.2, 106]} />
          <meshStandardMaterial color={CEILING_TINT} roughness={1} />
        </mesh>

        {corridorWalls.map((spec, i) => (
          <Wall key={`c${i}`} spec={spec} />
        ))}
        {junctionCaps.map((spec, i) => (
          <Wall key={`j${i}`} spec={spec} tint="#171717" />
        ))}

        {/* Room 1 (clue) — off A-B, far north-east */}
        <WallX z={21} x1={3} x2={8} />
        <WallX z={25} x1={3} x2={8} />
        <WallZ x={8} z1={21} z2={25} />

        {/* Room 2 (clue) — off F-G, far west */}
        <WallX z={-9} x1={-20} x2={-15} />
        <WallX z={-5} x1={-20} x2={-15} />
        <WallZ x={-20} z1={-9} z2={-5} />

        {/* Room 3 (clue) — off K-L, far south-east */}
        <WallX z={-37} x1={19} x2={24} />
        <WallX z={-33} x1={19} x2={24} />
        <WallZ x={24} z1={-37} z2={-33} />

        {/* Hiding alcove — off G-H */}
        <WallZ x={-8} z1={-21} z2={-17} />
        <WallZ x={-4} z1={-21} z2={-17} />
        <WallX z={-21} x1={-8} x2={-4} />

        {/* Branch dead end — off M-N, a passage nobody has to take */}
        <WallZ x={-20} z1={-38} z2={-34} />
        <WallZ x={-16} z1={-38} z2={-34} />
        <WallX z={-38} x1={-20} x2={-16} />

        {/* Short stub from junction O down to the exit door */}
        <WallZ x={-1} z1={DOOR_Z} z2={-45} />
        <WallZ x={5} z1={DOOR_Z} z2={-45} />

        {/* Beyond the door is a CHOICE, not a corridor. The exit to
            safety branches east; the calm room continues south. This
            matters: when the escape zone sat directly behind the door,
            stepping through it always fired the fast win instantly and
            the calm room could never be reached at all — which silently
            removed the biofeedback finale, i.e. the entire point of the
            project. Both endings have to be reachable to be a choice. */}
        <WallZ x={-1} z1={-68} z2={DOOR_Z} />
        <WallZ x={5} z1={-68} z2={-52} />
        <WallZ x={5} z1={-50} z2={DOOR_Z} />

        {/* East passage: the way out */}
        <WallX z={-50} x1={5} x2={11} />
        <WallX z={-52} x1={5} x2={11} />
        <WallZ x={11} z1={-52} z2={-50} />

        {/* Calm room, deeper south */}
        <WallX z={-68} x1={-1} x2={5} />
      </RigidBody>

      {/* Exit door — isolated RigidBody, one explicit CuboidCollider */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[2.8, 1.5, 0.2]} position={[2, 1.5, DOOR_Z]} sensor={unlocked} />
        {!unlocked && (
          <mesh position={[2, 1.5, DOOR_Z]}>
            <boxGeometry args={[5.6, 3, 0.4]} />
            <meshStandardMaterial color="#1a1010" />
          </mesh>
        )}
      </RigidBody>

      {/* The fork past the door has to read as a CHOICE. Cold daylight
          east = the way out; a slow warm pulse south = the calm room.
          Without this the lit exit is the only visible option and nobody
          ever finds the finale the whole project is built around. */}
      {unlocked && <pointLight position={[9, 2, -51]} color="#7a8fb0" intensity={45} distance={9} />}
      {unlocked && <CalmBeacon />}

      {CLUES.map((clue) => (
        <Clue key={clue.id} id={clue.id} position={clue.position} />
      ))}
      <FragmentLight />
      {HIDING_SPOTS.map((spot, i) => (
        <HidingSpot key={i} spot={spot} />
      ))}

      <ExitDoorLight position={[2, 1.5, DOOR_Z]} />
      <Fluorescents />
      <WallDressing />
      <Clutter />
      <Signage />
    </>
  )
}
