import { useEffect } from 'react'
import { usePulseStore } from '../lib/usePulse'
import { useCalmRoom, CALM_BAND_BPM, CALM_HOLD_SECONDS } from './calmRoom'
import { useThreat } from './threat'
import { useSession } from './session'

const TICK_S = 0.25

/**
 * One tick of the regulation rule, as a pure function.
 *
 * Extracted for the same reason `stepDetection` was: this decides whether
 * the game's second ending — the one the entire impact claim rests on —
 * can be reached, and it was buried inside a setInterval where nothing
 * could exercise it. The calm-room ending is the single most important
 * thing in the demo video, and until now the only way to check it worked
 * was to genuinely frighten a person and then genuinely calm them down.
 *
 * Returns the new progress and whether that completes the regulation.
 */
export function stepRegulation(args: {
  inCalmRoom: boolean
  regulatedSeconds: number
  bpm: number | null
  baseline: number | null
  tick?: number
}): { regulatedSeconds: number; escaped: boolean; held: boolean } {
  const { inCalmRoom, regulatedSeconds, bpm, baseline, tick = TICK_S } = args
  // Leaving the room drops everything. Deliberately unforgiving: the claim
  // is sustained regulation, not a lucky low reading.
  if (!inCalmRoom) return { regulatedSeconds: 0, escaped: false, held: false }
  // No reading yet is not the same as a bad reading. Hold progress where
  // it is rather than punishing the player for a dropped frame or the
  // moment the estimator is between windows.
  if (bpm == null || baseline == null) {
    return { regulatedSeconds, escaped: false, held: true }
  }
  const inBand = Math.abs(bpm - baseline) <= CALM_BAND_BPM
  const next = inBand ? regulatedSeconds + tick : 0
  return { regulatedSeconds: next, escaped: next >= CALM_HOLD_SECONDS, held: false }
}

/**
 * The whole "impact" claim made mechanical: to finish, you have to
 * actually bring your heart rate down and hold it there — real HRV
 * biofeedback (paced breathing lowering heart rate via vagal tone), not
 * an analogy on an end screen. Leaving the calm room or spiking again
 * resets progress; this is deliberately not forgiving, because the whole
 * point is demonstrating sustained regulation, not a lucky low reading.
 */
export function useCalmRoomLoop() {
  useEffect(() => {
    const interval = setInterval(() => {
      if (useThreat.getState().outcome !== 'playing') return
      const { inCalmRoom, regulatedSeconds, setRegulatedSeconds } = useCalmRoom.getState()

      const { regulatedSeconds: next, escaped, held } = stepRegulation({
        inCalmRoom,
        regulatedSeconds,
        bpm: usePulseStore.getState().bpm,
        baseline: usePulseStore.getState().baseline,
      })
      if (held) return
      if (next !== regulatedSeconds) setRegulatedSeconds(next)

      if (escaped) {
        useThreat.getState().setOutcome('escaped_calm')
        useSession.getState().setStatus('ended')
      }
    }, TICK_S * 1000)

    return () => clearInterval(interval)
  }, [])
}
