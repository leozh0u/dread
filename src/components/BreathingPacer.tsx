import { useEffect, useState } from 'react'
import { useCalmRoom, CALM_HOLD_SECONDS } from '../game/calmRoom'
import { useSensorless } from '../game/sensorless'
import { usePulseStore } from '../lib/usePulse'

const CYCLE_MS = 10_000 // ~6 breaths/min — resonance-frequency breathing,
// the pacing real HRV biofeedback protocols use, not an arbitrary number

/**
 * Shown only inside the calm room. A circle that expands on the in-breath
 * half of the cycle and contracts on the out-breath half; the player
 * doesn't have to follow it, but it's the same pacer real biofeedback
 * apps (HeartMath, Elite HRV) use to slow breathing toward resonance
 * frequency, which is the actual mechanism that lowers heart rate here.
 */
export function BreathingPacer() {
  const [phase, setPhase] = useState(0) // 0-1 across one cycle
  const inCalmRoom = useCalmRoom((s) => s.inCalmRoom)
  const regulatedSeconds = useCalmRoom((s) => s.regulatedSeconds)
  const blind = useSensorless((s) => s.blind)
  const noPulse = usePulseStore((s) => s.bpm) == null
  const bpm = usePulseStore((s) => s.bpm)
  const baseline = usePulseStore((s) => s.baseline)

  useEffect(() => {
    if (!inCalmRoom) return
    let raf: number
    const start = performance.now()
    const tick = (now: number) => {
      setPhase(((now - start) % CYCLE_MS) / CYCLE_MS)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [inCalmRoom])

  if (!inCalmRoom) return null

  // This ending IS the heart-rate mechanic, so without a pulse it can
  // never complete — the loop that grants it requires a reading. Standing
  // in a quiet blue room while nothing whatsoever happens is the single
  // most confusing state in the game, so say what's wrong and point at
  // the exit that does still work.
  if (blind || noPulse) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
          zIndex: 15,
          fontFamily: 'monospace',
          color: '#8fd',
          textAlign: 'center',
          padding: 24,
        }}
      >
        <p style={{ fontSize: 14, letterSpacing: 2, opacity: 0.9 }}>
          THIS DOOR OPENS FOR A HEARTBEAT
        </p>
        <p style={{ fontSize: 12, opacity: 0.6, maxWidth: 420, lineHeight: 1.7, marginTop: 10 }}>
          It can't read yours. Allow camera access and reload to finish this
          way — or go back and take the east exit instead.
        </p>
      </div>
    )
  }

  // 0 -> 0.5 breathe in (grow), 0.5 -> 1 breathe out (shrink)
  const scale = phase < 0.5 ? 0.5 + phase : 1.5 - phase
  const label = phase < 0.5 ? 'in' : 'out'
  const progress = Math.min(1, regulatedSeconds / CALM_HOLD_SECONDS)
  const delta = bpm != null && baseline != null ? bpm - baseline : null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        zIndex: 15,
        fontFamily: 'monospace',
        color: '#8fd',
      }}
    >
      <div
        style={{
          width: 140,
          height: 140,
          borderRadius: '50%',
          border: '1px solid #8fd',
          opacity: 0.5,
          transform: `scale(${scale})`,
          transition: 'transform 0.05s linear',
        }}
      />
      <div style={{ marginTop: 24, fontSize: 13, letterSpacing: 2, opacity: 0.8 }}>{label}</div>
      {delta != null && (
        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.6 }}>
          {delta > 0 ? '+' : ''}
          {delta} bpm from calm
        </div>
      )}
      <div
        style={{
          marginTop: 16,
          width: 200,
          height: 4,
          background: 'rgba(255,255,255,0.1)',
        }}
      >
        <div style={{ width: `${progress * 100}%`, height: '100%', background: '#8fd' }} />
      </div>
    </div>
  )
}
