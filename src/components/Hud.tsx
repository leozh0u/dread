import { usePulseStore } from '../lib/usePulse'
import { useMicStore } from '../lib/useMic'
import { useDirector } from '../game/director'
import { useThreat, CLUES_REQUIRED } from '../game/threat'
import { useBlinkStore } from '../lib/useBlinkDetection'

/**
 * The HUD carries two jobs at once, which is why it looks the way it does.
 *
 * For the player it has to stay out of the way — this is a horror game,
 * and a dense telemetry panel in the corner kills the atmosphere. So the
 * only permanent element is the pulse readout, and danger is communicated
 * as a screen-edge bleed rather than a progress bar, which reads
 * peripherally without anyone having to look at a number.
 *
 * For a judge watching over a shoulder it has to make the mechanic
 * legible — that the game is reading a real heartbeat off the webcam, and
 * that the monster's behaviour follows from it. Hence the pulse being the
 * hero element, the live source tag, and the baseline shown once
 * calibration establishes it.
 */
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
  const eyesClosed = useBlinkStore((s) => s.eyesClosed)

  if (outcome !== 'playing') return null

  const calibrating = phase === 'CALIBRATING'
  const elevated = bpm != null && baseline != null && bpm - baseline > 8

  return (
    <>
      {/* Danger as a screen-edge bleed rather than a bar — you feel it in
          peripheral vision while still looking where you're going. */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
          boxShadow: `inset 0 0 ${60 + detection * 1.6}px ${detection * 0.5}px rgba(150,10,10,${
            detection / 190
          })`,
          transition: 'box-shadow 180ms linear',
          zIndex: 10,
        }}
      />

      {/* Eyes-closed state gets its own unmistakable treatment — the game
          noticing your eyes are shut is one of its best moments and it
          shouldn't be buried in a corner readout. */}
      {eyesClosed && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            pointerEvents: 'none',
            background: 'rgba(0,0,0,0.55)',
            transition: 'opacity 400ms linear',
            zIndex: 11,
          }}
        />
      )}

      <div
        style={{
          position: 'fixed',
          top: 20,
          left: 22,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          color: '#c33',
          pointerEvents: 'none',
          userSelect: 'none',
          zIndex: 12,
        }}
      >
        {/* Pulse — the hero element. This is the whole conceit of the
            project, so it reads like a monitor, not a stat line. */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span
            style={{
              fontSize: 34,
              fontWeight: 300,
              letterSpacing: 1,
              color: elevated ? '#ff4444' : '#c33',
              textShadow: elevated ? '0 0 18px rgba(255,60,60,0.65)' : '0 0 8px rgba(200,0,0,0.55)',
              transition: 'color 500ms linear',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {bpm ?? '––'}
          </span>
          <span style={{ fontSize: 11, opacity: 0.55, letterSpacing: 2 }}>BPM</span>
        </div>

        <div style={{ fontSize: 10, opacity: 0.4, letterSpacing: 1.5, marginTop: -2 }}>
          {source === 'none' ? 'no signal' : source === 'presage' ? 'presage' : 'webcam rppg'}
          {baseline != null && ` · rest ${baseline}`}
        </div>

        {/* Clue progress as filling marks, not a fraction */}
        <div style={{ display: 'flex', gap: 6, marginTop: 16 }}>
          {Array.from({ length: CLUES_REQUIRED }).map((_, i) => (
            <span
              key={i}
              style={{
                width: 9,
                height: 9,
                transform: 'rotate(45deg)',
                border: '1px solid rgba(204,51,51,0.6)',
                background: i < cluesCollected ? '#e33' : 'transparent',
                boxShadow: i < cluesCollected ? '0 0 10px rgba(238,51,51,0.8)' : 'none',
              }}
            />
          ))}
        </div>

        {/* State line — only what's actually true right now */}
        <div style={{ fontSize: 11, letterSpacing: 2, marginTop: 12, opacity: 0.75 }}>
          {isHidden ? 'HIDDEN' : 'IN THE OPEN'}
          {noise > 0.15 && <span style={{ color: '#ff4444' }}> · LOUD</span>}
        </div>
      </div>

      {/* Objective, bottom-centre, quiet */}
      <div
        style={{
          position: 'fixed',
          bottom: 26,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: 12,
          letterSpacing: 1.5,
          color: '#c33',
          opacity: 0.35,
          pointerEvents: 'none',
          userSelect: 'none',
          zIndex: 12,
        }}
      >
        {calibrating
          ? 'hold still — it is learning what calm looks like on you'
          : cluesCollected < CLUES_REQUIRED
            ? 'find three fragments'
            : 'the door is open'}
      </div>
    </>
  )
}
