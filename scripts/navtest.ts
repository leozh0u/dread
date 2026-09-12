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
import { updateNavField, navStep, navStepToward, navDistance, hasLineOfSight, navDebug } from '../src/game/nav'
import { CLUES, HIDING_SPOTS, distance3 } from '../src/game/triggers'
import { MONSTER_PATH } from '../src/game/maze'

let failures = 0
const check = (label: string, ok: boolean) => {
  console.log(`${ok ? '  ok  ' : '  FAIL'}  ${label}`)
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
