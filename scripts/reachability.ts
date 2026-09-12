/**
 * Proves the level is completable, without needing to render it.
 *
 * "The route looks geometrically unobstructed" was the previous standard
 * of evidence, and it is not evidence — it is me reading coordinates and
 * believing myself. This builds the REAL collision geometry (the same
 * maze.ts walls House.tsx renders, plus every hand-placed room wall), and
 * flood-fills from the spawn at the player's actual capsule radius. If a
 * fragment, the door, the exit or the calm room is not in the filled set,
 * the level cannot be finished and this fails loudly.
 */
import { buildCorridorWalls, buildJunctionCaps, type WallSpec } from '../src/game/maze'
import { CLUES, OUTSIDE, CALM_ROOM, HIDING_SPOTS } from '../src/game/triggers'

const WALL_HALF_T = 0.1 // walls are 0.2 thick
const PLAYER_R = 0.35 // CapsuleCollider args={[0.4, 0.35]}
const DOOR_Z = -48
const CELL = 0.25

const wx = (z: number, x1: number, x2: number): WallSpec => ({ axis: 'z', fixed: z, from: x1, to: x2 })
const wz = (x: number, z1: number, z2: number): WallSpec => ({ axis: 'x', fixed: x, from: z1, to: z2 })

// Mirrors House.tsx exactly.
const handPlaced: WallSpec[] = [
  wx(21, 3, 8), wx(25, 3, 8), wz(8, 21, 25),              // room 1
  wx(-9, -20, -15), wx(-5, -20, -15), wz(-20, -9, -5),    // room 2
  wx(-37, 19, 24), wx(-33, 19, 24), wz(24, -37, -33),     // room 3
  wz(-8, -21, -17), wz(-4, -21, -17), wx(-21, -8, -4),    // hiding alcove
  wz(-22, -38, -34), wx(-38, -22, -17), wx(-34, -22, -17),// branch dead end
  wz(-1, DOOR_Z, -45), wz(5, DOOR_Z, -45),                // approach to door
  wz(-1, -68, DOOR_Z), wz(5, -68, -52), wz(5, -50, DOOR_Z),// past door
  wx(-50, 5, 11), wx(-52, 5, 11), wz(11, -52, -50),        // exit fork east
  wx(-68, -1, 5),                                          // calm room end cap
]

function run(doorOpen: boolean) {
  const walls = [...buildCorridorWalls(), ...buildJunctionCaps(), ...handPlaced]
  if (!doorOpen) walls.push(wx(DOOR_Z, 2 - 2.8, 2 + 2.8)) // locked door slab

  const MINX = -30, MAXX = 30, MINZ = -75, MAXZ = 35
  const NX = Math.round((MAXX - MINX) / CELL)
  const NZ = Math.round((MAXZ - MINZ) / CELL)
  const blocked = new Uint8Array(NX * NZ)
  const idx = (i: number, j: number) => j * NX + i

  // A cell is blocked if its centre is within (wall half-thickness +
  // player radius) of any wall segment — i.e. the capsule would overlap.
  const pad = WALL_HALF_T + PLAYER_R
  for (const w of walls) {
    const lo = Math.min(w.from, w.to), hi = Math.max(w.from, w.to)
    if (w.axis === 'x') {
      // fixed x, spans z
      for (let i = 0; i < NX; i++) {
        const x = MINX + (i + 0.5) * CELL
        if (Math.abs(x - w.fixed) > pad) continue
        for (let j = 0; j < NZ; j++) {
          const z = MINZ + (j + 0.5) * CELL
          if (z >= lo - pad && z <= hi + pad) blocked[idx(i, j)] = 1
        }
      }
    } else {
      for (let j = 0; j < NZ; j++) {
        const z = MINZ + (j + 0.5) * CELL
        if (Math.abs(z - w.fixed) > pad) continue
        for (let i = 0; i < NX; i++) {
          const x = MINX + (i + 0.5) * CELL
          if (x >= lo - pad && x <= hi + pad) blocked[idx(i, j)] = 1
        }
      }
    }
  }

  // Flood fill from spawn (junction A nook, where the player starts).
  const SPAWN: [number, number] = [0, 30]
  const si = Math.floor((SPAWN[0] - MINX) / CELL)
  const sj = Math.floor((SPAWN[1] - MINZ) / CELL)
  const seen = new Uint8Array(NX * NZ)
  if (blocked[idx(si, sj)]) throw new Error('SPAWN IS INSIDE A WALL')
  const q = [idx(si, sj)]
  seen[q[0]] = 1
  while (q.length) {
    const c = q.pop()!
    const i = c % NX, j = (c - (c % NX)) / NX
    for (const [di, dj] of [[1,0],[-1,0],[0,1],[0,-1]] as const) {
      const ni = i + di, nj = j + dj
      if (ni < 0 || nj < 0 || ni >= NX || nj >= NZ) continue
      const n = idx(ni, nj)
      if (seen[n] || blocked[n]) continue
      seen[n] = 1
      q.push(n)
    }
  }

  const reachable = (x: number, z: number) => {
    const i = Math.floor((x - MINX) / CELL), j = Math.floor((z - MINZ) / CELL)
    if (i < 0 || j < 0 || i >= NX || j >= NZ) return false
    return !!seen[idx(i, j)]
  }
  // Containment: a gap cut in the wrong wall doesn't just seal a room, it
  // opens a hole into the empty space between corridors. The player walks
  // out of the level into black nothing — which is exactly the "you can
  // always get in and out of areas" bug, in its worst form.
  let escaped = 0
  for (let i = 0; i < NX; i++) {
    for (let j = 0; j < NZ; j++) {
      if (!seen[idx(i, j)]) continue
      if (i === 0 || j === 0 || i === NX - 1 || j === NZ - 1) escaped++
    }
  }
  return { reachable, open: seen.reduce((a, b) => a + b, 0), escaped }
}

let failures = 0
const check = (label: string, ok: boolean) => {
  console.log(`${ok ? '  ok  ' : '  FAIL'}  ${label}`)
  if (!ok) failures++
}

console.log('\n--- door LOCKED (the whole run before the door opens) ---')
{
  const { reachable, open, escaped } = run(false)
  console.log(`  ${open} walkable cells reachable from spawn`)
  check('level is sealed (player cannot walk into the void)', escaped === 0)
  // Spot-check the dead space between corridors, which is what a
  // misplaced room opening leaks into.
  check('void at (-8,-8) unreachable', !reachable(-8, -8))
  check('void at (-20,-20) unreachable', !reachable(-20, -20))
  check('void at (8,-20) unreachable', !reachable(8, -20))
  for (const c of CLUES) check(`${c.id} reachable`, reachable(c.position[0], c.position[2]))
  for (const [n, h] of HIDING_SPOTS.entries())
    check(`hiding spot ${n} reachable`, reachable(h.center[0], h.center[2]))
  check('door face reachable', reachable(2, DOOR_Z + 1.2))
  check('OUTSIDE is NOT reachable while locked', !reachable(OUTSIDE.center[0], OUTSIDE.center[2]))
  check('CALM_ROOM is NOT reachable while locked', !reachable(CALM_ROOM.center[0], CALM_ROOM.center[2]))
}

console.log('\n--- door UNLOCKED (endgame) ---')
{
  const { reachable } = run(true)
  check('OUTSIDE (escape ending) reachable', reachable(OUTSIDE.center[0], OUTSIDE.center[2]))
  check('CALM_ROOM (biofeedback ending) reachable', reachable(CALM_ROOM.center[0], CALM_ROOM.center[2]))
  check('calm room far end reachable', reachable(CALM_ROOM.center[0], CALM_ROOM.center[2] - 5))
  // The fork must be a real choice: you must be able to get deep into the
  // calm room WITHOUT clipping the OUTSIDE box on the way, or the fast
  // ending always fires first and the finale is unreachable.
  let hits = 0
  for (let z = DOOR_Z - 1; z > -68; z -= 0.25) {
    if (Math.abs(2 - OUTSIDE.center[0]) <= OUTSIDE.half[0] &&
        Math.abs(z - OUTSIDE.center[2]) <= OUTSIDE.half[2]) hits++
  }
  check('southern route never clips OUTSIDE', hits === 0)
}

console.log(failures ? `\n${failures} FAILURE(S)\n` : '\nAll reachability checks passed\n')
process.exit(failures ? 1 : 0)
