import { useEffect, useRef } from 'react'
import { useDirector, type ScareType } from './director'
import { useThreat } from './threat'
import { useMicStore } from '../lib/useMic'
import { useSession } from './session'
import { playScare, playJumpscareSound } from './scareFx'

const TICK_MS = 200
const CLOSE_THRESHOLD = 0.35
/** Normalised distance inside which line of sight stops mattering — it's
 * on top of you. 0.08 of MAX_AUDIBLE_DIST is about 1.6 metres. */
const TOUCHING = 0.08
const NOISE_THRESHOLD = 0.15

const RATE_EXPOSED = 8 // per tick, ~2.5s to death — being seen while it's close is fatal fast
const RATE_NOISY_HIDDEN = 4 // ~5s to death — noise alone is survivable a bit longer
const RATE_DECAY = -6

const JUMPSCARE_COOLDOWN_MS = 6000
const JUMPSCARE_CHANCE = 0.5

const SCARE_TYPES: ScareType[] = ['proximity', 'audio', 'visual', 'absence']

/**
 * One tick of the detection meter, as a pure function.
 *
 * This decides whether the player lives, which makes it the single most
 * consequential piece of logic in the game and the one most worth being
 * able to test without a renderer. `startled` reports that a jumpscare is
 * eligible; the caller owns the cooldown and the dice, since those aren't
 * part of the rule.
 */
export function stepDetection(args: {
  detection: number
  close: boolean
  isHidden: boolean
  noisy: boolean
}): { next: number; startled: boolean } {
  const { detection, close, isHidden, noisy } = args
  if (!close) return { next: detection + RATE_DECAY, startled: false }
  if (!isHidden) return { next: detection + RATE_EXPOSED, startled: false }
  if (noisy) return { next: detection + RATE_NOISY_HIDDEN, startled: true }
  // Hidden and quiet, even with it right there — safe. This is the whole
  // stealth skill the game teaches, so it has to be genuinely reliable.
  return { next: detection + RATE_DECAY, startled: false }
}

/**
 * The stealth layer. Runs independently of the pulse-driven Director
 * (director.ts still owns how OFTEN and how scary encounters are via
 * monsterDistance); this decides whether you SURVIVE one. Two ways to
 * die: be exposed (not hidden) while the monster is close, or be noisy
 * while hidden and close. Hidden + quiet, even close, is safe — that's
 * the whole stealth skill being taught.
 */
export function useThreatLoop() {
  const lastJumpscare = useRef(0)

  useEffect(() => {
    const interval = setInterval(() => {
      const outcome = useThreat.getState().outcome
      if (outcome !== 'playing') return // already resolved, stop ticking
      // No detection/death during calibration — dying before the session
      // has actually 'started' left startedAt null, which sent the
      // player to a broken "not enough data" end screen with no way
      // forward that felt like the game working. Calibration is meant to
      // be the safe, sit-still intro; the stealth mechanic only matters
      // once the real game has begun.
      if (useSession.getState().status !== 'playing') return

      const monsterDistance = useDirector.getState().monsterDistance
      const isHidden = useThreat.getState().isHidden
      const noise = useMicStore.getState().level
      const near = monsterDistance < CLOSE_THRESHOLD
      const noisy = noise > NOISE_THRESHOLD

      // "Close" means close AND able to see you. CLOSE_THRESHOLD is seven
      // metres, and a creature seven metres away through a wall used to
      // kill you exactly as fast as one standing in front of you. That
      // never surfaced while they were stuck on a patrol line and could
      // never approach; now that they navigate the real maze it would be
      // the first thing anyone hit — and dying to something you could not
      // possibly have seen is the least fair death a game can hand out.
      //
      // Within touching distance it still counts regardless: at that range
      // it has hold of you, and arguing about sightlines is absurd.
      const visible = useDirector.getState().monsterVisible
      const close = near && (visible || monsterDistance < TOUCHING)

      const detection = useThreat.getState().detection
      const { next, startled } = stepDetection({ detection, close, isHidden, noisy })

      if (startled) {
        const now = Date.now()
        if (now - lastJumpscare.current > JUMPSCARE_COOLDOWN_MS && Math.random() < JUMPSCARE_CHANCE) {
          lastJumpscare.current = now
          const type = SCARE_TYPES[Math.floor(Math.random() * SCARE_TYPES.length)]
          playScare(type, useDirector.getState().setMonsterDistance)
          playJumpscareSound()
        }
      }

      useThreat.getState().setDetection(next)

      if (next >= 100) {
        useThreat.getState().setOutcome('died')
        useSession.getState().setStatus('ended')
      }
    }, TICK_MS)

    return () => clearInterval(interval)
  }, [])
}
