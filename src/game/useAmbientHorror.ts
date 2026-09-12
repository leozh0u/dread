import { useEffect } from 'react'
import { pointAtArcLength, PATH_TOTAL_LENGTH } from './maze'
import { playCreak, playScratch, playSpatialSfx, getListenerForward } from './scareFx'
import { useSession } from './session'
import { useDirector } from './director'
import { usePlayerPosition } from './playerPosition'
import { usePulseStore } from '../lib/usePulse'
import { arousalFrom } from './arousal'
import type { SfxName } from './sfxBank'

/**
 * AMBIENT DREAD — the house making noise around you.
 *
 * This used to fire one sound every 35–80 seconds from a rotation of
 * five. A run lasts a few minutes, so a player heard maybe three noises
 * in a whole playthrough, and there was a decent chance all three were
 * the same clip. The house read as empty rather than haunted, which is
 * the opposite of the entire point.
 *
 * Three things changed.
 *
 * FASTER. The base interval is now single-digit seconds. "Sparse is
 * scarier" is true of the *big* moments and false of room tone; what
 * actually makes a space feel inhabited is small sounds arriving often
 * enough that you stop being able to dismiss any one of them.
 *
 * WIDER. Every one-shot in the bank is in the rotation now, not five of
 * them — including the creature vocalisations played from far away and
 * muffled, so you hear something that is clearly alive and clearly not
 * where you are. Each pick also gets a small random pitch shift, so the
 * same clip twice in a row is not the same sound twice in a row, and the
 * immediately previous sound is excluded outright.
 *
 * CLOSER. Sounds used to be placed somewhere along the maze path, which
 * is usually far away and behind geometry. A fraction of them now land
 * within a few metres of the player, behind them by preference. This is
 * the one that actually makes people flinch.
 */

// Cadence, before the Director's multiplier. Randomised within the band
// every time so it never becomes a rhythm you can feel coming.
const MIN_DELAY_MS = 7_000
const MAX_DELAY_MS = 19_000

/**
 * THE DIRECTOR'S THESIS, EXPRESSED IN SOUND.
 *
 * The whole design claim is that the house escalates when you are calm
 * and withdraws when you are frightened. That was true of the monster
 * and not of the audio, which ran at a constant rate regardless.
 *
 * These multiply the delay, so a number below 1 means *more often*:
 *
 *   CALIBRATING — the cold open. Nearly silent; the minute of stillness
 *                 works because nothing happens in it.
 *   STALK       — you are being crowded. Noise everywhere.
 *   STRIKE      — maximum pressure.
 *   WITHDRAW    — the house backs off. This is not a bug: the silence
 *                 after a scare is what makes the next one land, and it
 *                 is the audible proof that it responded to your pulse.
 *   RECOVER     — creeping back in.
 */
const PHASE_RATE: Record<string, number> = {
  CALIBRATING: 3.2,
  STALK: 0.85,
  STRIKE: 0.55,
  WITHDRAW: 2.4,
  RECOVER: 1.25,
}

/**
 * One entry in the rotation.
 *
 * `weight` is relative likelihood. `near` means it may be placed close to
 * the player rather than off in the maze — reserved for sounds that are
 * plausible right behind you. A shriek from two metres away is a
 * different event from a shriek down a corridor, and only some of these
 * survive being that close without reading as a bug.
 *
 * `gain` and `y` are per-sound because they were recorded at different
 * levels and belong at different heights — a light fitting flickers
 * overhead, something drags along the floor.
 */
type Ambient = {
  name: SfxName
  weight: number
  gain: number
  y: number
  near?: boolean
}

const BANK: Ambient[] = [
  // Structural — the building itself.
  { name: 'scratch', weight: 10, gain: 0.8, y: 1.2, near: true },
  { name: 'door-groan', weight: 9, gain: 0.7, y: 1.5 },
  { name: 'flicker', weight: 7, gain: 0.5, y: 2.6 },
  // Something alive, elsewhere. These carry most of the dread: they are
  // creature sounds with no creature attached to them, so they cannot be
  // reasoned about the way a visible monster can.
  { name: 'long-presence', weight: 8, gain: 0.55, y: 1.8 },
  { name: 'long-near', weight: 5, gain: 0.6, y: 1.8, near: true },
  { name: 'crawler-skitter', weight: 8, gain: 0.6, y: 0.4, near: true },
  { name: 'crawler-shriek', weight: 3, gain: 0.5, y: 0.8 },
  { name: 'smile-drag', weight: 6, gain: 0.6, y: 0.5, near: true },
  { name: 'smile-laugh', weight: 4, gain: 0.5, y: 1.6 },
  // Voice. Rare on purpose — the house speaking is a bigger event than
  // the house creaking, and it stops being one if it happens constantly.
  { name: 'vo-not-alone', weight: 2, gain: 0.45, y: 1.7, near: true },
  { name: 'vo-still-here', weight: 2, gain: 0.45, y: 1.7, near: true },
  { name: 'vo-breathe', weight: 2, gain: 0.4, y: 1.7, near: true },
]

const TOTAL_WEIGHT = BANK.reduce((sum, a) => sum + a.weight, 0)

/**
 * Weighted pick that never returns the same sound twice running.
 *
 * Exported and pure so the distribution can be tested. The repeat ban
 * matters more than it looks: with twelve entries and an eight-second
 * cadence, an unconstrained random pick produces an audible double
 * roughly every two minutes, and a repeated horror sound immediately
 * reads as a glitch rather than a haunting.
 */
export function pickAmbient(roll: number, exclude: SfxName | null): Ambient {
  const pool = exclude ? BANK.filter((a) => a.name !== exclude) : BANK
  const total = exclude ? pool.reduce((s, a) => s + a.weight, 0) : TOTAL_WEIGHT
  let target = roll * total
  for (const entry of pool) {
    target -= entry.weight
    if (target <= 0) return entry
  }
  return pool[pool.length - 1]
}

/**
 * How long to wait before the next sound, given where the Director is and
 * how worked up the player is.
 *
 * Arousal stretches the gap on top of the phase: a frightened player gets
 * a quieter house even within STALK. Capped at 2x so it never goes fully
 * silent and leaves someone wondering whether the audio broke.
 *
 * Pure, so the cadence can be asserted on rather than listened to.
 */
export function ambientDelay(args: {
  phase: string
  arousal: number
  roll: number
}): number {
  const { phase, arousal, roll } = args
  const base = MIN_DELAY_MS + roll * (MAX_DELAY_MS - MIN_DELAY_MS)
  const phaseRate = PHASE_RATE[phase] ?? 1
  const arousalRate = 1 + Math.max(0, Math.min(1, arousal))
  return base * phaseRate * arousalRate
}

/**
 * Where to put it.
 *
 * Far sounds go somewhere along the maze's own corridors, so the position
 * is always somewhere a thing could actually be, and are marked occluded
 * — quieter and duller, as though through a wall.
 *
 * Near sounds are placed on a ring a few metres from the player, biased
 * to the rear hemisphere. Kept off the player's exact position so the
 * panner still has a direction to work with; a sound at distance zero
 * pans to nowhere and just sounds like it is inside your head, which is a
 * different and much cheaper effect.
 */
export function ambientPlacement(args: {
  near: boolean
  px: number
  pz: number
  /** The direction the player is looking, on the horizontal plane. Near
   * sounds are placed relative to THIS, not to world axes — see below. */
  fx: number
  fz: number
  arc: number
  angleRoll: number
  radiusRoll: number
}): { x: number; z: number; occluded: boolean } {
  const { near, px, pz, fx, fz, arc, angleRoll, radiusRoll } = args
  if (!near) {
    const p = pointAtArcLength(arc)
    return { x: p.x, z: p.z, occluded: true }
  }
  /**
   * Behind the PLAYER, not behind the origin.
   *
   * The first version of this biased toward +z and called it "rear",
   * which is only true while the player happens to be facing -z. Spun
   * ninety degrees — which is most of the time — it placed sounds off to
   * one side, and the whole point of a near sound is that it comes from
   * where you are not looking.
   *
   * Build the ring in the player's own frame instead: offset is measured
   * from the backward vector, spread over ±100°, so the sound is always
   * somewhere in the rear two-thirds of the space around them.
   */
  const len = Math.hypot(fx, fz) || 1
  const backAngle = Math.atan2(-fz / len, -fx / len)
  const spread = (angleRoll - 0.5) * (Math.PI * 1.11)
  const angle = backAngle + spread
  const radius = 2.5 + radiusRoll * 3.5
  return {
    x: px + Math.cos(angle) * radius,
    z: pz + Math.sin(angle) * radius,
    occluded: false,
  }
}

/** Roughly a fifth of sounds land near the player. Enough to keep you
 * from settling; rare enough that it stays startling. */
const NEAR_CHANCE = 0.22

export function useAmbientHorror() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    let lastPlayed: SfxName | null = null

    function currentArousal() {
      const { bpm, baseline } = usePulseStore.getState()
      if (bpm == null || baseline == null) return 0
      return arousalFrom(bpm - baseline, null)
    }

    function scheduleNext() {
      const delay = ambientDelay({
        phase: useDirector.getState().phase,
        arousal: currentArousal(),
        roll: Math.random(),
      })
      timer = setTimeout(fire, delay)
    }

    function fire() {
      if (useSession.getState().status === 'playing') {
        // The two synthesised one-shots stay in the rotation at a low
        // rate. They are generated fresh each time rather than being a
        // fixed recording, so they are the one thing here that can never
        // become familiar.
        if (Math.random() < 0.12) {
          const p = pointAtArcLength(Math.random() * PATH_TOTAL_LENGTH)
          if (Math.random() < 0.5) playCreak(p.x, 1.5, p.z)
          else playScratch(p.x, 1.2, p.z)
        } else {
          const entry = pickAmbient(Math.random(), lastPlayed)
          lastPlayed = entry.name
          const near = Boolean(entry.near) && Math.random() < NEAR_CHANCE
          const forward = getListenerForward()
          const { x, z, occluded } = ambientPlacement({
            near,
            px: usePlayerPosition.getState().x,
            pz: usePlayerPosition.getState().z,
            fx: forward.x,
            fz: forward.z,
            arc: Math.random() * PATH_TOTAL_LENGTH,
            angleRoll: Math.random(),
            radiusRoll: Math.random(),
          })
          playSpatialSfx(entry.name, x, entry.y, z, {
            // Close sounds are not just nearer, they are louder — the
            // panner's distance rolloff alone under-sells the jump.
            volume: entry.gain * (near ? 1.25 : 1),
            // ±8% pitch. Small enough to read as the same thing happening
            // again, large enough that it is not the same recording.
            rate: 0.92 + Math.random() * 0.16,
            occluded,
          })
        }
      }
      scheduleNext()
    }

    scheduleNext()
    return () => clearTimeout(timer)
  }, [])
}
