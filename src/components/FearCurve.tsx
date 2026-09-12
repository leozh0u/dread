import { usePulseStore } from '../lib/usePulse'
import { useDirector } from '../game/director'
import { useSession } from '../game/session'
import { useThreat } from '../game/threat'
import { useCalmRoom } from '../game/calmRoom'
import { restartRun } from '../game/restart'

/**
 * The session-end screen. This is the thing the "impact" beat of the demo
 * video actually points at — not a slide, a real chart of what just
 * happened to your body, with the exact moments the house decided to
 * push or pull marked on it.
 */
export function FearCurve() {
  const history = usePulseStore((s) => s.history)
  const baseline = usePulseStore((s) => s.baseline)
  const scareLog = useDirector((s) => s.scareLog)
  const startedAt = useSession((s) => s.startedAt)
  const outcome = useThreat((s) => s.outcome)
  const regulatedSeconds = useCalmRoom((s) => s.regulatedSeconds)

  if (!startedAt || history.length < 2) {
    return (
      <Overlay>
        <p style={{ opacity: 0.6 }}>Not enough data captured this run.</p>
        <PlayAgainButton />
      </Overlay>
    )
  }

  const t0 = startedAt
  const points = history.filter((h) => h.t >= t0)
  const tEnd = points[points.length - 1]?.t ?? t0 + 1
  const duration = Math.max(1, tEnd - t0)
  const bpms = points.map((p) => p.bpm)
  const minBpm = Math.min(...bpms, baseline ?? 60) - 5
  const maxBpm = Math.max(...bpms, baseline ?? 60) + 5

  const W = 720
  const H = 220
  const xOf = (t: number) => ((t - t0) / duration) * W
  const yOf = (bpm: number) => H - ((bpm - minBpm) / (maxBpm - minBpm)) * H

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xOf(p.t)} ${yOf(p.bpm)}`).join(' ')
  const baselineY = baseline != null ? yOf(baseline) : null

  const scareColor: Record<string, string> = {
    proximity: '#e0a020',
    audio: '#20a0e0',
    visual: '#e02060',
    absence: '#a020e0',
  }

  return (
    <Overlay>
      <h1 style={{ fontSize: 22, letterSpacing: 2, marginBottom: 4 }}>
        {outcome === 'died'
          ? 'IT FOUND YOU'
          : outcome === 'escaped_calm'
            ? 'YOU MADE IT OUT'
            : outcome === 'escaped_door'
              ? 'YOU RAN FOR IT'
              : 'YOUR FEAR, CHARTED'}
      </h1>
      <p style={{ opacity: 0.6, fontSize: 13, marginBottom: 20, maxWidth: 640 }}>
        {outcome === 'escaped_calm'
          ? `You held your heart rate near baseline for ${regulatedSeconds.toFixed(1)}s straight to get that door open. That's the whole trick — everything below is what you had to come down from to do it.`
          : outcome === 'escaped_door'
            ? "You found your way out the moment it opened, no slower than you had to be. Faster escape, less of a story below — that's the tradeoff."
            : 'Every mark below is a moment the house decided to push or pull — based on your pulse, read off your own webcam, nothing worn.'}
      </p>

      <svg width={W} height={H} style={{ background: '#0a0a0a', border: '1px solid #333' }}>
        {baselineY != null && (
          <line x1={0} y1={baselineY} x2={W} y2={baselineY} stroke="#444" strokeDasharray="4 4" />
        )}
        <path d={path} fill="none" stroke="#c33" strokeWidth={2} />
        {scareLog
          .filter((s) => s.t >= t0)
          .map((s, i) => (
            <g key={i}>
              <line
                x1={xOf(s.t)}
                y1={0}
                x2={xOf(s.t)}
                y2={H}
                stroke={scareColor[s.type] ?? '#888'}
                strokeWidth={1}
                opacity={0.5}
              />
              <circle cx={xOf(s.t)} cy={yOf(s.bpmAfter)} r={4} fill={scareColor[s.type] ?? '#888'} />
            </g>
          ))}
      </svg>

      <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 12 }}>
        {Object.entries(scareColor).map(([type, color]) => (
          <span key={type} style={{ color, opacity: 0.85 }}>
            ● {type}
          </span>
        ))}
      </div>

      <div style={{ maxWidth: 640, marginTop: 28, fontSize: 13, lineHeight: 1.6, opacity: 0.85 }}>
        <p>
          What you just played: escalate while you're calm, back off once you spike, strike again
          only after you recover. That push-and-retreat loop is structurally the same thing a
          clinician runs by eye in graded exposure therapy — hold someone at the edge of what they
          can tolerate, not past it.
        </p>
        <p style={{ marginTop: 10 }}>
          We're not claiming this treats anything. What we're showing: that loop, and the sensing
          behind it, used to need a chest-strap heart rate monitor. This ran on the camera your
          laptop already has.
        </p>
      </div>

      <PlayAgainButton />
    </Overlay>
  )
}

function PlayAgainButton() {
  return (
    <button
      onClick={() => restartRun()}
      style={{
        marginTop: 24,
        background: 'transparent',
        border: '1px solid #c33',
        color: '#c33',
        padding: '10px 28px',
        fontFamily: 'monospace',
        fontSize: 14,
        letterSpacing: 2,
        cursor: 'pointer',
      }}
    >
      PLAY AGAIN
    </button>
  )
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.92)',
        color: '#eee',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'monospace',
        zIndex: 20,
        textAlign: 'center',
        padding: 24,
      }}
    >
      {children}
    </div>
  )
}
