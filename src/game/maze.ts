/**
 * The level as a graph of junctions connected by axis-aligned corridors,
 * instead of one straight spine with alcoves off it. This is what makes
 * it read as an actual maze rather than a hallway with boxes: real turns,
 * a loop (B <-> D has two routes — via C, or the direct B-E-D shortcut)
 * so the player has a real evasion option instead of one forced path,
 * and dead ends that reward exploring.
 *
 * Every corridor is HALF_WIDTH wide on each side of its centerline.
 * Junction cells are HALF_WIDTH squares; a junction's `open` sides are
 * the directions that continue somewhere (another corridor, the exit) —
 * every other side gets a capping wall, generated automatically rather
 * than hand-placed, which is what made the old hand-authored walls
 * tedious and error-prone to extend.
 */

export const HALF_WIDTH = 3

export type Dir = 'N' | 'S' | 'E' | 'W'

export interface Junction {
  id: string
  x: number
  z: number
  open: Dir[]
}

export interface EdgeGap {
  side: 'left' | 'right'
  from: number
  to: number
}

export interface Edge {
  a: string
  b: string
}

// --- The graph ---------------------------------------------------------
// Spacing is chosen so every edge has enough length for junction
// clearance (HALF_WIDTH at each end) plus room for a door-sized gap.
export const JUNCTIONS: Junction[] = [
  { id: 'A', x: 0, z: 24, open: ['S'] }, // spawn end
  { id: 'B', x: 0, z: 8, open: ['N', 'E', 'S'] },
  { id: 'C', x: 12, z: 8, open: ['W', 'S'] },
  { id: 'D', x: 12, z: -8, open: ['N', 'W', 'S'] },
  { id: 'E', x: 0, z: -8, open: ['N', 'E'] }, // loop shortcut node
  { id: 'F', x: 12, z: -24, open: ['N', 'W'] },
  { id: 'G', x: -10, z: -24, open: ['E', 'S'] },
  { id: 'H', x: -10, z: -40, open: ['N', 'E'] },
  { id: 'I', x: 4, z: -40, open: ['W', 'S'] }, // south -> exit door
]

export const EDGES: Edge[] = [
  { a: 'A', b: 'B' },
  { a: 'B', b: 'C' },
  { a: 'B', b: 'E' }, // loop shortcut
  { a: 'C', b: 'D' },
  { a: 'D', b: 'E' }, // loop shortcut closes here
  { a: 'D', b: 'F' },
  { a: 'F', b: 'G' },
  { a: 'G', b: 'H' },
  { a: 'H', b: 'I' },
]

export function findJunction(id: string): Junction {
  const j = JUNCTIONS.find((j) => j.id === id)
  if (!j) throw new Error(`unknown junction ${id}`)
  return j
}

// --- Geometry: turning the graph into wall segments --------------------

export interface WallSpec {
  axis: 'x' | 'z' // 'x' = a wall at fixed x spanning z; 'z' = a wall at fixed z spanning x
  fixed: number
  from: number
  to: number
}

/** A straight run from `from` to `to` along `fixed`, with rectangular
 * gaps cut out of it (for room openings), returned as the complementary
 * sub-runs. */
function runWithGaps(axis: 'x' | 'z', fixed: number, from: number, to: number, gaps: [number, number][]): WallSpec[] {
  const lo = Math.min(from, to)
  const hi = Math.max(from, to)
  const cuts = gaps
    .map(([a, b]): [number, number] => [Math.max(lo, Math.min(a, b)), Math.min(hi, Math.max(a, b))])
    .filter(([a, b]) => b > a)
    .sort((p, q) => p[0] - q[0])

  const segments: WallSpec[] = []
  let cursor = lo
  for (const [a, b] of cuts) {
    if (a > cursor) segments.push({ axis, fixed, from: cursor, to: a })
    cursor = Math.max(cursor, b)
  }
  if (cursor < hi) segments.push({ axis, fixed, from: cursor, to: hi })
  return segments
}

/** Per-edge room-opening gaps, along the corridor's own running axis
 * (z for vertical corridors, x for horizontal ones). `left` is the wall
 * at (fixed - HALF_WIDTH), `right` is (fixed + HALF_WIDTH). */
const EDGE_GAPS: Record<string, EdgeGap[]> = {
  'A-B': [{ side: 'right', from: 14, to: 18 }], // Room 1 (clue) — east
  'C-D': [{ side: 'right', from: -2, to: 2 }], // Room 2 (clue) — east
  'F-G': [{ side: 'right', from: -2, to: 2 }], // branch dead-end — south
  'G-H': [{ side: 'left', from: -32, to: -28 }], // Room 3 (clue) — west
  'H-I': [{ side: 'right', from: -4, to: 0 }], // Room 4 (hiding only) — north
}

/** Builds every corridor wall in the graph. Each edge contributes two
 * parallel walls (±HALF_WIDTH from centerline), each trimmed to stop
 * HALF_WIDTH short of the junction center at both ends (so junction
 * cells are open squares, not blocked by corridor walls meeting there),
 * with any room-opening gaps cut out. */
export function buildCorridorWalls(): WallSpec[] {
  const out: WallSpec[] = []
  for (const edge of EDGES) {
    const a = findJunction(edge.a)
    const b = findJunction(edge.b)
    const gaps = EDGE_GAPS[`${edge.a}-${edge.b}`] ?? []
    const leftGaps = gaps.filter((g) => g.side === 'left').map((g): [number, number] => [g.from, g.to])
    const rightGaps = gaps.filter((g) => g.side === 'right').map((g): [number, number] => [g.from, g.to])

    if (a.x === b.x) {
      // vertical corridor (constant x, spans z)
      const x = a.x
      const zFrom = a.z > b.z ? a.z - HALF_WIDTH : a.z + HALF_WIDTH
      const zTo = a.z > b.z ? b.z + HALF_WIDTH : b.z - HALF_WIDTH
      out.push(...runWithGaps('x', x - HALF_WIDTH, zFrom, zTo, leftGaps))
      out.push(...runWithGaps('x', x + HALF_WIDTH, zFrom, zTo, rightGaps))
    } else {
      // horizontal corridor (constant z, spans x)
      const z = a.z
      const xFrom = a.x > b.x ? a.x - HALF_WIDTH : a.x + HALF_WIDTH
      const xTo = a.x > b.x ? b.x + HALF_WIDTH : b.x - HALF_WIDTH
      out.push(...runWithGaps('z', z - HALF_WIDTH, xFrom, xTo, leftGaps))
      out.push(...runWithGaps('z', z + HALF_WIDTH, xFrom, xTo, rightGaps))
    }
  }
  return out
}

/** Capping walls for every junction side that isn't `open` — otherwise a
 * junction with only 2 connections would be walkable straight through
 * its other 2 sides into the void. */
export function buildJunctionCaps(): WallSpec[] {
  const out: WallSpec[] = []
  for (const j of JUNCTIONS) {
    if (!j.open.includes('N')) out.push({ axis: 'z', fixed: j.z + HALF_WIDTH, from: j.x - HALF_WIDTH, to: j.x + HALF_WIDTH })
    if (!j.open.includes('S')) out.push({ axis: 'z', fixed: j.z - HALF_WIDTH, from: j.x - HALF_WIDTH, to: j.x + HALF_WIDTH })
    if (!j.open.includes('E')) out.push({ axis: 'x', fixed: j.x + HALF_WIDTH, from: j.z - HALF_WIDTH, to: j.z + HALF_WIDTH })
    if (!j.open.includes('W')) out.push({ axis: 'x', fixed: j.x - HALF_WIDTH, from: j.z - HALF_WIDTH, to: j.z + HALF_WIDTH })
  }
  return out
}

/** The monster's patrol path — walks the main loop, then the spur out to
 * the exit and back, as a polyline of waypoints (see Monster.tsx, which
 * tracks progress as arc-length along this polyline). It never leaves
 * this path, so every room off the corridors — including the loop
 * shortcut — is real, reachable safety. */
export const MONSTER_PATH: { x: number; z: number }[] = [
  findJunction('A'),
  findJunction('B'),
  findJunction('C'),
  findJunction('D'),
  findJunction('E'),
  findJunction('B'),
  findJunction('C'),
  findJunction('D'),
  findJunction('F'),
  findJunction('G'),
  findJunction('H'),
  findJunction('I'),
  findJunction('H'),
  findJunction('G'),
  findJunction('F'),
  findJunction('D'),
  findJunction('E'),
  findJunction('B'),
]

// --- Arc-length helpers, so the monster can move along MONSTER_PATH ----
// as a single "how far along the polyline" number instead of raw x/z
// targets. This is what lets it patrol a real winding, looping route
// instead of a straight line, with the same simple "move toward a target
// number" logic as before.

const SEGMENT_LENGTHS = MONSTER_PATH.slice(1).map((p, i) =>
  Math.hypot(p.x - MONSTER_PATH[i].x, p.z - MONSTER_PATH[i].z),
)
export const PATH_TOTAL_LENGTH = SEGMENT_LENGTHS.reduce((a, b) => a + b, 0)

/** World (x,z) at arc-length `s` along MONSTER_PATH, wrapping around
 * (the monster loops the whole path forever). */
export function pointAtArcLength(s: number): { x: number; z: number } {
  const total = PATH_TOTAL_LENGTH
  let d = ((s % total) + total) % total // wrap into [0, total)
  for (let i = 0; i < SEGMENT_LENGTHS.length; i++) {
    const len = SEGMENT_LENGTHS[i]
    if (d <= len || i === SEGMENT_LENGTHS.length - 1) {
      const t = len > 0 ? d / len : 0
      const p0 = MONSTER_PATH[i]
      const p1 = MONSTER_PATH[i + 1]
      return { x: p0.x + (p1.x - p0.x) * t, z: p0.z + (p1.z - p0.z) * t }
    }
    d -= len
  }
  return MONSTER_PATH[0]
}

/** The arc-length of the point on MONSTER_PATH nearest to `point` — used
 * to translate "where the player actually is" into "where along its
 * patrol route the monster should head to intercept them." Picks
 * whichever of the (possibly several, thanks to the loop) closest
 * approaches is nearest in world space, not arc-length space, so it
 * doesn't get confused about which way around the loop is shorter. */
export function projectToArcLength(point: { x: number; z: number }): number {
  let bestS = 0
  let bestDist = Infinity
  let cursor = 0
  for (let i = 0; i < SEGMENT_LENGTHS.length; i++) {
    const p0 = MONSTER_PATH[i]
    const p1 = MONSTER_PATH[i + 1]
    const len = SEGMENT_LENGTHS[i]
    const dx = p1.x - p0.x
    const dz = p1.z - p0.z
    const lenSq = dx * dx + dz * dz
    const t = lenSq > 0 ? THREE_clamp01(((point.x - p0.x) * dx + (point.z - p0.z) * dz) / lenSq) : 0
    const px = p0.x + dx * t
    const pz = p0.z + dz * t
    const dist = Math.hypot(point.x - px, point.z - pz)
    if (dist < bestDist) {
      bestDist = dist
      bestS = cursor + len * t
    }
    cursor += len
  }
  return bestS
}

function THREE_clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/** Shortest signed distance from `s` to `target` around the loop — e.g.
 * moving -3 might be shorter than moving +total-3 to reach the same
 * point going the other way around. */
export function shortestArcDelta(s: number, target: number): number {
  const total = PATH_TOTAL_LENGTH
  let delta = (target - s) % total
  if (delta > total / 2) delta -= total
  if (delta < -total / 2) delta += total
  return delta
}
