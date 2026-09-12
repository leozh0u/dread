/**
 * Plays the game, without a GPU.
 *
 * scripts/reachability.ts proves the level's geometry connects. This goes
 * further: it walks a player along a REAL path through that geometry —
 * BFS through the same collision grid, so every step is somewhere a body
 * with the player's capsule could actually stand — and drives the real
 * tickTriggers() on the way. That covers the thing nobody has ever done:
 * collect all three fragments, unlock the door, and reach each of the two
 * endings.
 *
 * What it deliberately does NOT prove: how it feels, whether the monster
 * corners you unfairly, whether the audio lands. Those need a human. This
 * proves the run is not impossible, which is the part that would be
 * catastrophic to discover while filming.
 */
import { buildCorridorWalls, buildJunctionCaps, type WallSpec } from '../src/game/maze'
import { CLUES, OUTSIDE, CALM_ROOM, HIDING_SPOTS } from '../src/game/triggers'
import { usePlayerPosition } from '../src/game/playerPosition'
import { useThreat, CLUES_REQUIRED } from '../src/game/threat'
import { useSession } from '../src/game/session'
import { useCalmRoom } from '../src/game/calmRoom'
import { tickTriggers } from '../src/game/useTriggersLoop'

const WALL_HALF_T = 0.1
const PLAYER_R = 0.35
const DOOR_Z = -48
const CELL = 0.25
const MINX = -30, MAXX = 30, MINZ = -75, MAXZ = 35
const NX = Math.round((MAXX - MINX) / CELL)
const NZ = Math.round((MAXZ - MINZ) / CELL)

const wx = (z: number, x1: number, x2: number): WallSpec => ({ axis: 'z', fixed: z, from: x1, to: x2 })
const wz = (x: number, z1: number, z2: number): WallSpec => ({ axis: 'x', fixed: x, from: z1, to: z2 })

const handPlaced: WallSpec[] = [
  wx(21, 3, 8), wx(25, 3, 8), wz(8, 21, 25),
  wx(-9, -20, -15), wx(-5, -20, -15), wz(-20, -9, -5),
  wx(-37, 19, 24), wx(-33, 19, 24), wz(24, -37, -33),
  wz(-8, -21, -17), wz(-4, -21, -17), wx(-21, -8, -4),
  wz(-22, -38, -34), wx(-38, -22, -17), wx(-34, -22, -17),
  wz(-1, DOOR_Z, -45), wz(5, DOOR_Z, -45),
  wz(-1, -68, DOOR_Z), wz(5, -68, -52), wz(5, -50, DOOR_Z),
  wx(-50, 5, 11), wx(-52, 5, 11), wz(11, -52, -50),
  wx(-68, -1, 5),
]

function buildGrid(doorOpen: boolean) {
  const walls = [...buildCorridorWalls(), ...buildJunctionCaps(), ...handPlaced]
  if (!doorOpen) walls.push(wx(DOOR_Z, -0.8, 4.8))
  const blocked = new Uint8Array(NX * NZ)
  const pad = WALL_HALF_T + PLAYER_R
  for (const w of walls) {
    const lo = Math.min(w.from, w.to), hi = Math.max(w.from, w.to)
    for (let i = 0; i < NX; i++) {
      const x = MINX + (i + 0.5) * CELL
      for (let j = 0; j < NZ; j++) {
        const z = MINZ + (j + 0.5) * CELL
        const hit = w.axis === 'x'
          ? Math.abs(x - w.fixed) <= pad && z >= lo - pad && z <= hi + pad
          : Math.abs(z - w.fixed) <= pad && x >= lo - pad && x <= hi + pad
        if (hit) blocked[j * NX + i] = 1
      }
    }
  }
  return blocked
}

const toCell = (x: number, z: number) =>
  [Math.floor((x - MINX) / CELL), Math.floor((z - MINZ) / CELL)] as const
const toWorld = (i: number, j: number) =>
  [MINX + (i + 0.5) * CELL, MINZ + (j + 0.5) * CELL] as const

/** Shortest walkable path between two world points, or null. */
function findPath(blocked: Uint8Array, from: [number, number], to: [number, number]) {
  const [si, sj] = toCell(from[0], from[1])
  const [ti, tj] = toCell(to[0], to[1])
  const start = sj * NX + si, goal = tj * NX + ti
  if (blocked[start] || blocked[goal]) return null
  const prev = new Int32Array(NX * NZ).fill(-1)
  prev[start] = start
  const q = [start]
  for (let head = 0; head < q.length; head++) {
    const c = q[head]
    if (c === goal) break
    const i = c % NX, j = (c - (c % NX)) / NX
    for (const [di, dj] of [[1,0],[-1,0],[0,1],[0,-1]] as const) {
      const ni = i + di, nj = j + dj
      if (ni < 0 || nj < 0 || ni >= NX || nj >= NZ) continue
      const n = nj * NX + ni
      if (prev[n] !== -1 || blocked[n]) continue
      prev[n] = c
      q.push(n)
    }
  }
  if (prev[goal] === -1) return null
  const path: [number, number][] = []
  for (let c = goal; c !== start; c = prev[c]) {
    const i = c % NX, j = (c - (c % NX)) / NX
    const [x, z] = toWorld(i, j)
    path.push([x, z])
  }
  path.reverse()
  return path
}

let failures = 0
const check = (label: string, ok: boolean) => {
  console.log(`${ok ? '  ok  ' : '  FAIL'}  ${label}`)
  if (!ok) failures++
}

/**
 * The player's REAL tracked height: the centre of their capsule, which
 * Player.tsx writes to the position store every frame.
 *
 * This used to be 0.5, which is the height the FRAGMENTS sit at — so the
 * test walked the player through each pickup at exactly the pickup's own
 * elevation, a thing that never happens in the running game. That made
 * the vertical component of the distance check zero here and 0.65 in
 * reality, and the pickup radius is 0.9: the test was measuring a
 * 0.9-metre sphere while the game had an effective radius of 0.62 metres
 * horizontally.
 *
 * The consequence was not theoretical. An automated playthrough in a real
 * browser walked to within 0.7 of all three fragments and collected none
 * of them, while this test reported every pickup working. A test that
 * feeds the system numbers the system never produces will confirm whatever
 * you already believe.
 */
const PLAYER_TRACKED_Y = -0.15

/** Walk the player along a path, ticking triggers exactly as the game does. */
function walk(path: [number, number][]) {
  for (const [x, z] of path) {
    usePlayerPosition.setState({ x, y: PLAYER_TRACKED_Y, z })
    tickTriggers()
  }
}

function reset() {
  useThreat.getState().reset()
  useSession.setState({ status: 'calibrating', startedAt: null })
  useCalmRoom.setState({ inCalmRoom: false })
  usePlayerPosition.setState({ x: 0, y: PLAYER_TRACKED_Y, z: 30 })
}

console.log('\n=== RUN 1: collect all fragments, escape through the door ===')
reset()
useSession.getState().start()
{
  const locked = buildGrid(false)
  let at: [number, number] = [0, 30]
  for (const clue of CLUES) {
    const target: [number, number] = [clue.position[0], clue.position[2]]
    const path = findPath(locked, at, target)
    check(`path exists to ${clue.id}`, !!path)
    if (!path) continue
    walk(path)
    at = target
    check(`${clue.id} collected on arrival`, useThreat.getState().cluesCollected.has(clue.id))
  }
  check(
    `all ${CLUES_REQUIRED} fragments collected (door unlocks)`,
    useThreat.getState().cluesCollected.size >= CLUES_REQUIRED,
  )
  check('still alive and playing', useThreat.getState().outcome === 'playing')

  // Door is now unlocked, so rebuild with it open and walk out.
  const open = buildGrid(true)
  const path = findPath(open, at, [OUTSIDE.center[0], OUTSIDE.center[2]])
  check('path exists from last fragment to OUTSIDE', !!path)
  if (path) walk(path)
  check("outcome is 'escaped_door'", useThreat.getState().outcome === 'escaped_door')
  check("session ended", useSession.getState().status === 'ended')
}

console.log('\n=== HIDING: every spot must register at the real player height ===')
{
  reset()
  useSession.getState().start()
  for (const spot of HIDING_SPOTS) {
    usePlayerPosition.setState({ x: spot.center[0], y: PLAYER_TRACKED_Y, z: spot.center[2] })
    tickTriggers()
    check(`standing in the ${spot.kind} counts as hidden`, useThreat.getState().isHidden)
    // And stepping out of it must stop counting, or hiding would be
    // permanent once entered.
    usePlayerPosition.setState({ x: spot.center[0] + 6, y: PLAYER_TRACKED_Y, z: spot.center[2] + 6 })
    tickTriggers()
    check(`stepping away from the ${spot.kind} stops counting`, !useThreat.getState().isHidden)
  }
}

console.log('\n=== RUN 2: take the southern fork to the calm room instead ===')
reset()
useSession.getState().start()
{
  const locked = buildGrid(false)
  let at: [number, number] = [0, 30]
  for (const clue of CLUES) {
    const p = findPath(locked, at, [clue.position[0], clue.position[2]])
    if (p) { walk(p); at = [clue.position[0], clue.position[2]] }
  }
  const open = buildGrid(true)
  const path = findPath(open, at, [CALM_ROOM.center[0], CALM_ROOM.center[2] - 5])
  check('path exists to deep inside the calm room', !!path)
  if (path) walk(path)
  // The whole point of the fork: getting to the calm room must NOT trip
  // the fast door ending on the way, or the biofeedback finale is dead.
  check("did NOT trip 'escaped_door' en route", useThreat.getState().outcome !== 'escaped_door')
  check('calm room registered as entered', useCalmRoom.getState().inCalmRoom)
}

console.log(failures ? `\n${failures} FAILURE(S)\n` : '\nFull run completes. Both endings reachable.\n')
process.exit(failures ? 1 : 0)
