import { useEffect, useRef } from 'react'
import { usePulseStore } from '../lib/usePulse'
import { useDirector, AROUSAL, type ScareType } from './director'

const CALIBRATION_MS = 60_000 // Presage HRV baseline window — see plan notes

/**
 * Wires live pulse readings to Director phase transitions. Mount once at
 * the game root. Pure side-effect hook — no rendering.
 */
export function useDirectorLoop(onScare: (type: ScareType) => void) {
  const bpm = usePulseStore((s) => s.bpm)
  const baseline = usePulseStore((s) => s.baseline)
  const setBaseline = usePulseStore((s) => s.setBaseline)
  const phase = useDirector((s) => s.phase)
  const setPhase = useDirector((s) => s.setPhase)
  const pickScare = useDirector((s) => s.pickScare)
  const recordScareOutcome = useDirector((s) => s.recordScareOutcome)

  const calibrationStart = useRef<number | null>(null)
  const calibrationSamples = useRef<number[]>([])
  const pendingScare = useRef<{ type: ScareType; bpmBefore: number; firedAt: number } | null>(
    null,
  )

  // --- Calibration: first 60s of readings sets resting baseline ---
  useEffect(() => {
    if (phase !== 'CALIBRATING' || bpm == null) return
    if (calibrationStart.current == null) calibrationStart.current = Date.now()
    calibrationSamples.current.push(bpm)

    if (Date.now() - calibrationStart.current >= CALIBRATION_MS) {
      const avg =
        calibrationSamples.current.reduce((a, b) => a + b, 0) / calibrationSamples.current.length
      setBaseline(Math.round(avg))
      setPhase('STALK')
    }
  }, [bpm, phase, setBaseline, setPhase])

  // --- Post-calibration: react to arousal relative to baseline ---
  useEffect(() => {
    if (phase === 'CALIBRATING' || bpm == null || baseline == null) return
    const delta = bpm - baseline

    // Resolve a pending scare's outcome once enough time has passed for
    // the 12s pulse average to reflect it.
    if (pendingScare.current && Date.now() - pendingScare.current.firedAt > 12_000) {
      recordScareOutcome(pendingScare.current.type, pendingScare.current.bpmBefore, bpm)
      pendingScare.current = null
    }

    if (phase === 'STALK' && delta < AROUSAL.RECOVERED_DELTA) {
      // calm — escalate
      setPhase('STRIKE')
      const type = pickScare()
      pendingScare.current = { type, bpmBefore: bpm, firedAt: Date.now() }
      onScare(type)
      setPhase('WITHDRAW')
    } else if (phase === 'WITHDRAW' && delta > AROUSAL.SCARED_DELTA) {
      // still scared — hold off, do nothing, let them stew
      setPhase('WITHDRAW')
    } else if (phase === 'WITHDRAW' && delta <= AROUSAL.SCARED_DELTA) {
      setPhase('RECOVER')
    } else if (phase === 'RECOVER' && delta < AROUSAL.RECOVERED_DELTA) {
      setPhase('STALK')
    }
  }, [bpm, baseline, phase, setPhase, pickScare, onScare, recordScareOutcome])
}
