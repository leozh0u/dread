import { create } from 'zustand'

export const SPAWN_POINT: [number, number, number] = [0, 1, 29]

interface PlayerPositionState {
  x: number
  y: number
  z: number
  /**
   * False until Player.tsx has reported an actual position.
   *
   * THIS GUARD EXISTS BECAUSE THE PLAYER COULD DIE AT SPAWN, HAVING NEVER
   * MOVED. The store used to start at the world origin (0,0,0), which is
   * not where the player is — they spawn at z=29. Player.tsx only writes a
   * real position once its useFrame runs, so for the first frames of a run
   * every "how far away is the monster" measurement was taken from the
   * origin instead of from the player.
   *
   * The creatures mount parked near (0, -6), which is six metres from that
   * origin — comfortably inside CLOSE_THRESHOLD, which is seven. So on the
   * very first frames all three reported themselves as close AND visible,
   * the Director recorded monsterDistance = 0.30, and the detection meter
   * began filling at 8 per tick against a player standing still at the
   * spawn point thirty-five metres away. At 100 you die, which is 2.5
   * seconds. Found by an automated playthrough that died at (0, 29) before
   * taking a single step.
   *
   * Initialising to SPAWN_POINT fixes the specific coincidence. This flag
   * fixes the class: nothing that can kill the player is allowed to run on
   * a position nobody has actually written yet.
   */
  live: boolean
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
  x: SPAWN_POINT[0],
  y: SPAWN_POINT[1],
  z: SPAWN_POINT[2],
  live: false,
  set: (x, y, z) => set({ x, y, z, live: true }),
  spawnRequestId: 0,
  // Player.tsx watches spawnRequestId and teleports there whenever it
  // changes — used on restart so a death deep in the house doesn't leave
  // the next run starting from that same spot.
  requestSpawn: () => set({ spawnRequestId: get().spawnRequestId + 1 }),
}))
