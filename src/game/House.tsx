import { RigidBody, CuboidCollider } from '@react-three/rapier'
import { Clue } from './Clue'
import { HidingSpot } from './HidingSpot'
import { Clutter } from './Clutter'
import { Signage } from './Signage'
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
export function House() {
  const collected = useThreat((s) => s.cluesCollected.size)
  const unlocked = collected >= CLUES_REQUIRED
  const corridorWalls = buildCorridorWalls()
  const junctionCaps = buildJunctionCaps()

  return (
    <>
      <RigidBody type="fixed" colliders="cuboid">
        {/* one floor slab under the whole maze */}
        <mesh position={[2, -1, -16]} receiveShadow>
          <boxGeometry args={[52, 0.2, 104]} />
          <meshStandardMaterial color={FLOOR_TINT} roughness={1} />
        </mesh>

        {/* Ceiling — the level had none, which is a large part of why it
            read as a void rather than an interior. Low and close. */}
        <mesh position={[2, WALL_H, -16]} receiveShadow>
          <boxGeometry args={[52, 0.2, 104]} />
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

        {/* Beyond the door: a short "outside" foyer (the fast escape —
            reaching this counts as win condition #1) then the calm room
            enclosure deeper in (win condition #2, the slower one). */}
        <WallZ x={-1} z1={-65} z2={DOOR_Z} />
        <WallZ x={5} z1={-65} z2={DOOR_Z} />
        <WallX z={-65} x1={-1} x2={5} />
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

      {unlocked && <pointLight position={[2, 2, DOOR_Z - 3]} color="#7a8fb0" intensity={40} distance={8} />}

      {CLUES.map((clue) => (
        <Clue key={clue.id} id={clue.id} position={clue.position} />
      ))}
      {HIDING_SPOTS.map((spot, i) => (
        <HidingSpot key={i} spot={spot} />
      ))}

      <ExitDoorLight position={[2, 1.5, DOOR_Z]} />
      <Fluorescents />
      <Clutter />
      <Signage />
    </>
  )
}
