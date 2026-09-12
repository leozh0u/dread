/**
 * A walk cycle that reads as walking.
 *
 * The first version swung each leg on a plain sine, which is why the
 * creatures still looked wrong even once they had legs that moved: a sine
 * has no stance phase. Both legs are in motion the whole time and neither
 * ever plants, so the body appears to drift over ground it isn't pushing
 * against — it reads as swimming, or as a puppet being slid along.
 *
 * Real walking is asymmetric in time. A foot plants, the body rotates
 * over it while that leg stays put, then it swings through quickly to
 * plant again. So:
 *
 *   stance (0 .. STANCE) — foot planted, leg rotates slowly backwards
 *                          relative to the body as the body passes it
 *   swing  (STANCE .. 1) — foot off the ground, leg swings forward fast
 *
 * Everything else in the body is derived from that one phase, because
 * that's what makes a walk look like one motion rather than several parts
 * animating near each other:
 *
 *   - the body rises twice per cycle (once per footfall) and is LOWEST at
 *     the moment of impact, not highest
 *   - it sways sideways once per cycle, toward whichever foot is carrying
 *   - hips and shoulders counter-rotate against each other
 *   - the head holds still while all of that happens under it
 *
 * All phase-driven and stateless, so it can be shared by creatures with
 * completely different bodies.
 */

/** Fraction of the cycle a foot spends on the ground. Slightly over half
 * per leg, so there's a brief moment with both feet down — which is what
 * separates a walk from a run. */
const STANCE = 0.62

/**
 * Leg angle for one side, in radians, given cycle phase 0..1.
 * `offset` is 0 for one leg and 0.5 for the other.
 */
export function legSwing(phase: number, offset: number, amplitude: number): number {
  const p = (phase + offset) % 1
  if (p < STANCE) {
    // Planted. The leg travels backward through the body's motion,
    // linearly — the body is moving at a steady speed over a fixed foot.
    const t = p / STANCE
    return amplitude * (0.5 - t)
  }
  // Swinging. Fast forward return, eased so it doesn't snap at either end.
  const t = (p - STANCE) / (1 - STANCE)
  return amplitude * (-0.5 + (1 - Math.cos(Math.PI * t)) / 2)
}

/**
 * Knee bend for one side, 0..1. Straight while planted, folded during the
 * swing so the foot clears the floor instead of scything through it.
 */
export function kneeBend(phase: number, offset: number): number {
  const p = (phase + offset) % 1
  if (p < STANCE) return 0
  const t = (p - STANCE) / (1 - STANCE)
  return Math.sin(Math.PI * t)
}

/**
 * Vertical bob. Twice per cycle, and phased so the body is at its LOWEST
 * as a foot lands — weight dropping into the step. Getting this backwards
 * is the single most common reason a walk cycle looks bouncy and wrong.
 */
export function bodyBob(phase: number, amplitude: number): number {
  return -Math.cos(phase * Math.PI * 4) * amplitude * 0.5 - amplitude * 0.5
}

/** Side-to-side weight shift. Once per cycle, toward the carrying foot. */
export function bodySway(phase: number, amplitude: number): number {
  return Math.sin(phase * Math.PI * 2) * amplitude
}

/**
 * Counter-rotation of the shoulders against the hips. Opposite sign to
 * the hips, which is what stops a walking figure looking like it's made
 * of one rigid piece.
 */
export function shoulderTwist(phase: number, amplitude: number): number {
  return -Math.sin(phase * Math.PI * 2) * amplitude
}

export function hipTwist(phase: number, amplitude: number): number {
  return Math.sin(phase * Math.PI * 2) * amplitude
}

/**
 * Advance the phase.
 *
 * Cadence comes from ground speed rather than elapsed time, so a creature
 * that stops has still legs and one that surges takes faster steps. The
 * phase accumulates rather than being sampled, so a change in speed never
 * snaps a limb to a new position mid-step.
 *
 * `strideLength` is how far the body travels per full cycle — bigger
 * creature, longer stride, fewer steps for the same distance.
 */
export function advanceGait(phase: number, speed: number, dt: number, strideLength: number): number {
  return (phase + (speed * dt) / strideLength) % 1
}
