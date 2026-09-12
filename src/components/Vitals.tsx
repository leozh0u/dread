import { useEffect, useState } from 'react'
import { usePulseStore } from '../lib/usePulse'
import { useBlinkStore } from '../lib/useBlinkDetection'
import { useSensorStatus } from '../lib/sensorStatus'
import { useSession } from '../game/session'
import { useSensorless } from '../game/sensorless'

/**
 * What the house can currently see of you.
 *
 * The whole premise is that this game reads a living nervous system off a
 * webcam, and until now none of that was visible: the HUD showed a bpm
 * number and nothing else, so a dead camera, a face model that failed to
 * load, and a pulse that simply hadn't converged yet were all the same
 * experience — a number that didn't move.
 *
 * Always up during calibration, because that minute IS this panel: you
 * sit still and watch it find you. After that it collapses to the corner
 * and can be toggled with B, since a diagnostic readout competing with
 * the dark would cost more atmosphere than it's worth.
 *
 * It doubles as the demo video's opening shot for the same reason it
 * works here — "it's reading me" is a claim, watching it read you is
 * evidence.
 */
export function Vitals() {
  const [open, setOpen] = useState(true)
  const status = useSession((s) => s.status)
  const bpm = usePulseStore((s) => s.bpm)
  const source = usePulseStore((s) => s.source)
  const confidence = usePulseStore((s) => s.confidence)
  const baseline = usePulseStore((s) => s.baseline)
  const eyesClosed = useBlinkStore((s) => s.eyesClosed)
  const faceTracking = useBlinkStore((s) => s.faceTracking)
  const startle = useBlinkStore((s) => s.startle)
  const framesSent = useSensorStatus((s) => s.framesSent)
  const sidecar = useSensorStatus((s) => s.sidecarConnected)
  const blind = useSensorless((s) => s.blind)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyB' && !e.repeat) setOpen((v) => !v)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const calibrating = status === 'calibrating'
  if (!open && !calibrating) return null

  return (
    <div
      style={{
        position: 'fixed',
        left: 16,
        bottom: 16,
        zIndex: 26,
        fontFamily: 'monospace',
        fontSize: 11,
        letterSpacing: 1,
        color: '#c33',
        background: 'rgba(0,0,0,0.55)',
        border: '1px solid rgba(204,51,51,0.25)',
        padding: '10px 14px',
        minWidth: 208,
        pointerEvents: 'none',
      }}
    >
      <div style={{ opacity: 0.45, marginBottom: 6 }}>WHAT IT CAN SEE · B</div>

      <Row label="CAMERA" ok={framesSent > 0} value={framesSent > 0 ? 'live' : 'waiting'} />
      <Row
        label="LINK"
        ok={sidecar}
        value={sidecar ? 'presage' : 'local only'}
        // Not a failure: the in-browser estimator is the designed
        // fallback, and it's what every judge on the hosted build uses.
        neutral={!sidecar}
      />
      <Row label="FACE" ok={faceTracking} value={faceTracking ? 'tracked' : 'searching'} />
      <Row
        label="EYES"
        ok={!eyesClosed}
        value={eyesClosed ? 'CLOSED' : 'open'}
        alert={eyesClosed}
      />
      <Row
        label="PULSE"
        ok={bpm != null}
        value={bpm != null ? `${bpm} bpm ${source === 'presage' ? '·p' : '·l'}` : 'reading…'}
      />

      <Bar label="conf" v={confidence} />
      <Bar label="startle" v={startle} alert />

      {baseline != null && (
        <div style={{ opacity: 0.4, marginTop: 5 }}>resting {baseline} bpm</div>
      )}
      {blind && (
        <div style={{ opacity: 0.75, marginTop: 7, maxWidth: 190, lineHeight: 1.45, color: '#ff5a5a' }}>
          It can't see you. It's hunting blind — allow camera access and
          reload to play it properly.
        </div>
      )}
      {calibrating && !blind && (
        <div style={{ opacity: 0.5, marginTop: 6, maxWidth: 190, lineHeight: 1.45 }}>
          Sit still. Face the light. It's learning what calm looks like on you.
        </div>
      )}
    </div>
  )
}

function Row({
  label,
  value,
  ok,
  alert,
  neutral,
}: {
  label: string
  value: string
  ok: boolean
  alert?: boolean
  neutral?: boolean
}) {
  const colour = alert ? '#ff5a5a' : neutral ? '#8a8a8a' : ok ? '#c33' : '#6a6a6a'
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 2 }}>
      <span style={{ opacity: 0.5 }}>{label}</span>
      <span style={{ color: colour, opacity: ok || alert ? 0.95 : 0.55 }}>{value}</span>
    </div>
  )
}

/** A 0-1 meter. Width is fine to animate here — it's a handful of pixels
 * on an absolutely-positioned overlay, not a layout the page depends on,
 * and a transform-scaled bar would blur its own border. */
function Bar({ label, v, alert }: { label: string; v: number; alert?: boolean }) {
  const pct = Math.round(Math.max(0, Math.min(1, v)) * 100)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
      <span style={{ opacity: 0.4, width: 46 }}>{label}</span>
      <span style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.09)' }}>
        <span
          style={{
            display: 'block',
            height: '100%',
            width: `${pct}%`,
            background: alert && pct > 40 ? '#ff5a5a' : '#c33',
          }}
        />
      </span>
    </div>
  )
}
