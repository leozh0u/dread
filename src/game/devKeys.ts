import { useEffect } from 'react'
import { usePulseStore } from '../lib/usePulse'
import { useDirector } from './director'
import { useSession } from './session'
import { useThreat } from './threat'
import { CLUES } from './triggers'
import { restartRun } from './restart'

/**
 * Shortcuts for testing and for filming. Not a cheat menu — these exist
 * because two things were making the game impractical to verify:
 *
 * - A full run costs 60s of calibration before anything happens, then a
 *   traverse of the whole maze. Checking "does the ending work" that way
 *   is minutes per attempt, which means it doesn't get checked.
 * - The demo video shouldn't open on a minute of someone sitting still
 *   waiting to be calibrated.
 *
 * Deliberately unbound from anything a player would press by accident.
 *
 *   C — finish calibration now (fakes a baseline from the current pulse)
 *   K — collect every fragment, unlocking the door
 *   J — both, for getting straight to the endgame
 */
export function useDevKeys() {
  useEffect(() => {
    function skipCalibration() {
      // If the previous run already resolved, start a fresh one first.
      // Without this the dev key lands on a finished run and the session
      // refuses to start (see session.ts), which is safe but looks like
      // the key not working — and these keys exist specifically so the
      // demo can be filmed quickly.
      if (useThreat.getState().outcome !== 'playing') restartRun()
      const bpm = usePulseStore.getState().bpm
      // Use the live reading if there is one so the Director's deltas
      // stay meaningful; otherwise a plausible resting rate.
      usePulseStore.getState().setBaseline(bpm ?? 72)
      useDirector.getState().setPhase('STALK')
      useSession.getState().start()
      console.info('[dread] calibration skipped')
    }

    function grantFragments() {
      for (const c of CLUES) useThreat.getState().addClue(c.id)
      console.info('[dread] all fragments granted — door unlocked')
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (e.code === 'KeyC') skipCalibration()
      if (e.code === 'KeyK') grantFragments()
      if (e.code === 'KeyJ') {
        skipCalibration()
        grantFragments()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
