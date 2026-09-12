import * as THREE from 'three'

/**
 * Three creatures share one growl bus, one proximity value and one threat
 * system. Rather than have them fight over it, each reports its normalised
 * distance here every frame and the nearest one wins — so what you hear
 * and what can kill you is always whichever is actually closest.
 *
 * Deliberately plain module state, not a store: this updates three times
 * per frame and nothing should re-render because of it.
 */
const distances: number[] = [1, 1, 1]
const positions: THREE.Vector3[] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]

/** Report this entity's distance; returns the index of whichever entity
 * is currently closest to the player. */
export function reportEntity(index: number, normalized: number, position: THREE.Vector3) {
  distances[index] = normalized
  positions[index].copy(position)
  let best = 0
  for (let i = 1; i < distances.length; i++) {
    if (distances[i] < distances[best]) best = i
  }
  return best
}

export function nearestDistance() {
  return Math.min(...distances)
}

/** Dev only: what each creature is currently reporting. Used by the
 * automated playthrough to explain a death rather than just record one. */
const anims: string[] = ['patrol', 'patrol', 'patrol']
export function reportAnim(index: number, anim: string) {
  anims[index] = anim
}

export function entityReports() {
  return distances.map((d, i) => ({
    index: i,
    normalized: d,
    x: positions[i].x,
    z: positions[i].z,
    anim: anims[i],
  }))
}

/**
 * Only one creature may hunt at a time.
 *
 * Once they could actually navigate the maze, every creature that heard
 * or saw the player converged on them at once — three things arriving
 * from three directions, against a player who dies in 2.6 seconds when
 * caught in the open. That isn't difficulty, it's a dogpile with no
 * counterplay, and it also wastes the creatures: three simultaneous
 * hunters read as one swarm rather than as three distinct things.
 *
 * So the closest alerted creature gets the hunt and the others keep
 * patrolling. You get the horror-game shape instead — one thing coming
 * for you, the others still out there somewhere, which is worse.
 */
const alerted: boolean[] = [false, false, false]

export function claimHunt(index: number, wantsToHunt: boolean): boolean {
  alerted[index] = wantsToHunt
  if (!wantsToHunt) return false
  let best = -1
  for (let i = 0; i < alerted.length; i++) {
    if (!alerted[i]) continue
    if (best === -1 || distances[i] < distances[best]) best = i
  }
  return best === index
}

/**
 * Bumped by restartRun(). The Entity components are never unmounted
 * between runs, so without this a creature keeps the position and alert
 * state it had at the moment it killed you — meaning the new run can
 * begin with it already hunting and standing next to the spawn, which is
 * a death loop the player cannot escape and would read as the game being
 * broken rather than hard.
 */
let epoch = 0
export function resetEntities() {
  epoch++
}
export function entityEpoch() {
  return epoch
}

/** Dev aid: press M to line all three up in front of the player, lit, so
 * their designs can be compared directly instead of hunted for. */
export const inspect = { on: false }
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyM') inspect.on = !inspect.on
  })
}
