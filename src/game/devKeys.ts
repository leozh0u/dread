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

/**
 * P — dump the raw pulse signal to the sidecar.
 *
 * Accuracy bugs in the estimator have all been found by *simulating* what
 * a webcam probably does. That approach found the breathing bug and the
 * exposure-drift bug, and it cannot find anything whose cause is the
 * actual picture: the region of interest sitting on hair rather than skin,
 * a face too small in frame after being told to sit back, an auto-exposure
 * loop chasing the very variation being measured.
 *
 * So this posts the real green-channel trace, the ROI rectangle, the video
 * dimensions and a still of what the ROI is looking at, and the sidecar
 * writes it to a file. Reported rate and a manually counted ground truth
 * go alongside it, because a trace without a true answer cannot settle
 * anything.
 *
 * Registered separately from the other dev keys so it works even when a
 * run is not in progress — the signal is being sampled from the moment the
 * camera starts, well before anyone presses BEGIN.
 */
export function usePulseDumpKey() {
  useEffect(() => {
    async function dump() {
      const est = (window as unknown as { __dreadPulse?: { dump: () => unknown; roiSnapshot: () => string | null } })
        .__dreadPulse
      if (!est) {
        console.warn('[dread] no fallback estimator yet — is the camera running?')
        return
      }
      const truth = window.prompt(
        'Counted beats in 15 seconds x 4 = your real bpm.\nLeave blank if you have not counted.',
      )
      const payload = {
        ...(est.dump() as object),
        roiPng: est.roiSnapshot(),
        reported: usePulseStore.getState().bpm,
        confidence: usePulseStore.getState().confidence,
        truth: truth ? Number(truth) : null,
        at: new Date().toISOString(),
      }
      try {
        const res = await fetch('http://localhost:8787/debug/pulse', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const body = await res.json()
        console.info('[dread] pulse trace written:', body)
        alert(`Saved. Reported ${payload.reported ?? '—'} bpm, you counted ${payload.truth ?? '—'}.`)
      } catch (err) {
        console.error('[dread] could not reach the sidecar', err)
        alert('Sidecar not reachable — is it running?')
      }
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (e.code === 'KeyP') void dump()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
