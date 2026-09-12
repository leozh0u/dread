// DREAD sidecar — runs Presage SmartSpectra and broadcasts pulse over WebSocket.
//
// TWO BUGS MADE THIS LOOK BROKEN, and they masked each other.
//
// 1. The camera. This used to call sdk.useCamera(), which captures in THIS
//    process. A Node process started from a terminal has no macOS camera
//    grant, so AVFoundation opens the device, configures it, logs some
//    warnings about not being able to lock focus — and then delivers zero
//    frames, silently. Measured directly: 0 frames and 0 validation events
//    in 20 seconds. The give-away is that processing status sticks on
//    kStarting forever and never reaches kRunning.
//
//    So frames now come from the BROWSER, over this socket. The browser
//    already holds the camera (the game needs it for blink detection and
//    the fallback estimator) and already has permission, so there is one
//    camera owner instead of two processes fighting for a device only one
//    of them is allowed to open.
//
// 2. The decode. The 'metrics' payload is protobuf. The old code read
//    fields straight off the raw Buffer — `buf?.pulse?.rate?.value` — so
//    it would have reported nothing even with perfect frames. The real
//    path is `cardio.pulseRate`, a SERIES rather than a single value,
//    with confidence as a percentage. (There is also a legacy `Pulse.rate`
//    message in the protobuf, which is a decoy — it is not what arrives.)
//
// Frames arrive as binary messages: a header of uint16 width, uint16
// height, float64 timestamp in microseconds, then packed RGBA. Pulse goes
// back out as JSON.
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:http'
import {
  initTimeseries,
  insertSamples,
  listRuns,
  runTrace,
  timeseriesStatus,
  closeTimeseries,
} from './timeseries.js'
import { WebSocketServer } from 'ws'
import {
  SmartSpectraSDK,
  ProcessingStatus,
  ValidationCode,
  SmartSpectraLogLevel,
  PixelFormat,
  FrameTransform,
  decodeMetrics,
  cardioMetrics,
  breathingMetrics,
} from '@smartspectra/node-sdk'

const HERE = dirname(fileURLToPath(import.meta.url))

/**
 * Read the key from a file rather than requiring an exported env var.
 * Exporting is easy to forget in a fresh shell, and this has to work
 * reliably the night of a demo.
 */
function readKey(name) {
  for (const file of [join(HERE, '.env'), join(HERE, '..', '.env.local')]) {
    if (!existsSync(file)) continue
    const line = readFileSync(file, 'utf8')
      .split('\n')
      .find((l) => l.trim().startsWith(`${name}=`))
    if (line) {
      const v = line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')
      if (v) return v
    }
  }
  return process.env[name] || null
}

// uint16 width, uint16 height, float64 timestamp(µs) — see the frame
// handler below and src/lib/presageBridge.ts, which must agree exactly.
const HEADER_BYTES = 12

const PORT = process.env.DREAD_SIDECAR_PORT || 8787
const API_KEY = readKey('PRESAGE_API_KEY')

// These two are SECRET and must never reach the browser. DREAD is a static
// site, so anything in the client bundle is public forever — that is why
// they live here and are proxied, rather than being VITE_-prefixed.
const BACKBOARD_KEY = readKey('BACKBOARD_API_KEY')
// A connection string carries a password. There is no browser-safe form of
// this, ever — it is read here and nowhere else.
const TIGERDATA_URL = readKey('TIGERDATA_URL')

if (!API_KEY) {
  console.error('[sidecar] No PRESAGE_API_KEY found.')
  console.error('[sidecar] Put it in one of these and re-run:')
  console.error(`[sidecar]   ${join(HERE, '.env')}`)
  console.error(`[sidecar]   ${join(HERE, '..', '.env.local')}`)
  console.error('[sidecar] as:  PRESAGE_API_KEY=your_key_here')
  process.exit(1)
}
console.log('[sidecar] key loaded (%s…)', API_KEY.slice(0, 6))

const sdk = new SmartSpectraSDK({
  apiKey: API_KEY,
  requestedMetrics: [...cardioMetrics, ...breathingMetrics],
  logLevel: SmartSpectraLogLevel.kWarning,
})

// Reverse the code table once so validation codes can be printed by name.
const VALIDATION_NAME = Object.fromEntries(
  Object.entries(ValidationCode).map(([k, v]) => [v, k]),
)

/** Plain-English fixes, because "kFaceTooFar" is not an instruction. */
const VALIDATION_FIX = {
  [ValidationCode.kNoFaceFound]: 'no face detected — sit in front of the camera',
  [ValidationCode.kMultipleFacesFound]: 'more than one face in frame — only one person',
  [ValidationCode.kFaceNotCentered]: 'centre your face in the camera',
  [ValidationCode.kTooDark]: 'TOO DARK — put a lamp on your face (this is the usual one)',
  [ValidationCode.kTooBright]: 'too bright — turn the light down or move off-axis',
  [ValidationCode.kChestNotVisible]: 'sit back so your upper chest is in frame too',
  [ValidationCode.kCameraTuning]: 'camera still auto-adjusting — wait a few seconds',
  [ValidationCode.kFrameRateTooLow]: 'camera frame rate too low — close other camera apps',
  [ValidationCode.kExcessiveMotion]: 'hold still — motion destroys the signal',
  [ValidationCode.kFaceTooClose]: 'lean back from the camera',
  [ValidationCode.kFaceTooFar]: 'lean closer to the camera',
  [ValidationCode.kFaceTooHigh]: 'lower your face in frame',
  [ValidationCode.kFaceTooLow]: 'raise your face in frame',
  [ValidationCode.kFaceNotForward]: 'look straight at the camera',
}

let lastPulse = null
let lastConfidence = 0
let readings = 0
let status = 'starting'
let lastValidation = null
let lastPrintedValidation = null
/**
 * The last validation verdict, kept so it can be replayed to a client
 * that connects afterwards.
 *
 * Validation is broadcast only on CHANGE, because it fires per frame and
 * would otherwise flood the socket. But that means a browser that
 * connects into an already-steady state — the overwhelmingly common case,
 * since the sidecar is started first and the player then opens the game
 * into a room that has been too dark the whole time — never hears the one
 * message that explains why it has no pulse. The state is therefore
 * replayed on connect as well as pushed on change.
 */
let lastValidationMsg = null
let framesIn = 0
/** The clock the SDK sees — ours, always continuous. */
let lastFrameUs = 0
/** The last timestamp the browser sent, for computing deltas. */
let lastSenderUs = 0
/** Anything longer than this is treated as a pause rather than a real
 * inter-frame interval. Comfortably under the SDK's own 2s limit. */
const MAX_FRAME_GAP_US = 500_000
/** 24fps, the rate the browser pump targets. */
const NOMINAL_FRAME_US = 41_666

// Only ONE connection may supply frames. A reload leaves the old socket
// briefly alive, React's StrictMode mounts twice in dev, and a second game
// tab is easy to open by accident — and interleaving two different video
// streams into one rPPG estimator produces confident nonsense rather than
// an obvious failure.
//
// The source is claimed by SENDING, not by connecting. Merely connecting
// was enough at first, which meant a tab sitting on the start screen could
// take the role away from the tab actually streaming, and the sidecar
// would sit there reporting "NO FRAMES" while frames were arriving on the
// other socket. A challenger only takes over if the incumbent has gone
// quiet.
let frameSource = null
let lastFrameAt = 0
const SOURCE_TAKEOVER_MS = 2000

sdk.on('processingStatus', (s) => {
  const name =
    Object.entries(ProcessingStatus).find(([, v]) => v === s)?.[0] ?? String(s)
  status = name
  console.log('[sidecar] processing status:', name)
  broadcast({ type: 'status', status: name })
  if (name === 'kError') recoverSdk('processing status went to kError')
})

/**
 * BRING THE SDK BACK AFTER AN ERROR.
 *
 * Observed live, mid-session, while a real face was being read:
 *
 *   status=kRunning — 26 frames in: sit back so your upper chest is in frame
 *   sdk error 1 SmartSpectra is not in a valid state... retryable=false
 *   processing status: kError
 *
 * Once the graph enters kError it refuses every frame forever, and the
 * sidecar's only response was to log the refusal — once per frame, at
 * 24fps, indefinitely. From the game's side the pulse readout simply says
 * "reading…" for the rest of the session, which is indistinguishable from
 * a signal that has not converged yet. It is the same class of failure as
 * everything else that went wrong in this project: the broken state and
 * the not-yet-working state look identical.
 *
 * The SDK exposes stop/reset/start, so the fix is to actually use them.
 * Debounced, because errors arrive per-frame and tearing the graph down
 * once per frame would be worse than leaving it broken, and capped,
 * because something that fails immediately on every restart is not going
 * to be fixed by restarting it a hundred more times.
 */
let recovering = false
let recoveries = 0
const MAX_RECOVERIES = 5

async function recoverSdk(why) {
  if (recovering) return
  if (recoveries >= MAX_RECOVERIES) return
  recovering = true
  recoveries++
  console.warn(`[sidecar] restarting the SmartSpectra graph (${why}) — attempt ${recoveries}`)
  try {
    try {
      await sdk.stopAsync?.()
    } catch {
      sdk.stop?.()
    }
    sdk.reset?.()
    // A fresh graph means a fresh clock; nothing may carry over from the
    // stream that died, or the first frame lands as a multi-minute jump.
    lastFrameUs = 0
    lastSenderUs = 0
    sdk.useCustomInput(FrameTransform.kNone)
    sdk.start()
    console.log('[sidecar] graph restarted — send frames again')
  } catch (err) {
    console.error('[sidecar] graph restart failed:', err?.message ?? err)
  } finally {
    // Long enough that a persistent fault does not spin, short enough
    // that a transient one costs a second of a demo rather than the run.
    setTimeout(() => {
      recovering = false
    }, 1500)
  }
}

sdk.on('validationStatus', (code, ts, hint) => {
  // This is the SDK telling you why it can't measure. It fires per frame,
  // so print only on change — otherwise it floods the log and becomes
  // exactly as useless as printing nothing. Surfacing it at all is the
  // difference between "it doesn't work" and "sit closer to the lamp",
  // which was the whole reason this was hard to debug.
  lastValidation = code
  if (code === lastPrintedValidation) return
  lastPrintedValidation = code
  if (code === ValidationCode.kOk) {
    console.log('[sidecar] framing OK — measuring')
    lastValidationMsg = { type: 'validation', code, name: 'kOk', fix: null, hint: null }
    broadcast(lastValidationMsg)
    return
  }
  const name = VALIDATION_NAME[code] ?? code
  console.log(`[sidecar] can't measure: ${VALIDATION_FIX[code] ?? name}`)
  if (hint) console.log('[sidecar]   hint:', hint)

  // ...AND TELL THE BROWSER. This was only ever printed to the terminal,
  // which meant the one component that knows exactly why there is no
  // pulse — too dark, no face, sitting too far back, moving too much —
  // was invisible to the person actually sitting in front of the camera.
  // From the game's side the symptom was an indefinite "reading…", with
  // the diagnosis sitting in a window nobody was looking at.
  //
  // That matters well beyond debugging: at judging, someone sits down in
  // a room we did not light and the single most likely failure is
  // kTooDark. The difference between the game saying "TOO DARK — put a
  // lamp on your face" and the game saying nothing is the difference
  // between a demo that recovers and one that just looks broken.
  lastValidationMsg = { type: 'validation', code, name, fix: VALIDATION_FIX[code] ?? null, hint: hint ?? null }
  broadcast(lastValidationMsg)
})

sdk.on('metrics', (buf) => {
  try {
    // The payload is protobuf and MUST be decoded — the previous version
    // read fields straight off the raw Buffer, which silently produced
    // null forever even when metrics were arriving.
    const m = decodeMetrics(buf)
    const series = m?.cardio?.pulseRate
    if (!series?.length) return

    // pulseRate is a series; the last entry is the current estimate.
    const latest = series[series.length - 1]
    if (latest?.value == null) return

    lastPulse = latest.value
    // Confidence is a percentage in [0,100]; the game wants 0..1.
    lastConfidence = (latest.confidence ?? 0) / 100
    readings++
    broadcast({
      type: 'pulse',
      bpm: lastPulse,
      confidence: lastConfidence,
      stable: latest.stable ?? false,
      ts: Date.now(),
    })
  } catch (err) {
    console.error('[sidecar] metrics decode error', err)
  }
})

sdk.on('error', (code, message, retryable) => {
  console.error('[sidecar] sdk error', code, message, 'retryable=', retryable)
  // A non-retryable error is the SDK saying it will not recover on its
  // own. Taking it at its word and rebuilding the graph is the only way
  // back; the alternative is the silent forever-"reading…" above.
  if (retryable === false) recoverSdk(`sdk error ${code}: ${message}`)
})

/**
 * The sidecar is also the game's only trusted server.
 *
 * Two integrations need a secret the browser must never hold:
 *   - Backboard: has no publishable key concept at all. Its docs are
 *     explicit that keys are server-side only, so every memory call has
 *     to be proxied.
 *
 * Both degrade to "unavailable" rather than failing, because the game has
 * to keep working for a judge with no sidecar running.
 */
const ALLOWED_ORIGINS = [/^https?:\/\/localhost(:\d+)?$/, /^https?:\/\/127\.0\.0\.1(:\d+)?$/, /\.github\.io$/]

function corsHeaders(origin) {
  // Echo only origins we recognise. '*' would let any page on the
  // internet drive this process while it's running on Leo's laptop.
  const ok = origin && ALLOWED_ORIGINS.some((re) => re.test(origin))
  return ok
    ? {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Headers': 'content-type',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      }
    : {}
}

function sendJson(res, status, body, origin) {
  res.writeHead(status, { 'content-type': 'application/json', ...corsHeaders(origin) })
  res.end(JSON.stringify(body))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (c) => {
      data += c
      if (data.length > 64 * 1024) reject(new Error('body too large'))
    })
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {})
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', reject)
  })
}

const httpServer = createServer(async (req, res) => {
  const origin = req.headers.origin
  const url = new URL(req.url, `http://localhost:${PORT}`)

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders(origin))
    return res.end()
  }

  try {
    if (url.pathname === '/health') {
      return sendJson(
        res,
        200,
        {
          ok: true,
          pulse: lastPulse,
          confidence: lastConfidence,
          backboard: Boolean(BACKBOARD_KEY),
          tigerdata: timeseriesStatus(),
        },
        origin,
      )
    }

    // Backboard memory proxy — "the house remembers you between sessions".
    if (url.pathname.startsWith('/memory')) {
      if (!BACKBOARD_KEY)
        return sendJson(res, 200, { ok: false, reason: 'no BACKBOARD_API_KEY' }, origin)
      const assistant = readKey('BACKBOARD_ASSISTANT_ID')
      if (!assistant)
        return sendJson(res, 200, { ok: false, reason: 'no BACKBOARD_ASSISTANT_ID' }, origin)

      const base = `https://app.backboard.io/api/assistants/${assistant}/memories`
      const headers = { 'X-API-Key': BACKBOARD_KEY, 'content-type': 'application/json' }

      if (url.pathname === '/memory/remember' && req.method === 'POST') {
        const { content, metadata } = await readBody(req)
        if (!content) return sendJson(res, 400, { ok: false, reason: 'missing content' }, origin)
        const r = await fetch(base, {
          method: 'POST',
          headers,
          body: JSON.stringify({ content, metadata: metadata ?? {} }),
        })
        return sendJson(res, 200, { ok: r.ok, status: r.status }, origin)
      }

      if (url.pathname === '/memory/recall') {
        const query = url.searchParams.get('q') || 'what frightens this player'
        const r = await fetch(`${base}/search`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ query, limit: 10 }),
        })
        if (!r.ok) return sendJson(res, 200, { ok: false, status: r.status }, origin)
        const body = await r.json()
        return sendJson(res, 200, { ok: true, memories: body?.memories ?? body?.data ?? [] }, origin)
      }
    }

    // Tiger Data: the pulse trace, stored as the time series it is.
    if (url.pathname === '/trace/append' && req.method === 'POST') {
      const { samples } = await readBody(req)
      if (!Array.isArray(samples)) return sendJson(res, 400, { ok: false }, origin)
      const written = await insertSamples(samples)
      return sendJson(res, 200, { ok: written > 0, written }, origin)
    }

    if (url.pathname === '/trace/runs') {
      const playerId = url.searchParams.get('playerId')
      if (!playerId) return sendJson(res, 400, { ok: false, reason: 'missing playerId' }, origin)
      const runs = await listRuns(playerId)
      return sendJson(res, 200, { ok: true, runs }, origin)
    }

    if (url.pathname === '/trace/run') {
      const runId = url.searchParams.get('runId')
      if (!runId) return sendJson(res, 400, { ok: false, reason: 'missing runId' }, origin)
      return sendJson(res, 200, { ok: true, trace: await runTrace(runId) }, origin)
    }

    res.writeHead(404, corsHeaders(origin))
    res.end('not found')
  } catch (err) {
    console.error('[sidecar] http error', err.message)
    sendJson(res, 500, { ok: false, reason: err.message }, origin)
  }
})

const wss = new WebSocketServer({ server: httpServer })

// Almost always means a previous sidecar is still running — which is also
// still holding the camera. Unhandled, this prints a Node stack trace and
// looks like the SDK broke, which is exactly the wrong thing to believe.
httpServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[sidecar] port ${PORT} is already in use.`)
    console.error('[sidecar] You already have a sidecar running — switch to')
    console.error('[sidecar] that terminal and press Ctrl+C, then start this again.')
    process.exit(1)
  }
  console.error('[sidecar] websocket server error', err)
  process.exit(1)
})

httpServer.listen(PORT)
httpServer.on('listening', () => {
  console.log(`[sidecar] listening on ws://localhost:${PORT}`)
  console.log(
    `[sidecar] backboard=${BACKBOARD_KEY ? 'ready' : 'no key'}`,
  )
  // Connect in the background — a slow or unreachable database must never
  // delay the game starting.
  initTimeseries(TIGERDATA_URL).then((ok) =>
    console.log(`[sidecar] tigerdata=${ok ? 'ready' : timeseriesStatus()}`),
  )
})

function broadcast(msg) {
  const payload = JSON.stringify(msg)
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(payload)
  }
}

wss.on('connection', (ws) => {
  console.log('[sidecar] game connected — waiting for frames')
  ws.send(JSON.stringify({ type: 'hello', wantFrames: true, lastPulse, lastConfidence }))
  if (lastValidationMsg) ws.send(JSON.stringify(lastValidationMsg))
  ws.send(JSON.stringify({ type: 'status', status }))

  ws.on('message', (data, isBinary) => {
    if (!isBinary) return
    const now = Date.now()
    if (ws !== frameSource) {
      const incumbentGone = !frameSource || frameSource.readyState !== 1
      if (!incumbentGone && now - lastFrameAt < SOURCE_TAKEOVER_MS) return
      frameSource = ws
      // A new stream means a new sender clock. Our own clock keeps
      // running — it must never go backwards — so only the sender
      // baseline is reset, and the next frame contributes one nominal
      // interval rather than the difference between two unrelated clocks.
      lastSenderUs = 0
      console.log('[sidecar] frame source claimed by this connection')
    }
    lastFrameAt = now
    try {
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data)
      if (buf.length < HEADER_BYTES) return
      const width = buf.readUInt16LE(0)
      const height = buf.readUInt16LE(2)
      let tsUs = buf.readDoubleLE(4)
      const pixels = buf.subarray(HEADER_BYTES)
      if (!width || !height) return
      if (pixels.length < width * height * 4) return

      /**
       * TIMESTAMPS ARE REBASED, NOT FORWARDED.
       *
       * The SDK rejects non-monotonic timestamps outright, and it ALSO
       * rejects a forward jump: "SmartSpectra detected a gap between
       * camera frame timestamps", thrown once a gap exceeds two seconds.
       *
       * Both happen constantly in a browser. A backgrounded tab stops
       * firing requestVideoFrameCallback entirely, a reload starts a new
       * clock, and a reconnect resumes one wherever the old one left off.
       * The observed failure was a 365-second gap after the game sat in a
       * background tab — every subsequent frame was refused, so Presage
       * looked permanently broken for the rest of the session even though
       * frames were arriving normally again.
       *
       * Forwarding the sender's clock cannot survive that. So the sidecar
       * keeps its OWN clock and advances it by the frame-to-frame delta,
       * clamped to something a camera could plausibly produce. A pause of
       * any length becomes a single ordinary frame interval, the stream
       * the SDK sees is continuous, and the pulse estimate simply has a
       * hole in it rather than the session dying.
       *
       * Clamping the delta is safe for rPPG here because the estimate is
       * a frequency over a window: a mis-stated interval across a gap
       * slightly distorts one window and then washes out, whereas a
       * refused frame stream produces nothing at all, forever.
       */
      tsUs = Math.round(tsUs)
      let delta = tsUs - lastSenderUs
      if (!Number.isFinite(delta) || delta <= 0 || delta > MAX_FRAME_GAP_US) {
        delta = NOMINAL_FRAME_US
      }
      lastSenderUs = tsUs
      lastFrameUs += delta

      sdk.sendFrame(pixels, width, height, width * 4, PixelFormat.kRGBA, lastFrameUs)
      framesIn++
    } catch (err) {
      // One bad frame must not kill the session mid-demo.
      if (framesIn % 100 === 0) console.error('[sidecar] frame error', err.message)
    }
  })

  ws.on('close', () => {
    if (ws === frameSource) {
      frameSource = null
      console.log('[sidecar] game disconnected')
    }
  })
})


httpServer.on('listening', () => {
  // Deliberately after the port is secured, so a duplicate sidecar that is
  // about to exit never spins up a processing graph on its way out.
  sdk.useCustomInput(FrameTransform.kNone)
  sdk.start()
  console.log('[sidecar] ready. Now open the game — it supplies the camera frames.')
})

/**
 * Say out loud whether this is working. Silence is the thing you need to
 * discover before a demo, not during one, and "frames arriving but no
 * readings" is a completely different problem from "no frames at all".
 */
setInterval(() => {
  if (framesIn === 0) {
    // Distinguishing "the game isn't sending" from "the game is sending but
    // Presage can't read you" is the whole difference between debugging the
    // wiring and debugging the lighting.
    console.warn(
      `[sidecar] status=${status} — NO FRAMES arriving. Open the game and allow the camera.`,
    )
  } else if (readings === 0) {
    const why =
      lastValidation != null && lastValidation !== ValidationCode.kOk
        ? (VALIDATION_FIX[lastValidation] ?? VALIDATION_NAME[lastValidation])
        : 'framing looks fine — Presage needs ~15-30s of steady video before its first reading'
    console.warn(`[sidecar] status=${status} — ${framesIn} frames in, no pulse yet: ${why}`)
  } else {
    console.log(
      `[sidecar] status=${status} — ${framesIn} frames, ${readings} readings, last ${lastPulse?.toFixed(1)} bpm (confidence ${(lastConfidence * 100).toFixed(0)}%)`,
    )
  }
  framesIn = 0
  readings = 0
}, 10_000)

process.on('SIGINT', async () => {
  console.log('\n[sidecar] shutting down')
  try {
    await closeTimeseries()
    await sdk.destroy()
  } catch {
    /* already gone */
  }
  process.exit(0)
})
