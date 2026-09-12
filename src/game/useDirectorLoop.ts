import { useEffect, useRef } from 'react'
import { usePulseStore } from '../lib/usePulse'
import { useDirector, type ScareType } from './director'
import { useSession } from './session'
import { arousalFrom, hasRecovered } from './arousal'

const CALIBRATION_MS = 60_000 // Presage HRV baseline window — see plan notes

/**
 * Wires live pulse readings to Director phase transitions (CALIBRATING ->
 * STALK -> STRIKE -> WITHDRAW -> RECOVER -> ...). Mount once at the game
 * root. Pure side-effect hook — no rendering. Monster.tsx reads `phase`
 * directly to decide where the monster actually goes.
 */
export function useDirectorLoop(onScare: (type: ScareType) => void) {
  const bpm = usePulseStore((s) => s.bpm)
  const baseline = usePulseStore((s) => s.baseline)
  const setBaseline = usePulseStore((s) => s.setBaseline)
  const phase = useDirector((s) => s.phase)
  const setPhase = useDirector((s) => s.setPhase)
  const pickScare = useDirector((s) => s.pickScare)
  const recordScareOutcome = useDirector((s) => s.recordScareOutcome)
  const monsterDistance = useDirector((s) => s.monsterDistance)
  const sessionStart = useSession((s) => s.start)

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
      sessionStart()
    }
  }, [bpm, phase, setBaseline, setPhase, sessionStart])

  // --- Post-calibration: react to arousal relative to baseline ---
  useEffect(() => {
    if (phase === 'CALIBRATING' || bpm == null || baseline == null) return
    const delta = bpm - baseline

    if (pendingScare.current && Date.now() - pendingScare.current.firedAt > 12_000) {
      recordScareOutcome(pendingScare.current.type, pendingScare.current.bpmBefore, bpm)
      pendingScare.current = null
    }

    // Arousal via the MATLAB-solved autonomic model (see arousal.ts and
    // matlab/autonomic_model.m). HRV isn't wired through from the
    // sidecar yet, so this currently runs on HR deviation alone — the
    // model handles that case, it's just less discriminating.
    const arousal = arousalFrom(delta, null)
    const recovered = hasRecovered(delta, null)

    if (phase === 'STALK' && recovered) {
      setPhase('STRIKE')
      const type = pickScare()
      pendingScare.current = { type, bpmBefore: bpm, firedAt: Date.now() }
      onScare(type)
      setPhase('WITHDRAW')
    } else if (phase === 'WITHDRAW' && arousal > 0.6) {
      setPhase('WITHDRAW') // still frightened — stay away, let it land
    } else if (phase === 'WITHDRAW' && arousal <= 0.6) {
      setPhase('RECOVER')
    } else if (phase === 'RECOVER' && recovered) {
      setPhase('STALK')
    }
  }, [bpm, baseline, phase, setPhase, pickScare, onScare, recordScareOutcome])

  // Monster position/movement (and therefore monsterDistance) is now owned
  // by Monster.tsx's per-frame AI — it patrols/hunts/retreats based on
  // `phase` and derives monsterDistance from its real distance to the
  // player, rather than this loop stepping an abstract slider. See
  // Monster.tsx for why: a scripted slider couldn't represent "the thing
  // is somewhere specific in a real corridor," which is what let it patrol
  // back and forth and made hiding in a room actually matter.

  return { monsterDistance }
}
