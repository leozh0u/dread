/**
 * Tiger Data — ships the pulse trace to the sidecar for storage.
 *
 * The in-memory fear curve dies with the tab. This makes a run something
 * you can come back to: how did tonight compare to last night, was the
 * baseline lower, did the peak go higher.
 *
 * PROXIED THROUGH THE SIDECAR, necessarily. The connection string carries
 * a password and DREAD is a static site, so there is no browser-safe
 * version of this — a connection string in the bundle is a database handed
 * to the internet.
 *
 * Buffered rather than one request per sample: the game produces a reading
 * roughly once a second for the length of a run, and a round trip each
 * time would be both wasteful and a stutter risk on the thread rendering
 * the game. Flushes on a timer and once more when the run ends.
 */

const SIDECAR = 'http://localhost:8787'
const FLUSH_INTERVAL_MS = 10_000
const MAX_BUFFER = 400

export interface TraceSample {
  t: number
  runId: string
  playerId: string
  bpm: number
  confidence?: number
  source?: string
  baseline?: number | null
  event?: string | null
}

let buffer: TraceSample[] = []
let timer: ReturnType<typeof setInterval> | null = null
let available = true

export function startTrace() {
  if (timer) return
  timer = setInterval(flushTrace, FLUSH_INTERVAL_MS)
}

export function stopTrace() {
  if (timer) clearInterval(timer)
  timer = null
}

export function recordSample(s: TraceSample) {
  if (!available) return
  buffer.push(s)
  // Never let this grow without bound if the sidecar is gone — the samples
  // are only worth keeping if they can actually be written.
  if (buffer.length > MAX_BUFFER) buffer = buffer.slice(-MAX_BUFFER)
}

export async function flushTrace(): Promise<number> {
  if (!available || buffer.length === 0) return 0
  const batch = buffer
  buffer = []
  try {
    const res = await fetch(`${SIDECAR}/trace/append`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ samples: batch }),
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return 0
    const body = (await res.json()) as { written?: number }
    return body.written ?? 0
  } catch {
    // Sidecar isn't running, or there's no database configured. Stop
    // trying rather than retrying forever in the background of a game.
    available = false
    return 0
  }
}

export interface PastRun {
  run_id: string
  started_at: string
  peak_bpm: number
  mean_bpm: number
  baseline: number | null
  samples: number
}

/** Every previous run for this player, newest first. */
export async function fetchPastRuns(playerId: string): Promise<PastRun[]> {
  try {
    const res = await fetch(`${SIDECAR}/trace/runs?playerId=${encodeURIComponent(playerId)}`, {
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return []
    const body = (await res.json()) as { ok?: boolean; runs?: PastRun[] }
    return body.ok && Array.isArray(body.runs) ? body.runs : []
  } catch {
    return []
  }
}
