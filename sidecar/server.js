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
let framesIn = 0
let lastFrameUs = 0

// Only ONE connection may supply frames. A reload leaves the old socket
// briefly alive, React's StrictMode mounts twice in dev, and a second game
// tab is easy to open by accident — and interleaving two different video
// streams into one rPPG estimator produces confident nonsense rather than
// an obvious failure. Newest connection wins, since that's the live tab.
let frameSource = null

sdk.on('processingStatus', (s) => {
  const name =
    Object.entries(ProcessingStatus).find(([, v]) => v === s)?.[0] ?? String(s)
  status = name
  console.log('[sidecar] processing status:', name)
})

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
    return
  }
  const name = VALIDATION_NAME[code] ?? code
  console.log(`[sidecar] can't measure: ${VALIDATION_FIX[code] ?? name}`)
  if (hint) console.log('[sidecar]   hint:', hint)
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

sdk.on('error', (code, message, retryable) =>
  console.error('[sidecar] sdk error', code, message, 'retryable=', retryable),
)

const wss = new WebSocketServer({ port: PORT })

// Almost always means a previous sidecar is still running — which is also
// still holding the camera. Unhandled, this prints a Node stack trace and
// looks like the SDK broke, which is exactly the wrong thing to believe.
wss.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[sidecar] port ${PORT} is already in use.`)
    console.error('[sidecar] You already have a sidecar running — switch to')
    console.error('[sidecar] that terminal and press Ctrl+C, then start this again.')
    process.exit(1)
  }
  console.error('[sidecar] websocket server error', err)
  process.exit(1)
})

wss.on('listening', () =>
  console.log(`[sidecar] listening on ws://localhost:${PORT}`),
)

function broadcast(msg) {
  const payload = JSON.stringify(msg)
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(payload)
  }
}

wss.on('connection', (ws) => {
  if (frameSource && frameSource.readyState === 1) {
    console.log('[sidecar] another game tab connected — it is now the frame source')
  } else {
    console.log('[sidecar] game connected — waiting for frames')
  }
  frameSource = ws
  // A new stream means a new clock; let the next frame set the baseline
  // rather than being forced past a stale, much larger timestamp.
  lastFrameUs = 0
  ws.send(JSON.stringify({ type: 'hello', wantFrames: true, lastPulse, lastConfidence }))

  ws.on('message', (data, isBinary) => {
    if (!isBinary) return
    if (ws !== frameSource) return // a superseded tab; ignore its frames
    try {
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data)
      if (buf.length < HEADER_BYTES) return
      const width = buf.readUInt16LE(0)
      const height = buf.readUInt16LE(2)
      let tsUs = buf.readDoubleLE(4)
      const pixels = buf.subarray(HEADER_BYTES)
      if (!width || !height) return
      if (pixels.length < width * height * 4) return

      // The SDK rejects non-monotonic timestamps outright
      // (kNonMonotonicTimestamp). Two frames can land in the same
      // microsecond, and a tab that is throttled and then resumed can
      // deliver slightly out-of-order times, so enforce the invariant here
      // rather than trusting the sender.
      tsUs = Math.round(tsUs)
      if (tsUs <= lastFrameUs) tsUs = lastFrameUs + 1
      lastFrameUs = tsUs

      sdk.sendFrame(pixels, width, height, width * 4, PixelFormat.kRGBA, tsUs)
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


wss.on('listening', () => {
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
    await sdk.destroy()
  } catch {
    /* already gone */
  }
  process.exit(0)
})
