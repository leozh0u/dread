import { useEffect } from 'react'
import { usePulseStore } from '../lib/usePulse'
import { useCalmRoom, CALM_BAND_BPM, CALM_HOLD_SECONDS } from './calmRoom'
import { useThreat } from './threat'
import { useSession } from './session'

const TICK_S = 0.25

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
      if (!inCalmRoom) {
        if (regulatedSeconds !== 0) setRegulatedSeconds(0)
        return
      }

      const bpm = usePulseStore.getState().bpm
      const baseline = usePulseStore.getState().baseline
      if (bpm == null || baseline == null) return

      const inBand = Math.abs(bpm - baseline) <= CALM_BAND_BPM
      const next = inBand ? regulatedSeconds + TICK_S : 0
      setRegulatedSeconds(next)

      if (next >= CALM_HOLD_SECONDS) {
        useThreat.getState().setOutcome('escaped')
        useSession.getState().setStatus('ended')
      }
    }, TICK_S * 1000)

    return () => clearInterval(interval)
  }, [])
}
