import { useEffect, useState } from 'react'
import { useDirector } from './director'
import { useSession } from './session'
import { useThreat } from './threat'
import { usePulseStore } from '../lib/usePulse'
import { recallPriors, rememberRun, bestArm } from '../lib/houseMemory'

/**
 * Connects the Director's bandit to Backboard, so what the house learns
 * about a player outlives the tab.
 *
 * On mount it asks what's already known and seeds the bandit with it; on
 * the run ending it writes back what this run learned. Both directions
 * fail silently — no sidecar, no network, no key and the game is exactly
 * what it is today, just with no past.
 *
 * Returns a line to show the player when the house recognises them, which
 * is the whole payoff: you are told, before anything happens, that it
 * remembers what worked last time.
 */
export function useHouseMemory() {
  const [recognition, setRecognition] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    recallPriors().then((priors) => {
      if (cancelled || !priors) return
      useDirector.getState().seedStats(priors.stats)
      const worst = bestArm(priors.stats)
      setRecognition(
        worst
          ? `The house has met you ${priors.runs} time${priors.runs === 1 ? '' : 's'}. It remembers the ${worst}.`
          : `The house has met you ${priors.runs} time${priors.runs === 1 ? '' : 's'}.`,
      )
      console.info('[dread] house memory recalled', priors)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Write back exactly once, on the transition into 'ended'. Subscribing
  // rather than using a status dependency means a re-render can't cause a
  // second write of the same run.
  useEffect(() => {
    let written = false
    const unsubscribe = useSession.subscribe((s) => {
      if (s.status !== 'ended' || written) return
      written = true
      const history = usePulseStore.getState().history
      rememberRun({
        stats: useDirector.getState().stats,
        outcome: useThreat.getState().outcome,
        peakBpm: history.length ? Math.max(...history.map((h) => h.bpm)) : null,
        baseline: usePulseStore.getState().baseline,
      }).then((ok) => console.info('[dread] house memory written:', ok))
    })
    return unsubscribe
  }, [])

  return recognition
}
