import { FLOOR_TOP } from './geometry'
/** Single source of truth for every trigger volume in the level — clue
 * pickups, hiding spots, the calm room, the outside-the-door escape zone.
 * House.tsx renders from this data; useTriggersLoop.ts checks the
 * player's position against it. Kept in one place so the visual and the
 * logic can never drift apart.
 *
 * Coordinates match the maze graph in maze.ts — see that file for the
 * junction layout. Each clue/hiding room hangs off a specific corridor
 * edge (A-B, C-D, G-H, H-I); the exit door and calm room are beyond
 * junction I's south exit.
 */

export interface ClueDef {
  id: string
  position: [number, number, number]
  radius: number
  label: string // shown with the pickup counter so it reads as a real
  // objective, not an unlabeled shape — kept abstract on purpose (Leo
  // didn't want literal domestic objects like "a photograph")
}

export type HidingKind = 'closet' | 'curtain' | 'crate' | 'table'

export interface BoxRegion {
  center: [number, number, number]
  half: [number, number, number]
  kind?: HidingKind
}

export const CLUES: ClueDef[] = [
  { id: 'clue-1', position: [5.5, 0.5, 23], radius: 0.9, label: 'fragment' }, // NE room, off A-B
  { id: 'clue-2', position: [-17.5, 0.5, -7], radius: 0.9, label: 'fragment' }, // far west room, off F-G
  { id: 'clue-3', position: [21.5, 0.5, -35], radius: 0.9, label: 'fragment' }, // far SE room, off K-L
]

export const HIDING_SPOTS: BoxRegion[] = [
  { center: [7, 1, 23], half: [0.6, 1, 0.6], kind: 'closet' },
  { center: [-19, 1, -7], half: [0.7, 1, 0.5], kind: 'curtain' },
  { center: [23, 1, -35], half: [0.6, 0.9, 0.6], kind: 'crate' },
  { center: [-6, 0.7, -19], half: [0.9, 0.55, 0.6], kind: 'table' }, // alcove off G-H
  { center: [-19.5, 1, -36], half: [0.6, 1, 0.6], kind: 'closet' }, // branch dead end
]

/** Beyond the unlocked door — reaching here is win condition #1, "escape,"
 * distinct from the calm room's slower "regulate yourself" win. */
export const OUTSIDE: BoxRegion = {
  center: [8, 1.5, -51],
  half: [2.5, 1.5, 0.9],
}

export const CALM_ROOM: BoxRegion = {
  center: [2, 1.5, -61],
  half: [2.8, 1.5, 6.5],
}

/**
 * Horizontal distance, ignoring height. Used for pickups.
 *
 * WHY PICKUPS ARE NOT 3D. A fragment sits at y=0.5 and the player's
 * tracked position is their capsule centre at about y=-0.15, so there is
 * a permanent 0.65 of vertical separation that has nothing to do with
 * whether the player is standing on the thing. Measured in 3D against a
 * radius of 0.9 that left an effective pickup radius of 0.62 metres
 * horizontally — you could walk up to a fragment in a dark maze, be close
 * enough to touch it, and not collect it, with no feedback explaining why.
 * An automated playthrough walked to within 0.7 of all three and collected
 * none of them.
 *
 * The level is a single storey, so horizontal distance is the honest
 * model. The caller still bounds the height separately, so this does not
 * quietly become a pickup that works through a ceiling.
 */
export function distanceXZ(
  a: [number, number, number] | { x: number; y: number; z: number },
  b: [number, number, number],
) {
  const ax = Array.isArray(a) ? a[0] : a.x
  const az = Array.isArray(a) ? a[2] : a.z
  return Math.hypot(ax - b[0], az - b[2])
}

/** Vertical separation, for keeping a pickup on its own floor. */
export function heightGap(
  a: [number, number, number] | { x: number; y: number; z: number },
  b: [number, number, number],
) {
  const ay = Array.isArray(a) ? a[1] : a.y
  return Math.abs(ay - b[1])
}

export function distance3(
  a: [number, number, number] | { x: number; y: number; z: number },
  b: [number, number, number],
) {
  const ax = Array.isArray(a) ? a[0] : a.x
  const ay = Array.isArray(a) ? a[1] : a.y
  const az = Array.isArray(a) ? a[2] : a.z
  const dx = ax - b[0]
  const dy = ay - b[1]
  const dz = az - b[2]
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

/**
 * Inside a region's FOOTPRINT, at a height the player could plausibly be.
 *
 * THIS IS WHY THE GAME COULD NOT BE FINISHED. Every region here was
 * authored with its vertical centre at y=1 or y=1.5 and a half-height of
 * 1 or 1.5, so each spans roughly y ∈ [0, 3] — correct back when the floor
 * was at y=0. The floor is at -0.9 now, and the player's tracked position
 * is their capsule centre, which sits at FLOOR_TOP + PLAYER_HALF_H =
 * -0.15. That is BELOW every one of those boxes, by 0.15 of a metre.
 *
 * The effect was total rather than partial: `insideBox` could never return
 * true for a standing player. You could collect all three fragments, open
 * the door, walk through it and out the other side, and nothing would
 * happen — and hiding, the entire stealth skill the game teaches, never
 * registered either. Both endings and the core mechanic were unreachable.
 *
 * It survived because the one test that walks a player through these
 * regions placed them at y=0.5, which is the height the FRAGMENTS sit at
 * and a height the running game never puts them at. Feeding a system
 * numbers it does not produce confirms whatever you already believed.
 *
 * The fix is a footprint test with the height bounded separately and
 * generously, rather than a box the player has to be vertically centred
 * in. The level is a single storey; what matters is whether they are
 * standing in the doorway, not whether their midpoint is at a particular
 * elevation. The band runs from below the floor to well above a jump, so
 * it stays correct whether they are walking, jumping, or mid-landing —
 * and, unlike the boxes, it does not silently break the next time a floor
 * height changes.
 *
 * It also decouples the trigger from the prop. HIDING_SPOTS' half-height
 * is what HidingSpot.tsx draws the wardrobe and crate at, so widening the
 * boxes vertically to fix the trigger would have made every hiding prop
 * in the game twice as tall.
 */
const TRIGGER_Y_MIN = FLOOR_TOP - 0.5
const TRIGGER_Y_MAX = FLOOR_TOP + 4

export function insideColumn(p: { x: number; y: number; z: number }, box: BoxRegion) {
  return (
    Math.abs(p.x - box.center[0]) <= box.half[0] &&
    Math.abs(p.z - box.center[2]) <= box.half[2] &&
    p.y >= TRIGGER_Y_MIN &&
    p.y <= TRIGGER_Y_MAX
  )
}

/** Strict three-axis containment. Kept for anything that genuinely cares
 * about height; the gameplay regions above deliberately do not. */
export function insideBox(p: { x: number; y: number; z: number }, box: BoxRegion) {
  return (
    Math.abs(p.x - box.center[0]) <= box.half[0] &&
    Math.abs(p.y - box.center[1]) <= box.half[1] &&
    Math.abs(p.z - box.center[2]) <= box.half[2]
  )
}
