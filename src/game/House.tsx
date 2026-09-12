import { RigidBody, CuboidCollider } from '@react-three/rapier'
import { Clue } from './Clue'
import { HidingSpot } from './HidingSpot'
import { Clutter } from './Clutter'
import { Signage } from './Signage'
import { ExitDoorLight } from './ExitDoor'
import { useThreat, CLUES_REQUIRED } from './threat'
import { CLUES, HIDING_SPOTS } from './triggers'

const WALL_H = 5
const DOOR_Z = -20

/** Wall segment running along Z at a fixed X (a "side" wall). Slight per-
 * segment color variation (via `tint`) so the corridor doesn't read as one
 * flat repeated material. */
function WallZ({
  x,
  z1,
  z2,
  y = WALL_H / 2,
  tint = '#1a1a1a',
}: {
  x: number
  z1: number
  z2: number
  y?: number
  tint?: string
}) {
  const len = Math.abs(z2 - z1)
  const cz = (z1 + z2) / 2
  return (
    <mesh position={[x, y, cz]} receiveShadow>
      <boxGeometry args={[0.2, WALL_H, len]} />
      <meshStandardMaterial color={tint} roughness={0.9} />
    </mesh>
  )
}

/** Wall segment running along X at a fixed Z (an "end" wall). */
function WallX({
  z,
  x1,
  x2,
  y = WALL_H / 2,
  tint = '#1a1a1a',
}: {
  z: number
  x1: number
  x2: number
  y?: number
  tint?: string
}) {
  const len = Math.abs(x2 - x1)
  const cx = (x1 + x2) / 2
  return (
    <mesh position={[cx, y, z]} receiveShadow>
      <boxGeometry args={[len, WALL_H, 0.2]} />
      <meshStandardMaterial color={tint} roughness={0.9} />
    </mesh>
  )
}

/**
 * The whole playable space — a longer spine corridor with four alcove
 * rooms (was three, tighter), a locked door, and a calm room beyond it.
 * Bigger than the original build end to end: corridor spawn-to-door is
 * 38 units (was 34), calm room is 14 deep (was 12). Structural walls
 * live in one RigidBody with auto "cuboid" colliders — confirmed solid
 * via direct physics-position sampling. The player's collider is now an
 * explicit CapsuleCollider (see Player.tsx) matching its visual capsule,
 * which fixed a real corner-clipping/wall-phasing bug the previous
 * bounding-sphere ("ball") auto-collider had.
 *
 * Clue pickups, hiding spots, the calm room, and the outside-the-door
 * escape zone are NOT physics colliders — see playerPosition.ts and
 * triggers.ts for why (Rapier sensor events never fired in extensive
 * testing); they're checked by plain distance math in useTriggersLoop
 * against the single shared layout in triggers.ts.
 *
 *           +x
 *            |  [Room A]  z 12..16          (clue 1, closet)
 *  corridor  |==open==
 *   z:       |
 *  -20..20   |  [Room B]  z 4..8   (-x side) (clue 2, curtain)
 *            |==open==
 *            |  [Room C]  z -4..0            (clue 3, crate)
 *            |==open==
 *            |  [Room D]  z -8..-12 (-x side) (empty — just space, a
 *            |            second closet to hide in)
 *  ---- ExitDoor @ z=-20, OUTSIDE zone just beyond it ----
 *  [Calm room]  z -20..-34
 */
export function House() {
  const collected = useThreat((s) => s.cluesCollected.size)
  const unlocked = collected >= CLUES_REQUIRED

  return (
    <>
      <RigidBody type="fixed" colliders="cuboid">
        {/* one floor slab under the whole level */}
        <mesh position={[0, -1, -7]} receiveShadow>
          <boxGeometry args={[18, 0.2, 60]} />
          <meshStandardMaterial color="#141414" />
        </mesh>

        {/* +x corridor wall, gaps at Room A (12..16) and Room C (-4..0) */}
        <WallZ x={3} z1={16} z2={20} tint="#1c1a17" />
        <WallZ x={3} z1={0} z2={12} tint="#191919" />
        <WallZ x={3} z1={-20} z2={-4} tint="#171a1c" />

        {/* -x corridor wall, gaps at Room B (4..8) and Room D (-8..-12) */}
        <WallZ x={-3} z1={8} z2={20} tint="#1a1a1c" />
        <WallZ x={-3} z1={-8} z2={4} tint="#1c1917" />
        <WallZ x={-3} z1={-20} z2={-12} tint="#191a1a" />

        {/* Room A (right, x 3..8, z 12..16) */}
        <WallX z={12} x1={3} x2={8} />
        <WallX z={16} x1={3} x2={8} />
        <WallZ x={8} z1={12} z2={16} />

        {/* Room B (left, x -8..-3, z 4..8) */}
        <WallX z={4} x1={-8} x2={-3} />
        <WallX z={8} x1={-8} x2={-3} />
        <WallZ x={-8} z1={4} z2={8} />

        {/* Room C (right, x 3..8, z -4..0) */}
        <WallX z={-4} x1={3} x2={8} />
        <WallX z={0} x1={3} x2={8} />
        <WallZ x={8} z1={-4} z2={0} />

        {/* Room D (left, x -8..-3, z -8..-12) */}
        <WallX z={-8} x1={-8} x2={-3} />
        <WallX z={-12} x1={-8} x2={-3} />
        <WallZ x={-8} z1={-12} z2={-8} />

        {/* Calm room enclosure (z -34..-20, x -4..4) */}
        <WallZ x={-4} z1={-34} z2={-20} tint="#12181a" />
        <WallZ x={4} z1={-34} z2={-20} tint="#12181a" />
        <WallX z={-34} x1={-4} x2={4} tint="#0f1416" />
      </RigidBody>

      {/* Exit door -- its own isolated RigidBody with colliders={false} and
          ONE explicit CuboidCollider, deliberately not mixed into the wall
          RigidBody above (mixing an auto-cuboid RigidBody with an explicit
          child collider silently dropped the explicit one — see commit
          history). Confirmed solid via direct physics-position sampling. */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[2.8, 1.5, 0.2]} position={[0, 1.5, DOOR_Z]} sensor={unlocked} />
        {!unlocked && (
          <mesh position={[0, 1.5, DOOR_Z]}>
            <boxGeometry args={[5.6, 3, 0.4]} />
            <meshStandardMaterial color="#1a1010" />
          </mesh>
        )}
      </RigidBody>

      {/* A hint of exterior light beyond the door once it's open — sells
          "there is an outside" as a real, reachable place, not a bluff. */}
      {unlocked && (
        <pointLight position={[0, 2, DOOR_Z - 3]} color="#7a8fb0" intensity={40} distance={8} />
      )}

      {CLUES.map((clue) => (
        <Clue key={clue.id} id={clue.id} position={clue.position} label={clue.label} />
      ))}
      {HIDING_SPOTS.map((spot, i) => (
        <HidingSpot key={i} spot={spot} />
      ))}

      <ExitDoorLight position={[0, 1.5, DOOR_Z]} />
      <Clutter />
      <Signage />
    </>
  )
}
