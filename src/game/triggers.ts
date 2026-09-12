/** Single source of truth for every trigger volume in the level — clue
 * pickups, hiding spots, the calm room. House.tsx renders from this data;
 * useTriggersLoop.ts checks the player's position against it. Kept in one
 * place so the visual and the logic can never drift apart. */

export interface ClueDef {
  id: string
  position: [number, number, number]
  radius: number
}

export interface BoxRegion {
  center: [number, number, number]
  half: [number, number, number]
}

export const CLUES: ClueDef[] = [
  { id: 'clue-1', position: [5, 0.5, 6.5], radius: 0.8 },
  { id: 'clue-2', position: [-5, 0.5, -1.5], radius: 0.8 },
  { id: 'clue-3', position: [5, 0.5, -9.5], radius: 0.8 },
]

export const HIDING_SPOTS: BoxRegion[] = [
  { center: [6, 1, 7], half: [0.6, 1, 0.6] },
  { center: [-6, 1, -1], half: [0.6, 1, 0.6] },
  { center: [6, 1, -9], half: [0.6, 1, 0.6] },
  { center: [0, 1, -14], half: [0.6, 1, 0.6] },
]

export const CALM_ROOM: BoxRegion = {
  center: [0, 1.5, -24],
  half: [3.5, 1.5, 5],
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
