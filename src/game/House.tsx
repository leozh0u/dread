import { RigidBody, CuboidCollider } from '@react-three/rapier'
import { Clue } from './Clue'
import { HidingSpot } from './HidingSpot'
import { Clutter } from './Clutter'
import { ExitDoorLight } from './ExitDoor'
import { useThreat, CLUES_REQUIRED } from './threat'
import { CLUES, HIDING_SPOTS } from './triggers'

const WALL_H = 5
const WALL_COLOR = '#1a1a1a'
const FLOOR_COLOR = '#141414'

/** Wall segment running along Z at a fixed X (a "side" wall). */
function WallZ({ x, z1, z2, y = WALL_H / 2 }: { x: number; z1: number; z2: number; y?: number }) {
  const len = Math.abs(z2 - z1)
  const cz = (z1 + z2) / 2
  return (
    <mesh position={[x, y, cz]} receiveShadow>
      <boxGeometry args={[0.2, WALL_H, len]} />
      <meshStandardMaterial color={WALL_COLOR} />
    </mesh>
  )
}

/** Wall segment running along X at a fixed Z (an "end" wall). */
function WallX({ z, x1, x2, y = WALL_H / 2 }: { z: number; x1: number; x2: number; y?: number }) {
  const len = Math.abs(x2 - x1)
  const cx = (x1 + x2) / 2
  return (
    <mesh position={[cx, y, z]} receiveShadow>
      <boxGeometry args={[len, WALL_H, 0.2]} />
      <meshStandardMaterial color={WALL_COLOR} />
    </mesh>
  )
}

/**
 * The whole playable space, hand-laid-out rather than procedurally
 * generated — three small alcove rooms off a spine corridor (one clue +
 * one hiding spot each), a locked door, and a calm room at the far end.
 * Structural walls live in one RigidBody with auto "cuboid" colliders —
 * confirmed solid via direct physics-position sampling.
 *
 * Clue pickups, hiding spots and the calm room are NOT physics colliders
 * — see playerPosition.ts and triggers.ts for why (Rapier sensor events
 * never fired in extensive testing); they're checked by plain distance
 * math in useTriggersLoop against the single shared layout in triggers.ts.
 *
 *          +x
 *           |  [Room 1]  z 5..8
 *  corridor |==open==
 *   z:      |
 *  -18..16  |  [Room 2]  z -3..0   (-x side)
 *           |==open==
 *           |  [Room 3]  z -8..-11
 *  ---- ExitDoor @ z=-18 ----
 *  [Calm room]  z -18..-30
 */
export function House() {
  const collected = useThreat((s) => s.cluesCollected.size)
  const unlocked = collected >= CLUES_REQUIRED

  return (
    <>
      <RigidBody type="fixed" colliders="cuboid">
        {/* one floor slab under the whole level */}
        <mesh position={[0, -1, -5]} receiveShadow>
          <boxGeometry args={[16, 0.2, 50]} />
          <meshStandardMaterial color={FLOOR_COLOR} />
        </mesh>

        {/* +x corridor wall, gaps at room 1 (z 5-8) and room 3 (z -8..-11) */}
        <WallZ x={3} z1={8} z2={16} />
        <WallZ x={3} z1={-8} z2={5} />
        <WallZ x={3} z1={-18} z2={-11} />

        {/* -x corridor wall, gap at room 2 (z -3..0) */}
        <WallZ x={-3} z1={0} z2={16} />
        <WallZ x={-3} z1={-18} z2={-3} />

        {/* Room 1 (right, x 3..7, z 5..8) */}
        <WallX z={5} x1={3} x2={7} />
        <WallX z={8} x1={3} x2={7} />
        <WallZ x={7} z1={5} z2={8} />

        {/* Room 2 (left, x -3..-7, z -3..0) */}
        <WallX z={-3} x1={-7} x2={-3} />
        <WallX z={0} x1={-7} x2={-3} />
        <WallZ x={-7} z1={-3} z2={0} />

        {/* Room 3 (right, x 3..7, z -11..-8) */}
        <WallX z={-11} x1={3} x2={7} />
        <WallX z={-8} x1={3} x2={7} />
        <WallZ x={7} z1={-11} z2={-8} />

        {/* Calm room enclosure (z -30..-18, x -4..4) */}
        <WallZ x={-4} z1={-30} z2={-18} />
        <WallZ x={4} z1={-30} z2={-18} />
        <WallX z={-30} x1={-4} x2={4} />
      </RigidBody>

      {/* Exit door -- its own isolated RigidBody with colliders={false} and
          ONE explicit CuboidCollider, deliberately not mixed into the wall
          RigidBody above. This IS a real physics collider (unlike the
          sensors below) and is confirmed solid via direct testing:
          isolating it this way is what stopped the player from passing
          straight through. */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[2.8, 1.5, 0.2]} position={[0, 1.5, -18]} sensor={unlocked} />
        {!unlocked && (
          <mesh position={[0, 1.5, -18]}>
            <boxGeometry args={[5.6, 3, 0.4]} />
            <meshStandardMaterial color="#1a1010" />
          </mesh>
        )}
      </RigidBody>

      {CLUES.map((clue) => (
        <Clue key={clue.id} id={clue.id} position={clue.position} />
      ))}
      {HIDING_SPOTS.map((spot, i) => (
        <HidingSpot key={i} spot={spot} />
      ))}

      <ExitDoorLight position={[0, 1.5, -18]} />
      <Clutter />
    </>
  )
}
