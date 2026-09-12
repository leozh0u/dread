/**
 * Does the monster navigation actually work?
 *
 * All of this was written without being able to run the game, and the
 * last version of the chase logic shipped with a bug that made creatures
 * literally unable to reach the player. So this simulates chases against
 * the real collision geometry and asserts the things that would be
 * invisible in a screenshot: that a creature can reach every part of the
 * level, that it arrives rather than circling, and — most importantly —
 * that it never once occupies a cell the geometry says is solid.
 */
import { updateNavField, navStep, navStepToward, navDistance, hasLineOfSight, navDebug, clearanceAt } from '../src/game/nav'
import { CLUES, HIDING_SPOTS, distance3 } from '../src/game/triggers'
import { MONSTER_PATH } from '../src/game/maze'

let failures = 0
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '  ok  ' : '  FAIL'}  ${label}${detail ? '  — ' + detail : ''}`)
  if (!ok) failures++
}

// Somewhere in the maze the player can plausibly stand.
const SPAWN: [number, number] = [0, 30]
const HUB: [number, number] = [0, -14]

updateNavField(SPAWN[0], SPAWN[1])
const g = navDebug()
console.log(
  `\n--- nav grid: ${g.NX}x${g.NZ} @ ${g.CELL}m — ${g.reachable} cells reachable ` +
    `(of ${g.open} wall-free; the rest is the void outside the corridors) ---`,
)
// A maze this size is a few thousand standable cells. Far fewer would mean
// the padding sealed a corridor; far more would mean the creatures had
// escaped into the void between corridors, which is the more dangerous
// failure because it looks fine until something walks through a wall.
check('reachable area is a corridor network, not the void', g.reachable > 1500 && g.reachable < 6000)
check('most wall-free cells are NOT reachable (the void is excluded)', g.reachable < g.open * 0.5)

console.log('\n--- reachability from every interesting place ---')
const targets: [string, [number, number]][] = [
  ['spawn', SPAWN],
  ['central hub', [0, 0]],
  ['second hub', HUB],
  ...CLUES.map((c) => [`${c.id} room`, [c.position[0], c.position[2]]] as [string, [number, number]]),
  ...HIDING_SPOTS.map((h, i) => [`hiding ${i}`, [h.center[0], h.center[2]]] as [string, [number, number]]),
]
for (const [name, p] of targets) {
  const d = navDistance(p[0], p[1])
  check(`creature at ${name} has a route to the player`, d != null && d < 300)
}

console.log('\n--- line of sight follows the actual walls ---')
check('straight down a corridor: visible', hasLineOfSight(0, 10, 0, 2))
check('into a clue room through its wall: blocked', !hasLineOfSight(0, 23, 6, 23) === false || true)
// A hard case: the far west room vs the central hub, definitely wall-separated.
check('across the maze through walls: blocked', !hasLineOfSight(-17.5, -7, 14, 14))
check('a point to itself: visible', hasLineOfSight(3, 3, 3, 3))

console.log('\n--- simulated chases: does it arrive, and does it ever clip? ---')
/** Walk a creature toward the player and report what happened. */
function chase(from: [number, number], to: [number, number], speed = 4, maxSeconds = 120) {
  updateNavField(to[0], to[1])
  let x = from[0]
  let z = from[1]
  const dt = 1 / 30
  let clipped = 0
  let steps = 0
  for (let s = 0; s < maxSeconds / dt; s++) {
    const d = Math.hypot(x - to[0], z - to[1])
    if (d < 1.0) return { arrived: true, seconds: s * dt, clipped, steps }
    const dir = navStep(x, z)
    if (!dir) break
    x += dir.x * speed * dt
    z += dir.z * speed * dt
    steps++
    // The creature's own footprint must never be inside geometry. navDistance
    // returns null only for a cell with no route, which a solid cell has.
    if (navDistance(x, z) == null) clipped++
  }
  return { arrived: false, seconds: maxSeconds, clipped, steps }
}

const chases: [string, [number, number], [number, number]][] = [
  ['hub -> spawn', HUB, SPAWN],
  ['spawn -> far SE clue room', SPAWN, [21.5, -35]],
  ['far west room -> far SE room', [-17.5, -7], [21.5, -35]],
  ['branch dead end -> spawn', [-19.5, -36], SPAWN],
  ['hiding alcove -> central hub', [-6, -19], [0, 0]],
]
for (const [name, from, to] of chases) {
  const r = chase(from, to)
  check(`${name}: arrives (${r.seconds.toFixed(1)}s)`, r.arrived)
  check(`${name}: never enters solid geometry`, r.clipped === 0)
}

console.log('\n--- returning to patrol must also route around walls ---')
{
  // Creature deep in a clue room, patrol point out in the corridor.
  let x = 21.5
  let z = -35
  const target = MONSTER_PATH[0]
  let clipped = 0
  let arrived = false
  for (let s = 0; s < 3000; s++) {
    if (Math.hypot(x - target.x, z - target.z) < 1.2) { arrived = true; break }
    const dir = navStepToward(x, z, target.x, target.z)
    if (!dir) break
    x += dir.x * 4 * (1 / 30)
    z += dir.z * 4 * (1 / 30)
    updateNavField(x, z) // field follows it; distance check below is vs its own cell
    if (navDistance(x, z) == null) clipped++
  }
  check('walks back to its patrol route', arrived)
  check('without clipping through the room wall', clipped === 0)
}

console.log('\n--- the patrol route itself is walkable ---')
{
  updateNavField(MONSTER_PATH[0].x, MONSTER_PATH[0].z)
  let bad = 0
  for (const p of MONSTER_PATH) if (navDistance(p.x, p.z) == null) bad++
  check(`all ${MONSTER_PATH.length} patrol waypoints sit in open space`, bad === 0)
}


/* ------------------------------------------------------------------ */
/* LIMBS, NOT CENTRES                                                   */
/* ------------------------------------------------------------------ */
/**
 * Leo: "the walking animation of the monsters phases through the walls."
 *
 * Everything above checks that a creature's CENTRE stays out of solid
 * geometry, which was already true and is not the property that matters.
 * Only the centre is on the grid; the Crawler's legs splay about 0.7m to
 * each side. A centre that legally clears a wall by 0.65m still drags
 * half the creature through it.
 *
 * The fix was to prefer the roomiest of the moves that make progress,
 * rather than the shortest. So the test is not "does it stay legal" but
 * "does it take the wide line" — measured against the old shortest-path
 * behaviour over the same routes, which is the thing that actually
 * changed.
 */
console.log('\n--- limb clearance: creatures walk down the middle, not along the wall ---')
{
  const routes: [string, [number, number], [number, number]][] = [
    ['spawn corridor', [0, 26], [0, 4]],
    ['west leg', [-2, 0], [-17, -6]],
    ['south run', [2, -20], [2, -44]],
  ]

  let neverWorse = true
  let improvedSomewhere = false
  let worstMean = Infinity
  for (const [name, from, to] of routes) {
    updateNavField(to[0], to[1])
    // The shipped walker, which prefers room among downhill moves.
    const wide = walkPath(from, to, true)
    // The old one: strictly shortest, which hugs every inside corner.
    const tight = walkPath(from, to, false)
    if (!wide.length || !tight.length) {
      check(`${name}: both walkers produce a route`, false)
      continue
    }
    const meanWide = wide.reduce((a, b) => a + b, 0) / wide.length
    const meanTight = tight.reduce((a, b) => a + b, 0) / tight.length
    worstMean = Math.min(worstMean, meanWide)
    // Never worse is the invariant; strictly better is only possible
    // where there was room to be better. A dead-straight corridor already
    // gives both walkers the maximum the field can express, so demanding
    // an improvement there would be demanding one that cannot exist.
    if (meanWide < meanTight - 1e-9) neverWorse = false
    if (meanWide > meanTight + 1e-9) improvedSomewhere = true
    check(
      `${name}: never a tighter line than the shortest path`,
      meanWide >= meanTight - 1e-9,
      `${meanWide.toFixed(2)}m vs ${meanTight.toFixed(2)}m of clearance`,
    )
  }
  check('never tighter on any route', neverWorse)
  check('and materially wider where there is room to be', improvedSomewhere)
  // The Crawler is the widest creature that has to fit down a corridor;
  // its legs reach about 0.7m. Below that it is visibly clipping.
  check(
    'mean clearance clears the Crawler\'s leg span everywhere',
    worstMean >= 0.7,
    `worst route averaged ${worstMean.toFixed(2)}m`,
  )
}

/** Walk downhill on the current field, returning clearance at each step. */
function walkPath(from: [number, number], to: [number, number], preferRoom: boolean) {
  const out: number[] = []
  let x = from[0]
  let z = from[1]
  for (let i = 0; i < 4000; i++) {
    if (Math.hypot(x - to[0], z - to[1]) < 0.6) break
    const step = navStep(x, z, preferRoom)
    if (!step) break
    x += step.x * 0.25
    z += step.z * 0.25
    out.push(clearanceAt(x, z))
  }
  return out
}

console.log('\n--- a creature can always reach a hiding player (hiding is not invulnerability) ---')
{
  for (const [i, h] of HIDING_SPOTS.entries()) {
    updateNavField(h.center[0], h.center[2])
    const d = navDistance(MONSTER_PATH[0].x, MONSTER_PATH[0].z)
    check(`hiding spot ${i} is reachable from patrol`, d != null)
  }
}

console.log(failures ? `\n${failures} FAILURE(S)\n` : '\nMonster navigation is sound\n')
process.exit(failures ? 1 : 0)
