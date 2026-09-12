import { useEffect, useState } from 'react'
import { fetchPastRuns, type PastRun } from '../lib/pulseTrace'
import { playerId } from '../lib/playerId'

/**
 * Tiger Data, made visible.
 *
 * Storing the pulse trace is worth nothing to a player who never sees it.
 * This is the payoff: how tonight compared to the last time you sat down —
 * did your resting rate settle, did the house get further under your skin.
 * It's also the closing beat of the demo video, where the claim stops
 * being "we read your pulse" and becomes "we read your pulse, twice, and
 * here's the difference."
 *
 * Renders nothing at all when there's no history or no sidecar — which is
 * the hosted build every judge will play. An empty panel saying "no data"
 * would be worse than no panel.
 */
export function PastRuns() {
  const [runs, setRuns] = useState<PastRun[] | null>(null)

  useEffect(() => {
    let cancelled = false
    // A beat of delay: the current run's tail is flushed as the session
    // ends, and asking before that lands would omit the run just played —
    // the one the player most wants to see.
    const t = setTimeout(() => {
      fetchPastRuns(playerId()).then((r) => {
        if (!cancelled) setRuns(r)
      })
    }, 1200)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [])

  // Two runs is the minimum for a comparison to mean anything.
  if (!runs || runs.length < 2) return null

  const shown = runs.slice(0, 6)
  const peaks = shown.map((r) => Number(r.peak_bpm))
  const maxPeak = Math.max(...peaks)
  const minPeak = Math.min(...peaks)
  const span = Math.max(1, maxPeak - minPeak)

  const current = shown[0]
  const previous = shown[1]
  const peakDelta = Number(current.peak_bpm) - Number(previous.peak_bpm)
  const baseDelta =
    current.baseline != null && previous.baseline != null
      ? Number(current.baseline) - Number(previous.baseline)
      : null

  return (
    <div style={{ maxWidth: 640, width: '100%', marginTop: 26, textAlign: 'left' }}>
      <div style={{ fontSize: 12, letterSpacing: 2, opacity: 0.5, marginBottom: 8 }}>
        THE HOUSE HAS BEEN KEEPING COUNT — {runs.length} RUNS
      </div>

      {shown.map((r, i) => {
        const peak = Number(r.peak_bpm)
        const w = 20 + ((peak - minPeak) / span) * 80
        return (
          <div
            key={r.run_id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontSize: 11,
              opacity: i === 0 ? 1 : 0.45,
              marginBottom: 3,
            }}
          >
            <span style={{ width: 78, opacity: 0.7 }}>
              {i === 0 ? 'tonight' : new Date(r.started_at).toLocaleDateString()}
            </span>
            <span
              style={{
                height: 7,
                width: `${w}%`,
                background: i === 0 ? '#c33' : '#555',
                transition: 'width 400ms',
              }}
            />
            <span style={{ width: 56 }}>{peak.toFixed(0)} bpm</span>
          </div>
        )
      })}

      <p style={{ fontSize: 12, opacity: 0.75, marginTop: 12, lineHeight: 1.6 }}>
        {peakDelta > 2
          ? `It got ${peakDelta.toFixed(0)} bpm further into you than last time.`
          : peakDelta < -2
            ? `You held ${Math.abs(peakDelta).toFixed(0)} bpm steadier than last time.`
            : `Almost exactly where it left you last time.`}
        {baseDelta != null && Math.abs(baseDelta) > 1
          ? baseDelta < 0
            ? ` You also sat down calmer — resting rate down ${Math.abs(baseDelta).toFixed(0)}.`
            : ` You sat down more wound up — resting rate up ${baseDelta.toFixed(0)}.`
          : ''}
      </p>
    </div>
  )
}
