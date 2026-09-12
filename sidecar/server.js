// DREAD sidecar — reads pulse via Presage SmartSpectra, broadcasts over WebSocket.
// Kept out of the game process on purpose: if this dies, the game keeps running
// on the naive rPPG fallback computed in-browser (see src/lib/fallbackPulse.ts).
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'
import { SmartSpectraSDK, cardioMetrics, breathingMetrics } from '@smartspectra/node-sdk'

const HERE = dirname(fileURLToPath(import.meta.url))

/**
 * Read the key from a file rather than requiring an exported env var.
 * Exporting a variable is easy to forget and easy to get wrong in a new
 * shell, and this has to work reliably at 3am on the night of a demo.
 * Checks sidecar/.env first, then the project's .env.local (so one file
 * can hold every key), then a real env var.
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

const wss = new WebSocketServer({ port: PORT })
console.log(`[sidecar] listening on ws://localhost:${PORT}`)

const sdk = new SmartSpectraSDK({
  apiKey: API_KEY,
  requestedMetrics: [...cardioMetrics, ...breathingMetrics],
})

let lastPulse = null
let lastConfidence = 0

sdk.on('metrics', (buf) => {
  // Shape depends on SDK decode; guard defensively since this is a hackathon sidecar.
  try {
    const pulse = buf?.pulse?.rate?.value ?? buf?.cardiac?.rate?.value ?? null
    const confidence = buf?.pulse?.rate?.confidence ?? buf?.cardiac?.rate?.confidence ?? 0
    if (pulse != null) {
      lastPulse = pulse
      lastConfidence = confidence
      readings++
      broadcast({ type: 'pulse', bpm: pulse, confidence, ts: Date.now() })
    }
  } catch (err) {
    console.error('[sidecar] metrics parse error', err)
  }
})

sdk.on('error', (err) => console.error('[sidecar] sdk error', err))

// Heartbeat log. Silence from this is the signal that Presage isn't
// producing readings — which is exactly the thing you need to know
// before a demo, not during one.
let readings = 0
setInterval(() => {
  if (readings === 0) {
    console.warn('[sidecar] no pulse readings in the last 10s — check lighting, face in frame, and that the camera is not in use by the browser')
  } else {
    console.log(`[sidecar] ${readings} readings in 10s, last ${lastPulse?.toFixed?.(1) ?? '--'} bpm (confidence ${lastConfidence.toFixed?.(2) ?? lastConfidence})`)
  }
  readings = 0
}, 10_000)

function broadcast(msg) {
  const payload = JSON.stringify(msg)
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(payload)
  }
}

wss.on('connection', (ws) => {
  console.log('[sidecar] client connected')
  ws.send(JSON.stringify({ type: 'hello', lastPulse, lastConfidence }))
})

sdk.useCamera()
sdk.start()
console.log('[sidecar] Presage started, reading camera...')
