import { allWalls } from './walls'

/**
 * Monster pathfinding.
 *
 * The creatures used to be locked to a fixed patrol polyline, and even
 * while "hunting" they only moved to wherever the player *projected* onto
 * that line. Stand anywhere off it — any room, the alcove, a side
 * corridor — and the thing physically could not reach you. That is why
 * nothing ever detected, chased or killed anyone: monsterDistance never
 * got near the kill threshold because the monster never got near the
 * player.
 *
 * This replaces that with real navigation over the same collision
 * geometry the level is built from (walls.ts), so a creature can go
 * anywhere the player can go.
 *
 * HOW: one breadth-first distance field computed FROM the player, and
 * every creature simply walks downhill on it. Three creatures pathing
 * independently would be three searches a frame; this is one search,
 * shared, recomputed only when the player actually changes cell and at
 * most a few times a second. Walking downhill on a BFS field is also
 * exactly optimal — no local minima to get stuck in, which a "steer
 * toward the player and hope" approach would hit at the first corner.
 */

const CELL = 0.5
const MINX = -30
const MAXX = 30
const MINZ = -75
const MAXZ = 35
const NX = Math.round((MAXX - MINX) / CELL)
const NZ = Math.round((MAXZ - MINZ) / CELL)

/**
 * Creatures are wider than the player and shouldn't scrape along walls, so
 * they're padded a little more generously than the player's capsule.
 */
const WALL_HALF_T = 0.1
const AGENT_R = 0.55

const UNREACHABLE = 0xffff

let blocked: Uint8Array | null = null
const field = new Uint16Array(NX * NZ)
let fieldValid = false
let fieldCellIdx = -1

const idx = (i: number, j: number) => j * NX + i
const cellX = (x: number) => Math.floor((x - MINX) / CELL)
const cellZ = (z: number) => Math.floor((z - MINZ) / CELL)
const inBounds = (i: number, j: number) => i >= 0 && j >= 0 && i < NX && j < NZ

function buildGrid() {
  const g = new Uint8Array(NX * NZ)
  const pad = WALL_HALF_T + AGENT_R
  for (const w of allWalls(true)) {
    const lo = Math.min(w.from, w.to)
    const hi = Math.max(w.from, w.to)
    if (w.axis === 'x') {
      const i0 = Math.max(0, cellX(w.fixed - pad))
      const i1 = Math.min(NX - 1, cellX(w.fixed + pad))
      const j0 = Math.max(0, cellZ(lo - pad))
      const j1 = Math.min(NZ - 1, cellZ(hi + pad))
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) g[idx(i, j)] = 1
    } else {
      const j0 = Math.max(0, cellZ(w.fixed - pad))
      const j1 = Math.min(NZ - 1, cellZ(w.fixed + pad))
      const i0 = Math.max(0, cellX(lo - pad))
      const i1 = Math.min(NX - 1, cellX(hi + pad))
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) g[idx(i, j)] = 1
    }
  }
  return g
}

/** Nearest open cell to a point, searching outward. Handles the player
 * standing fractionally inside a padded wall, which is common since the
 * creature padding is wider than the player's own collider. */
function nearestOpen(i: number, j: number): number {
  const g = blocked!
  if (inBounds(i, j) && !g[idx(i, j)]) return idx(i, j)
  for (let r = 1; r <= 8; r++) {
    for (let di = -r; di <= r; di++) {
      for (let dj = -r; dj <= r; dj++) {
        if (Math.abs(di) !== r && Math.abs(dj) !== r) continue
        const ni = i + di
        const nj = j + dj
        if (inBounds(ni, nj) && !g[idx(ni, nj)]) return idx(ni, nj)
      }
    }
  }
  return -1
}

/**
 * Recompute the distance field from the player, if they've moved cell.
 * Cheap enough to call every frame; it early-outs almost always.
 */
export function updateNavField(px: number, pz: number) {
  if (!blocked) blocked = buildGrid()
  const start = nearestOpen(cellX(px), cellZ(pz))
  if (start < 0) return
  if (fieldValid && start === fieldCellIdx) return

  fieldCellIdx = start
  fieldValid = true
  field.fill(UNREACHABLE)
  field[start] = 0

  // Plain FIFO queue over a typed array — a ring buffer here measurably
  // beats push/shift on an ordinary array at this grid size.
  const queue = new Int32Array(NX * NZ)
  let head = 0
  let tail = 0
  queue[tail++] = start

  while (head < tail) {
    const c = queue[head++]
    const i = c % NX
    const j = (c - i) / NX
    const d = field[c] + 1
    // 4-connected: diagonals would let a creature cut a wall corner.
    if (i > 0) { const n = c - 1; if (!blocked[n] && field[n] > d) { field[n] = d; queue[tail++] = n } }
    if (i < NX - 1) { const n = c + 1; if (!blocked[n] && field[n] > d) { field[n] = d; queue[tail++] = n } }
    if (j > 0) { const n = c - NX; if (!blocked[n] && field[n] > d) { field[n] = d; queue[tail++] = n } }
    if (j < NZ - 1) { const n = c + NX; if (!blocked[n] && field[n] > d) { field[n] = d; queue[tail++] = n } }
  }
}

/** Path distance in world units from a point to the player, or null if
 * there's no route (which shouldn't happen in a sealed level). */
export function navDistance(x: number, z: number): number | null {
  if (!blocked || !fieldValid) return null
  const c = nearestOpen(cellX(x), cellZ(z))
  if (c < 0 || field[c] === UNREACHABLE) return null
  return field[c] * CELL
}

/**
 * Unit direction to move from (x,z) to get closer to the player, or null
 * if already there / no route. Picks the lowest-valued neighbouring cell,
 * which on a BFS field is always a step along a shortest path.
 */
export function navStep(x: number, z: number): { x: number; z: number } | null {
  if (!blocked || !fieldValid) return null
  const c = nearestOpen(cellX(x), cellZ(z))
  if (c < 0) return null
  const here = field[c]
  if (here === UNREACHABLE || here === 0) return null

  const i = c % NX
  const j = (c - i) / NX
  let best = here
  let bi = i
  let bj = j
  // Includes diagonals when BOTH orthogonal neighbours are open, so
  // movement looks natural in open junctions without clipping corners.
  for (let di = -1; di <= 1; di++) {
    for (let dj = -1; dj <= 1; dj++) {
      if (!di && !dj) continue
      const ni = i + di
      const nj = j + dj
      if (!inBounds(ni, nj)) continue
      const n = idx(ni, nj)
      if (blocked[n]) continue
      if (di && dj && (blocked[idx(i + di, j)] || blocked[idx(i, j + dj)])) continue
      if (field[n] < best) {
        best = field[n]
        bi = ni
        bj = nj
      }
    }
  }
  if (bi === i && bj === j) return null
  const dx = bi - i
  const dz = bj - j
  const len = Math.hypot(dx, dz) || 1
  return { x: dx / len, z: dz / len }
}

/** True if a straight line between two points crosses no wall — used to
 * decide whether a creature can see you, rather than merely be near. */
export function hasLineOfSight(ax: number, az: number, bx: number, bz: number): boolean {
  if (!blocked) blocked = buildGrid()
  const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / (CELL * 0.5))
  for (let s = 1; s < steps; s++) {
    const t = s / steps
    const x = ax + (bx - ax) * t
    const z = az + (bz - az) * t
    const i = cellX(x)
    const j = cellZ(z)
    if (!inBounds(i, j) || blocked[idx(i, j)]) return false
  }
  return true
}

/** Test hook — lets scripts assert the grid without a renderer. */
export function navDebug() {
  if (!blocked) blocked = buildGrid()
  let open = 0
  for (let k = 0; k < blocked.length; k++) if (!blocked[k]) open++
  return { NX, NZ, CELL, open, total: blocked.length }
}
