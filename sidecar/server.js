// DREAD sidecar — reads pulse via Presage SmartSpectra, broadcasts over WebSocket.
// Kept out of the game process on purpose: if this dies, the game keeps running
// on the naive rPPG fallback computed in-browser (see src/lib/fallbackPulse.ts).
import { WebSocketServer } from 'ws'
import { SmartSpectraSDK, cardioMetrics, breathingMetrics } from '@smartspectra/node-sdk'

const PORT = process.env.DREAD_SIDECAR_PORT || 8787
const API_KEY = process.env.PRESAGE_API_KEY

if (!API_KEY) {
  console.error('[sidecar] Missing PRESAGE_API_KEY. Get one free at physiology.presagetech.com')
  console.error('[sidecar] export PRESAGE_API_KEY=... then re-run.')
  process.exit(1)
}

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
      broadcast({ type: 'pulse', bpm: pulse, confidence, ts: Date.now() })
    }
  } catch (err) {
    console.error('[sidecar] metrics parse error', err)
  }
})

sdk.on('error', (err) => console.error('[sidecar] sdk error', err))

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
