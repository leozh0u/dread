import { usePulseStore } from '../lib/usePulse'
import { useMicStore } from '../lib/useMic'
import { useDirector } from '../game/director'
import { useThreat, CLUES_REQUIRED } from '../game/threat'

/** Debug/atmosphere HUD. Doubles as the legible "here's the mechanic"
 * readout for live judging — a judge watching over your shoulder should
 * be able to tell why they just died from this, not just the screen. */
export function Hud() {
  const bpm = usePulseStore((s) => s.bpm)
  const source = usePulseStore((s) => s.source)
  const baseline = usePulseStore((s) => s.baseline)
  const phase = useDirector((s) => s.phase)
  const noise = useMicStore((s) => s.level)
  const isHidden = useThreat((s) => s.isHidden)
  const detection = useThreat((s) => s.detection)
  const cluesCollected = useThreat((s) => s.cluesCollected.size)
  const outcome = useThreat((s) => s.outcome)

  if (outcome !== 'playing') return null

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
      <div>
        {bpm != null ? `${bpm} bpm` : '-- bpm'} {source !== 'none' && `(${source})`}
      </div>
      {baseline != null && <div style={{ opacity: 0.6 }}>baseline {baseline}</div>}
      <div style={{ marginTop: 4, opacity: 0.7 }}>{phase}</div>

      <div style={{ marginTop: 12, opacity: isHidden ? 1 : 0.5 }}>
        {isHidden ? 'HIDDEN' : 'exposed'}
      </div>
      <div style={{ opacity: 0.7 }}>noise {Math.round(noise * 100)}%</div>
      <div style={{ opacity: 0.7 }}>clues {cluesCollected}/{CLUES_REQUIRED}</div>

      {detection > 0 && (
        <div style={{ marginTop: 8, width: 100, height: 6, background: 'rgba(255,255,255,0.1)' }}>
          <div
            style={{
              width: `${detection}%`,
              height: '100%',
              background: detection > 60 ? '#f33' : '#c33',
            }}
          />
        </div>
      )}
    </div>
  )
}
