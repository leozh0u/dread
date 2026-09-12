/**
 * Tiger Data (TimescaleDB) — the pulse trace, stored as what it actually is.
 *
 * A heart rate sampled once a second with events marked against it is a
 * time series in the textbook sense, so this isn't a database bolted onto
 * a game to claim a sponsor: it's a hypertable doing the one thing
 * hypertables are for. It also outlives the tab, which the in-memory fear
 * curve doesn't — so "show me my run from last night" becomes possible.
 *
 * LIVES IN THE SIDECAR, NECESSARILY. A connection string contains a
 * password. DREAD is a static site, so a connection string in the bundle
 * is a database handed to the internet. There is no browser-safe version
 * of this and there never will be.
 *
 * Every function fails soft. No connection string, unreachable database,
 * schema not created — the game plays exactly as it does now. A hackathon
 * demo must never die because a database is having a bad night.
 */
import pg from 'pg'

let pool = null
let ready = false
let disabledReason = null

export function timeseriesEnabled() {
  return ready
}

export function timeseriesStatus() {
  if (ready) return 'ready'
  return disabledReason ?? 'not configured'
}

/**
 * Connect and ensure the schema exists.
 *
 * Creating the hypertable here rather than in a migration is deliberate:
 * there is one deployment of this, it runs on a laptop, and a setup step
 * that can be forgotten at 3am is a setup step that will be.
 */
export async function initTimeseries(connectionString) {
  if (!connectionString) {
    disabledReason = 'no TIGERDATA_URL'
    return false
  }
  try {
    pool = new pg.Pool({
      connectionString,
      // Tiger Cloud requires TLS. rejectUnauthorized stays true so this
      // isn't quietly downgraded to an unverified connection.
      ssl: { rejectUnauthorized: true },
      max: 4,
      connectionTimeoutMillis: 8000,
      idleTimeoutMillis: 30_000,
    })

    await pool.query(`
      CREATE TABLE IF NOT EXISTS pulse_samples (
        time        TIMESTAMPTZ      NOT NULL,
        run_id      TEXT             NOT NULL,
        player_id   TEXT             NOT NULL,
        bpm         DOUBLE PRECISION NOT NULL,
        confidence  DOUBLE PRECISION,
        source      TEXT,
        baseline    DOUBLE PRECISION,
        event       TEXT
      )
    `)

    // Idempotent, and tolerated if the Timescale extension isn't present
    // (a plain Postgres still works — it's just a regular table).
    try {
      await pool.query(
        `SELECT create_hypertable('pulse_samples', 'time', if_not_exists => TRUE)`,
      )
    } catch (err) {
      console.warn('[sidecar] hypertable not created (plain Postgres?):', err.message)
    }

    await pool.query(
      `CREATE INDEX IF NOT EXISTS pulse_samples_run_idx ON pulse_samples (run_id, time DESC)`,
    )

    ready = true
    disabledReason = null
    return true
  } catch (err) {
    disabledReason = `connect failed: ${err.message}`
    console.warn('[sidecar] tigerdata disabled —', err.message)
    pool = null
    ready = false
    return false
  }
}

/**
 * Insert a batch of samples.
 *
 * Batched because the game samples about once a second and a round trip
 * per sample would be absurd; one parameterised multi-row INSERT keeps it
 * to a single statement. Parameterised, not interpolated — these values
 * come from the browser.
 */
export async function insertSamples(rows) {
  if (!ready || !pool || !rows?.length) return 0
  const capped = rows.slice(0, 500)
  const values = []
  const params = []
  capped.forEach((r, i) => {
    const b = i * 8
    values.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8})`)
    params.push(
      new Date(r.t ?? Date.now()),
      String(r.runId ?? 'unknown').slice(0, 64),
      String(r.playerId ?? 'anon').slice(0, 64),
      Number(r.bpm),
      r.confidence == null ? null : Number(r.confidence),
      r.source == null ? null : String(r.source).slice(0, 32),
      r.baseline == null ? null : Number(r.baseline),
      r.event == null ? null : String(r.event).slice(0, 64),
    )
  })
  try {
    await pool.query(
      `INSERT INTO pulse_samples (time, run_id, player_id, bpm, confidence, source, baseline, event) VALUES ${values.join(',')}`,
      params,
    )
    return capped.length
  } catch (err) {
    console.warn('[sidecar] tigerdata insert failed:', err.message)
    return 0
  }
}

/**
 * Every run this player has recorded, newest first.
 *
 * This is the query that justifies the whole integration: peak and mean
 * heart rate per run, bucketed server-side, so the game can show someone
 * how tonight compared to last night.
 */
export async function listRuns(playerId, limit = 20) {
  if (!ready || !pool) return []
  try {
    const { rows } = await pool.query(
      `SELECT run_id,
              MIN(time)  AS started_at,
              MAX(time)  AS ended_at,
              MAX(bpm)   AS peak_bpm,
              AVG(bpm)   AS mean_bpm,
              MIN(baseline) AS baseline,
              COUNT(*)   AS samples
         FROM pulse_samples
        WHERE player_id = $1
        GROUP BY run_id
        ORDER BY started_at DESC
        LIMIT $2`,
      [String(playerId).slice(0, 64), Math.min(100, Math.max(1, limit))],
    )
    return rows
  } catch (err) {
    console.warn('[sidecar] tigerdata query failed:', err.message)
    return []
  }
}

/** The trace for one run, downsampled to one point per second. */
export async function runTrace(runId) {
  if (!ready || !pool) return []
  try {
    const { rows } = await pool.query(
      `SELECT time_bucket('1 second', time) AS bucket,
              AVG(bpm) AS bpm,
              MAX(event) AS event
         FROM pulse_samples
        WHERE run_id = $1
        GROUP BY bucket
        ORDER BY bucket ASC`,
      [String(runId).slice(0, 64)],
    )
    return rows
  } catch (err) {
    // time_bucket is Timescale-only; fall back to raw rows on plain PG.
    try {
      const { rows } = await pool.query(
        `SELECT time AS bucket, bpm, event FROM pulse_samples WHERE run_id = $1 ORDER BY time ASC`,
        [String(runId).slice(0, 64)],
      )
      return rows
    } catch {
      console.warn('[sidecar] tigerdata trace failed:', err.message)
      return []
    }
  }
}

export async function closeTimeseries() {
  if (pool) await pool.end().catch(() => {})
  pool = null
  ready = false
}
