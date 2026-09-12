import { usePulseStore } from '../lib/usePulse'
import { useDirector } from '../game/director'

/** Debug/atmosphere HUD — pulse readout doubles as the "the house is
 * listening to you" framing during calibration, and as the fear-trace
 * seed for the post-game screen later. */
export function Hud() {
  const bpm = usePulseStore((s) => s.bpm)
  const source = usePulseStore((s) => s.source)
  const baseline = usePulseStore((s) => s.baseline)
  const phase = useDirector((s) => s.phase)

  return (
    <div
      style={{
        position: 'fixed',
        top: 16,
        left: 16,
        fontFamily: 'monospace',
        color: '#c33',
        fontSize: 14,
        letterSpacing: 1,
        textShadow: '0 0 6px rgba(200,0,0,0.6)',
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    >
      <div>{bpm != null ? `${bpm} bpm` : '-- bpm'} {source !== 'none' && `(${source})`}</div>
      {baseline != null && <div style={{ opacity: 0.6 }}>baseline {baseline}</div>}
      <div style={{ marginTop: 4, opacity: 0.7 }}>{phase}</div>
    </div>
  )
}
