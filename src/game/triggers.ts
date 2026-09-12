/** Single source of truth for every trigger volume in the level — clue
 * pickups, hiding spots, the calm room, the outside-the-door escape zone.
 * House.tsx renders from this data; useTriggersLoop.ts checks the
 * player's position against it. Kept in one place so the visual and the
 * logic can never drift apart.
 *
 * Map layout (bigger than the original 3-room build — see PROGRESS.md):
 * spine corridor x=0 from z=18 (spawn) to z=-20 (exit door), four alcove
 * rooms alternating sides, calm room beyond the door z=-20..-34.
 */

export interface ClueDef {
  id: string
  position: [number, number, number]
  radius: number
  label: string // what the player sees when they pick it up — these are
  // story objects, not unlabeled "crystals."
}

export type HidingKind = 'closet' | 'curtain' | 'crate' | 'table'

export interface BoxRegion {
  center: [number, number, number]
  half: [number, number, number]
  kind?: HidingKind
}

export const CLUES: ClueDef[] = [
  { id: 'clue-1', position: [5.5, 0.5, 14], radius: 0.9, label: "a child's photograph" },
  { id: 'clue-2', position: [-5.5, 0.5, 6], radius: 0.9, label: 'a torn journal page' },
  { id: 'clue-3', position: [5.5, 0.5, -2], radius: 0.9, label: 'a rusted house key' },
]

export const HIDING_SPOTS: BoxRegion[] = [
  { center: [7, 1, 14], half: [0.6, 1, 0.6], kind: 'closet' },
  { center: [-7, 1, 6], half: [0.7, 1, 0.5], kind: 'curtain' },
  { center: [7, 1, -2], half: [0.6, 0.9, 0.6], kind: 'crate' },
  { center: [-6.5, 1, -10], half: [0.9, 1, 0.6], kind: 'closet' },
  { center: [0, 0.7, -16], half: [0.9, 0.55, 0.6], kind: 'table' },
]

/** Beyond the unlocked door — reaching here is win condition #1, "escape,"
 * distinct from the calm room's slower "regulate yourself" win. */
export const OUTSIDE: BoxRegion = {
  center: [0, 1.5, -21.5],
  half: [2.8, 1.5, 1.2],
}

export const CALM_ROOM: BoxRegion = {
  center: [0, 1.5, -27],
  half: [3.5, 1.5, 6.5],
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

export function insideBox(p: { x: number; y: number; z: number }, box: BoxRegion) {
  return (
    Math.abs(p.x - box.center[0]) <= box.half[0] &&
    Math.abs(p.y - box.center[1]) <= box.half[1] &&
    Math.abs(p.z - box.center[2]) <= box.half[2]
  )
}
