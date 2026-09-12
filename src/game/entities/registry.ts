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

/** Dev aid: press M to line all three up in front of the player, lit, so
 * their designs can be compared directly instead of hunted for. */
export const inspect = { on: false }
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyM') inspect.on = !inspect.on
  })
}
