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
  { center: [-18, 1, -36], half: [0.6, 1, 0.6], kind: 'closet' }, // branch dead end
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
