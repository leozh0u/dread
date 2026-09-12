import { buildCorridorWalls, buildJunctionCaps, type WallSpec } from './maze'

/**
 * Every wall in the level, in one place.
 *
 * The graph-generated corridors came from maze.ts, but the rooms, the
 * branch and the exit run were hand-placed JSX inside House.tsx — which
 * meant anything else that needed to know where the walls are (the
 * reachability test, and now monster navigation) had to keep its own copy
 * of that list. Two copies of a level's collision geometry is how you get
 * a monster that walks through a wall nobody can walk through.
 *
 * DOOR_Z lives here too, since both the renderer and the navigator need
 * to agree on where the exit is.
 */
export const DOOR_Z = -48

const wx = (z: number, x1: number, x2: number): WallSpec => ({ axis: 'z', fixed: z, from: x1, to: x2 })
const wz = (x: number, z1: number, z2: number): WallSpec => ({ axis: 'x', fixed: x, from: z1, to: z2 })

/** Rooms, hiding alcove, branch dead end, and the run out to the exit. */
export const HAND_PLACED_WALLS: WallSpec[] = [
  // Room 1 (clue) — off A-B, far north-east
  wx(21, 3, 8), wx(25, 3, 8), wz(8, 21, 25),
  // Room 2 (clue) — off F-G, far west
  wx(-9, -20, -15), wx(-5, -20, -15), wz(-20, -9, -5),
  // Room 3 (clue) — off K-L, far south-east
  wx(-37, 19, 24), wx(-33, 19, 24), wz(24, -37, -33),
  // Hiding alcove off G-H
  wz(-8, -21, -17), wz(-4, -21, -17), wx(-21, -8, -4),
  // Branch dead end off M-N
  wz(-22, -38, -34), wx(-38, -22, -17), wx(-34, -22, -17),
  // Approach to the door
  wz(-1, DOOR_Z, -45), wz(5, DOOR_Z, -45),
  // Past the door: the fork
  wz(-1, -68, DOOR_Z), wz(5, -68, -52), wz(5, -50, DOOR_Z),
  // Exit spur east
  wx(-50, 5, 11), wx(-52, 5, 11), wz(11, -52, -50),
  // Calm room end cap
  wx(-68, -1, 5),
]

/** The locked exit door, as a wall. */
export const DOOR_WALL: WallSpec = wx(DOOR_Z, -0.8, 4.8)

/**
 * Everything solid. `withDoor` closes the exit — true for monster
 * navigation (they must never follow you past the door into the endgame)
 * and for testing the level before it unlocks.
 */
export function allWalls(withDoor = false): WallSpec[] {
  const walls = [...buildCorridorWalls(), ...buildJunctionCaps(), ...HAND_PLACED_WALLS]
  if (withDoor) walls.push(DOOR_WALL)
  return walls
}
