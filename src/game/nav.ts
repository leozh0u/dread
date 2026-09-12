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

/**
 * A small pool of distance fields rather than just the player's.
 *
 * The player's field answers "how do I get to the player". But a creature
 * that gives up a hunt deep inside a room needs "how do I get back to my
 * patrol route", which is a different target. The first version simply
 * lerped its position toward the patrol point, which dragged it straight
 * THROUGH the walls of whatever room it was standing in.
 *
 * Each field costs one BFS over ~26k cells (about a millisecond) and is
 * reused until its target moves cell, so in practice this is a handful of
 * searches a second across all three creatures, not one per frame.
 */
const MAX_FIELDS = 6

interface Field {
  cells: Uint16Array
  targetIdx: number
  usedAt: number
}

const fields: Field[] = []
let clock = 0

function fieldFor(targetIdx: number): Field {
  const existing = fields.find((f) => f.targetIdx === targetIdx)
  if (existing) {
    existing.usedAt = ++clock
    return existing
  }

  let slot: Field
  if (fields.length < MAX_FIELDS) {
    slot = { cells: new Uint16Array(NX * NZ), targetIdx: -1, usedAt: 0 }
    fields.push(slot)
  } else {
    // Evict least recently used.
    slot = fields.reduce((a, b) => (a.usedAt < b.usedAt ? a : b))
  }
  slot.targetIdx = targetIdx
  slot.usedAt = ++clock
  bfs(slot.cells, targetIdx)
  return slot
}

function bfs(cells: Uint16Array, start: number) {
  cells.fill(UNREACHABLE)
  cells[start] = 0
  const queue = new Int32Array(NX * NZ)
  let head = 0
  let tail = 0
  queue[tail++] = start
  while (head < tail) {
    const c = queue[head++]
    const i = c % NX
    const j = (c - i) / NX
    const d = cells[c] + 1
    // 4-connected: diagonals here would let a creature cut a wall corner.
    if (i > 0) { const n = c - 1; if (!blocked![n] && cells[n] > d) { cells[n] = d; queue[tail++] = n } }
    if (i < NX - 1) { const n = c + 1; if (!blocked![n] && cells[n] > d) { cells[n] = d; queue[tail++] = n } }
    if (j > 0) { const n = c - NX; if (!blocked![n] && cells[n] > d) { cells[n] = d; queue[tail++] = n } }
    if (j < NZ - 1) { const n = c + NX; if (!blocked![n] && cells[n] > d) { cells[n] = d; queue[tail++] = n } }
  }
}

let playerField: Field | null = null

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

/**
 * Distance, in cells, from every open cell to the nearest blocked one.
 *
 * WHY THIS EXISTS. The grid pads walls by the agent radius and then the
 * creatures walk downhill on a BFS field, which finds the SHORTEST path —
 * and the shortest path through a corridor hugs the inside of every
 * corner, because cutting the corner is shorter. That is fine for a dot
 * on a grid and wrong for these creatures: only their centre point is on
 * the grid, while the Crawler's legs splay about 0.7m to each side and
 * the Smile braces on an arm span over four metres wide. A centre that
 * legally clears a wall by 0.65m still drags half a creature through it,
 * which is what "the walking animation phases through the walls" is.
 *
 * Rather than pad the grid by the full limb span — which would seal every
 * corridor in the maze and leave the creatures unable to path at all —
 * the step function uses this to pick the ROOMIEST of the moves that make
 * progress. They end up walking down the middle of a corridor instead of
 * scraping its inside edge, so the limbs stay in open space.
 *
 * Multi-source BFS outward from every blocked cell: one pass over the
 * grid, computed once alongside it.
 */
let clearance: Uint8Array | null = null
const CLEAR_CAP = 6

function buildClearance(g: Uint8Array): Uint8Array {
  const out = new Uint8Array(NX * NZ)
  const queue = new Int32Array(NX * NZ)
  let head = 0
  let tail = 0
  for (let c = 0; c < g.length; c++) {
    if (g[c]) {
      out[c] = 0
      queue[tail++] = c
    } else {
      out[c] = 255
    }
  }
  // Cells outside the walled area have no blocked neighbour to seed from,
  // so they keep 255 and simply read as maximally roomy. That is correct:
  // nothing there constrains a creature.
  while (head < tail) {
    const c = queue[head++]
    const d = out[c]
    if (d >= CLEAR_CAP) continue
    const i = c % NX
    const j = (c - i) / NX
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        if (!di && !dj) continue
        const ni = i + di
        const nj = j + dj
        if (!inBounds(ni, nj)) continue
        const n = idx(ni, nj)
        if (out[n] !== 255) continue
        out[n] = d + 1
        queue[tail++] = n
      }
    }
  }
  for (let c = 0; c < out.length; c++) if (out[c] > CLEAR_CAP) out[c] = CLEAR_CAP
  return out
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
  if (!blocked) {
    blocked = buildGrid()
    clearance = buildClearance(blocked)
  }
  const start = nearestOpen(cellX(px), cellZ(pz))
  if (start < 0) return
  playerField = fieldFor(start)
}

/** Path distance in world units from a point to the player, or null if
 * there's no route (which shouldn't happen in a sealed level). */
export function navDistance(x: number, z: number): number | null {
  if (!blocked || !playerField) return null
  const c = nearestOpen(cellX(x), cellZ(z))
  if (c < 0 || playerField.cells[c] === UNREACHABLE) return null
  return playerField.cells[c] * CELL
}

/**
 * Unit direction to move from (x,z) to get closer to the player, or null
 * if already there / no route. Picks the lowest-valued neighbouring cell,
 * which on a BFS field is always a step along a shortest path.
 */
export function navStep(
  x: number,
  z: number,
  preferRoom = true,
): { x: number; z: number } | null {
  if (!playerField) return null
  return stepOnField(playerField.cells, x, z, preferRoom)
}

/**
 * Walk toward an arbitrary world point through the maze. Used to send a
 * creature back to its patrol route after a hunt without it clipping
 * through the room it was standing in.
 */
export function navStepToward(
  x: number,
  z: number,
  tx: number,
  tz: number,
): { x: number; z: number } | null {
  if (!blocked) {
    blocked = buildGrid()
    clearance = buildClearance(blocked)
  }
  const target = nearestOpen(cellX(tx), cellZ(tz))
  if (target < 0) return null
  return stepOnField(fieldFor(target).cells, x, z)
}

function stepOnField(
  field: Uint16Array,
  x: number,
  z: number,
  /** False reproduces the old shortest-path descent, which hugs every
   * inside corner. Only scripts/navtest.ts passes false, to measure what
   * the clearance preference actually buys — see that test. */
  preferRoom = true,
): { x: number; z: number } | null {
  if (!blocked) return null
  const c = nearestOpen(cellX(x), cellZ(z))
  if (c < 0) return null
  const here = field[c]
  if (here === UNREACHABLE || here === 0) return null

  const i = c % NX
  const j = (c - i) / NX
  let bi = i
  let bj = j
  let bestRoom = -1
  let bestField = here
  // Includes diagonals when BOTH orthogonal neighbours are open, so
  // movement looks natural in open junctions without clipping corners.
  //
  // Of the neighbours that make progress, take the one with the most room
  // around it, breaking ties on distance. Every candidate is STRICTLY
  // downhill, so this cannot introduce a local minimum or a loop — the
  // field value falls on every step exactly as before, the creature just
  // takes the wide line through a corridor rather than clipping its inner
  // edge and dragging its limbs through the wall.
  for (let di = -1; di <= 1; di++) {
    for (let dj = -1; dj <= 1; dj++) {
      if (!di && !dj) continue
      const ni = i + di
      const nj = j + dj
      if (!inBounds(ni, nj)) continue
      const n = idx(ni, nj)
      if (blocked[n]) continue
      if (di && dj && (blocked[idx(i + di, j)] || blocked[idx(i, j + dj)])) continue
      if (field[n] >= here) continue
      const room = preferRoom && clearance ? clearance[n] : 0
      if (room > bestRoom || (room === bestRoom && field[n] < bestField)) {
        bestRoom = room
        bestField = field[n]
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
  if (!blocked) {
    blocked = buildGrid()
    clearance = buildClearance(blocked)
  }
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

/**
 * Test hook — lets scripts assert the grid without a renderer.
 *
 * `open` counts every cell with no wall in it, which INCLUDES the empty
 * space outside the corridors — that void has no wall geometry, so it
 * isn't "blocked", it's just somewhere the BFS never reaches. `reachable`
 * is the number that actually means something: cells connected to the
 * current field's target, i.e. places a creature can really stand.
 */
/**
 * How much open space there is around a point, in metres, capped.
 *
 * Exported so the clearance behaviour can be TESTED rather than asserted.
 * "The creature's centre is in open space" was already covered and is not
 * the property that matters here: only the centre is on the grid, while
 * the Crawler's legs splay about 0.7m each side and the Smile braces on
 * an arm span over four metres wide. A centre that legally clears a wall
 * by 0.65m still drags half a creature through it, which is what "the
 * walking animation phases through the walls" was.
 */
export function clearanceAt(x: number, z: number): number {
  if (!blocked) {
    blocked = buildGrid()
    clearance = buildClearance(blocked)
  }
  const i = cellX(x)
  const j = cellZ(z)
  if (!inBounds(i, j) || !clearance) return 0
  return clearance[idx(i, j)] * CELL
}

export function navDebug() {
  if (!blocked) {
    blocked = buildGrid()
    clearance = buildClearance(blocked)
  }
  let open = 0
  for (let k = 0; k < blocked.length; k++) if (!blocked[k]) open++
  let reachable = 0
  if (playerField) {
    for (let k = 0; k < playerField.cells.length; k++) {
      if (playerField.cells[k] !== UNREACHABLE) reachable++
    }
  }
  return { NX, NZ, CELL, open, reachable, total: blocked.length }
}
