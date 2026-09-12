import { useThreat } from './threat'
import { useCalmRoom } from './calmRoom'
import { useDirector } from './director'
import { useSession } from './session'
import { usePulseStore } from '../lib/usePulse'
import { usePlayerPosition } from './playerPosition'

/**
 * Resets everything needed for another run, without a page reload and
 * without re-running the 60s calibration if we already have a baseline —
 * live judging happens 3-4 times back to back and can't afford a full
 * minute of silence before every attempt. The bandit's learned stats
 * (director.ts) deliberately survive a restart: the house is supposed to
 * remember you.
 */
export function restartRun() {
  useThreat.getState().reset()
  useCalmRoom.getState().reset()
  useDirector.getState().resetForNewRun()
  usePlayerPosition.getState().requestSpawn()

  const hasBaseline = usePulseStore.getState().baseline != null
  if (hasBaseline) {
    useDirector.getState().setPhase('STALK')
    useSession.getState().start() // skip straight to 'playing'
  } else {
    useDirector.getState().setPhase('CALIBRATING')
    useSession.getState().setStatus('calibrating')
  }
}
