import { useEffect, useRef } from 'react'
import { usePulseStore } from '../lib/usePulse'
import { useDirector, AROUSAL, type ScareType } from './director'
import { useSession, SESSION_DURATION_MS } from './session'

const CALIBRATION_MS = 60_000 // Presage HRV baseline window — see plan notes
const TICK_MS = 200

/**
 * Wires live pulse readings to Director phase transitions, and separately
 * ticks the monster's distance every 200ms based on the current phase
 * (approach in STALK, retreat in WITHDRAW/RECOVER). Mount once at the
 * game root. Pure side-effect hook — no rendering.
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
  const setMonsterDistance = useDirector((s) => s.setMonsterDistance)
  const sessionStatus = useSession((s) => s.status)
  const sessionStart = useSession((s) => s.start)
  const sessionSetStatus = useSession((s) => s.setStatus)

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

  // --- Session timer: fixed 90s ritual, matches live-judging constraints ---
  useEffect(() => {
    if (sessionStatus !== 'playing') return
    const timer = setTimeout(() => sessionSetStatus('ended'), SESSION_DURATION_MS)
    return () => clearTimeout(timer)
  }, [sessionStatus, sessionSetStatus])

  // --- Post-calibration: react to arousal relative to baseline ---
  useEffect(() => {
    if (phase === 'CALIBRATING' || bpm == null || baseline == null) return
    const delta = bpm - baseline

    if (pendingScare.current && Date.now() - pendingScare.current.firedAt > 12_000) {
      recordScareOutcome(pendingScare.current.type, pendingScare.current.bpmBefore, bpm)
      pendingScare.current = null
    }

    if (phase === 'STALK' && delta < AROUSAL.RECOVERED_DELTA) {
      setPhase('STRIKE')
      const type = pickScare()
      pendingScare.current = { type, bpmBefore: bpm, firedAt: Date.now() }
      onScare(type)
      setPhase('WITHDRAW')
    } else if (phase === 'WITHDRAW' && delta > AROUSAL.SCARED_DELTA) {
      setPhase('WITHDRAW')
    } else if (phase === 'WITHDRAW' && delta <= AROUSAL.SCARED_DELTA) {
      setPhase('RECOVER')
    } else if (phase === 'RECOVER' && delta < AROUSAL.RECOVERED_DELTA) {
      setPhase('STALK')
    }
  }, [bpm, baseline, phase, setPhase, pickScare, onScare, recordScareOutcome])

  // --- Continuous monster movement, independent of pulse cadence ---
  useEffect(() => {
    if (sessionStatus !== 'playing') return
    const interval = setInterval(() => {
      const d = useDirector.getState().monsterDistance
      const p = useDirector.getState().phase
      if (p === 'STALK') setMonsterDistance(d - 0.008)
      else if (p === 'WITHDRAW') setMonsterDistance(d + 0.02)
      else if (p === 'RECOVER') setMonsterDistance(d + 0.006)
    }, TICK_MS)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStatus])

  return { monsterDistance }
}
