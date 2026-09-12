import { create } from 'zustand'

export const SPAWN_POINT: [number, number, number] = [0, 1, 29]

interface PlayerPositionState {
  x: number
  y: number
  z: number
  set: (x: number, y: number, z: number) => void
  spawnRequestId: number
  requestSpawn: () => void
}

/** Player's world position, updated every frame by Player.tsx. Everything
 * that needs to know "is the player near X" (clues, hiding spots, the calm
 * room) reads this via plain distance/bounding-box checks in
 * useTriggersLoop.ts, rather than Rapier sensor colliders.
 *
 * We tried sensor colliders first (CuboidCollider + onIntersectionEnter).
 * Extensively verified via direct physics-position sampling that they
 * never fired — not for normal movement through them, not for a
 * stationary player parked exactly at a sensor's center for 1.5+ seconds,
 * not even with the sensor enlarged to a 10-unit cube fully containing the
 * player. Ruled out CCD, React StrictMode, and timing as causes. Whatever
 * the root cause (a version mismatch between @react-three/rapier and the
 * underlying rapier3d-compat WASM build is the leading suspect), plain
 * distance checks are simple, fast enough at this scale, and — critically
 * — directly verifiable with the same position-sampling method that
 * caught this in the first place. */
export const usePlayerPosition = create<PlayerPositionState>((set, get) => ({
  x: 0,
  y: 0,
  z: 0,
  set: (x, y, z) => set({ x, y, z }),
  spawnRequestId: 0,
  // Player.tsx watches spawnRequestId and teleports there whenever it
  // changes — used on restart so a death deep in the house doesn't leave
  // the next run starting from that same spot.
  requestSpawn: () => set({ spawnRequestId: get().spawnRequestId + 1 }),
}))
