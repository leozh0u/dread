import { useEffect, useRef } from 'react'
import { useDirector, type ScareType } from './director'
import { useThreat } from './threat'
import { useMicStore } from '../lib/useMic'
import { useSession } from './session'
import { playScare, playJumpscareSound } from './scareFx'

const TICK_MS = 200
const CLOSE_THRESHOLD = 0.35
const NOISE_THRESHOLD = 0.15

const RATE_EXPOSED = 8 // per tick, ~2.5s to death — being seen while it's close is fatal fast
const RATE_NOISY_HIDDEN = 4 // ~5s to death — noise alone is survivable a bit longer
const RATE_DECAY = -6

const JUMPSCARE_COOLDOWN_MS = 6000
const JUMPSCARE_CHANCE = 0.5

const SCARE_TYPES: ScareType[] = ['proximity', 'audio', 'visual', 'absence']

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

      const monsterDistance = useDirector.getState().monsterDistance
      const isHidden = useThreat.getState().isHidden
      const noise = useMicStore.getState().level
      const close = monsterDistance < CLOSE_THRESHOLD
      const noisy = noise > NOISE_THRESHOLD

      const detection = useThreat.getState().detection
      let next = detection

      if (!close) {
        next += RATE_DECAY
      } else if (!isHidden) {
        next += RATE_EXPOSED
      } else if (noisy) {
        next += RATE_NOISY_HIDDEN
        const now = Date.now()
        if (now - lastJumpscare.current > JUMPSCARE_COOLDOWN_MS && Math.random() < JUMPSCARE_CHANCE) {
          lastJumpscare.current = now
          const type = SCARE_TYPES[Math.floor(Math.random() * SCARE_TYPES.length)]
          playScare(type, useDirector.getState().setMonsterDistance)
          playJumpscareSound()
        }
      } else {
        next += RATE_DECAY // hidden and quiet, even though close — safe
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
