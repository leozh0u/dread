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

/**
 * SIDECAR AVAILABILITY IS TEMPORARY, NOT PERMANENT.
 *
 * This used to be a plain `available = false` latch: the first failed
 * flush disabled trace writing for the entire life of the tab. That was
 * defensible when the sidecar either ran for the whole session or never
 * started — but the SmartSpectra library aborts the process from inside
 * its own threads, and the sidecar is now supervised and comes straight
 * back (see sidecar/run.sh).
 *
 * So the real sequence was: sidecar crashes, one flush fails, the browser
 * gives up forever, sidecar restarts thirty seconds later, and the tab
 * never writes another row. The symptom is a game that displays a live
 * pulse while Tiger Data receives nothing at all, with no error anywhere
 * — which is exactly what happened today, and it silently took out the
 * post-game fear curve and the whole time-series claim with it.
 *
 * Back off instead. Doubling from 15s to a 4-minute ceiling costs almost
 * nothing when the sidecar is genuinely absent, and recovers on its own
 * when it isn't.
 */
const RETRY_BASE_MS = 15_000
const RETRY_MAX_MS = 240_000
let retryDelay = RETRY_BASE_MS
let unavailableUntil = 0

function sidecarUsable() {
  return Date.now() >= unavailableUntil
}

/** Exposed for the diagnostics panel and for tests. */
export function traceStatus() {
  return sidecarUsable()
    ? { ok: true as const, buffered: buffer.length }
    : { ok: false as const, buffered: buffer.length, retryInMs: unavailableUntil - Date.now() }
}

export function startTrace() {
  if (timer) return
  timer = setInterval(flushTrace, FLUSH_INTERVAL_MS)
}

export function stopTrace() {
  if (timer) clearInterval(timer)
  timer = null
}

export function recordSample(s: TraceSample) {
  // Keep buffering even while the sidecar is down. It is capped below, and
  // the samples are the point of the feature — dropping them during an
  // outage means the run's trace has a hole in it even after recovery.
  buffer.push(s)
  // Never let this grow without bound if the sidecar is gone — the samples
  // are only worth keeping if they can actually be written.
  if (buffer.length > MAX_BUFFER) buffer = buffer.slice(-MAX_BUFFER)
}

export async function flushTrace(): Promise<number> {
  if (buffer.length === 0) return 0
  if (!sidecarUsable()) return 0
  const batch = buffer
  buffer = []
  try {
    const res = await fetch(`${SIDECAR}/trace/append`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ samples: batch }),
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) {
      // Reachable but unhappy — put the batch back and back off.
      buffer = batch.concat(buffer).slice(-MAX_BUFFER)
      backOff()
      return 0
    }
    // A success clears the penalty entirely, so one blip during a run
    // does not leave the rest of it on a four-minute retry.
    retryDelay = RETRY_BASE_MS
    unavailableUntil = 0
    const body = (await res.json()) as { written?: number }
    return body.written ?? 0
  } catch {
    // Sidecar isn't running, or there's no database configured. Hold the
    // samples and try again later rather than discarding them.
    buffer = batch.concat(buffer).slice(-MAX_BUFFER)
    backOff()
    return 0
  }
}

function backOff() {
  unavailableUntil = Date.now() + retryDelay
  retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS)
}

/** Testing seam — resets the module's backoff state between cases. */
export function resetTraceState() {
  buffer = []
  retryDelay = RETRY_BASE_MS
  unavailableUntil = 0
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
