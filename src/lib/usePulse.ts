import { useEffect, useRef } from 'react'
import { create } from 'zustand'
import { FallbackPulseEstimator } from './fallbackPulse'
import { PresageFrameSender } from './presageBridge'

export type PulseSource = 'presage' | 'fallback' | 'none'

interface PulseState {
  bpm: number | null // smoothed — this is what the Director and HUD read
  rawBpm: number | null // last unsmoothed reading, debug only
  confidence: number
  source: PulseSource
  baseline: number | null // resting HR, set after calibration
  history: { t: number; bpm: number }[]
  setReading: (bpm: number, confidence: number, source: PulseSource) => void
  setBaseline: (bpm: number) => void
}

// Hearts don't jump 15bpm between frames. Raw rPPG output does, constantly —
// especially the in-browser fallback estimator, which re-runs its frequency
// scan from scratch every frame with no memory of the last reading. Two
// layers fix this: (1) clamp how far a single new reading is allowed to move
// the smoothed value, so one bad frame can't swing the Director's decision,
// then (2) an exponential moving average on top of that, so the number on
// screen settles instead of flickering. Fallback gets heavier smoothing than
// Presage because it's the noisier of the two sources.
const MAX_STEP_BPM = { presage: 6, fallback: 4 } as const
const EMA_ALPHA = { presage: 0.35, fallback: 0.15 } as const

export const usePulseStore = create<PulseState>((set, get) => ({
  bpm: null,
  rawBpm: null,
  confidence: 0,
  source: 'none',
  baseline: null,
  history: [],
  setReading: (rawBpm, confidence, source) => {
    const prev = get().bpm
    const maxStep = MAX_STEP_BPM[source === 'presage' ? 'presage' : 'fallback']
    const alpha = EMA_ALPHA[source === 'presage' ? 'presage' : 'fallback']

    let clamped = rawBpm
    if (prev != null) {
      const delta = rawBpm - prev
      clamped = prev + Math.max(-maxStep, Math.min(maxStep, delta))
    }
    const smoothed = prev == null ? clamped : prev * (1 - alpha) + clamped * alpha
    const bpm = Math.round(smoothed)

    const history = [...get().history, { t: Date.now(), bpm }].slice(-600) // ~keep last 10min @1hz
    set({ bpm, rawBpm, confidence, source, history })
  },
  setBaseline: (bpm) => set({ baseline: bpm }),
}))

const SIDECAR_URL = 'ws://localhost:8787'

/**
 * How long to let the sidecar prove itself before falling back.
 *
 * Connecting is not the same as working: Presage needs roughly 15-30s of
 * steady video before its first estimate, and it can also simply fail to
 * read someone (bad light, glasses, motion). Without this, a connected but
 * silent sidecar means the HUD shows no pulse at all and the Director gets
 * nothing to act on — which during judging looks exactly like the whole
 * game is broken. So: connect, send frames, and if no reading has arrived
 * by the time calibration would need one, start the in-browser estimator
 * alongside it. If Presage then speaks up, it wins.
 */
const PRESAGE_GRACE_MS = 35_000

/**
 * Presage dropping out mid-run is the EXPECTED failure, not a rare one:
 * motion corrupts rPPG, and the player moves most at exactly the moment
 * the reading matters — when something just scared them. So treat a gap in
 * readings as a signal to bring the fallback back up, rather than letting
 * the Director run on a heart rate that stopped updating several scares
 * ago. Presage's own window is ~12s, so this has to be comfortably longer
 * than that or it would trip during normal operation.
 */
const PRESAGE_STALE_MS = 20_000

/**
 * Owns the pulse pipeline for the whole app. Prefers the Presage sidecar;
 * falls back to in-browser rPPG if the socket never connects or drops.
 * Mount this once, near the root, with the webcam <video> element.
 */
export function usePulseSource(videoRef: React.RefObject<HTMLVideoElement | null>) {
  const setReading = usePulseStore((s) => s.setReading)
  const fallbackRef = useRef<FallbackPulseEstimator | null>(null)
  const usingFallbackRef = useRef(false)
  const rafRef = useRef<number>(0)
  const senderRef = useRef<PresageFrameSender | null>(null)

  useEffect(() => {
    let ws: WebSocket | null = null
    let sidecarAlive = false
    let gotPresageReading = false
    let reconnectTimer: ReturnType<typeof setTimeout>
    let graceTimer: ReturnType<typeof setTimeout>
    let staleTimer: ReturnType<typeof setInterval>
    let lastPresageAt = 0
    let disposed = false

    // Bumped whenever a fallback loop is started, so an older loop that
    // hasn't noticed it was stood down yet can't run alongside a new one
    // and feed the store two readings per frame.
    let fallbackGeneration = 0

    function connectSidecar() {
      try {
        ws = new WebSocket(SIDECAR_URL)
      } catch {
        scheduleFallback()
        return
      }
      const connectTimeout = setTimeout(() => {
        if (!sidecarAlive) scheduleFallback()
      }, 2500)

      ws.onopen = () => {
        sidecarAlive = true
        clearTimeout(connectTimeout)
        startFrameSender()
        lastPresageAt = 0
        // Don't tear down the fallback yet — it stays until Presage has
        // actually produced a number, not merely accepted a socket.
        graceTimer = setTimeout(() => {
          if (!gotPresageReading) {
            console.warn('[dread] sidecar connected but silent — using fallback pulse')
            scheduleFallback()
          }
        }, PRESAGE_GRACE_MS)
      }
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data)
          if (msg.type === 'pulse' && typeof msg.bpm === 'number') {
            sidecarAlive = true
            if (!gotPresageReading) {
              gotPresageReading = true
              console.info('[dread] Presage pulse acquired')
            }
            // Presage is the better signal, so stand the fallback down the
            // moment it delivers. Its loop checks this flag and exits.
            usingFallbackRef.current = false
            lastPresageAt = Date.now()
            setReading(msg.bpm, msg.confidence ?? 0.8, 'presage')
          }
        } catch {
          /* ignore malformed frame */
        }
      }
      ws.onclose = () => {
        sidecarAlive = false
        gotPresageReading = false
        clearTimeout(graceTimer)
        stopFrameSender()
        scheduleFallback()
        if (!disposed) reconnectTimer = setTimeout(connectSidecar, 4000)
      }
      ws.onerror = () => {
        sidecarAlive = false
      }
    }

    // Watchdog: notice when a connected sidecar quietly stops producing.
    staleTimer = setInterval(() => {
      if (!sidecarAlive || !gotPresageReading) return
      if (Date.now() - lastPresageAt > PRESAGE_STALE_MS) {
        console.warn('[dread] Presage went quiet — falling back until it recovers')
        scheduleFallback()
      }
    }, 5000)

    function startFrameSender() {
      const video = videoRef.current
      if (!video || !ws) return
      senderRef.current?.stop()
      senderRef.current = new PresageFrameSender(video, ws)
      senderRef.current.start()
    }

    function stopFrameSender() {
      senderRef.current?.stop()
      senderRef.current = null
    }

    function scheduleFallback() {
      if (usingFallbackRef.current) return
      usingFallbackRef.current = true
      startFallbackLoop()
    }

    function startFallbackLoop() {
      const video = videoRef.current
      if (!video) return
      if (!fallbackRef.current) fallbackRef.current = new FallbackPulseEstimator(video)
      const generation = ++fallbackGeneration
      const tick = () => {
        // Exit if stood down, or if a newer loop has taken over.
        if (!usingFallbackRef.current || generation !== fallbackGeneration) return
        fallbackRef.current!.sample()
        const { bpm, confidence } = fallbackRef.current!.estimate()
        if (bpm != null) setReading(bpm, confidence, 'fallback')
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    connectSidecar()

    return () => {
      disposed = true
      stopFrameSender()
      ws?.close()
      clearTimeout(reconnectTimer)
      clearTimeout(graceTimer)
      clearInterval(staleTimer)
      fallbackGeneration++
      cancelAnimationFrame(rafRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
