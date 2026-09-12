import { useEffect, useRef } from 'react'
import { create } from 'zustand'
import { FallbackPulseEstimator } from './fallbackPulse'

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
 * Owns the pulse pipeline for the whole app. Prefers the Presage sidecar;
 * falls back to in-browser rPPG if the socket never connects or drops.
 * Mount this once, near the root, with the webcam <video> element.
 */
export function usePulseSource(videoRef: React.RefObject<HTMLVideoElement | null>) {
  const setReading = usePulseStore((s) => s.setReading)
  const fallbackRef = useRef<FallbackPulseEstimator | null>(null)
  const usingFallbackRef = useRef(false)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    let ws: WebSocket | null = null
    let sidecarAlive = false
    let reconnectTimer: ReturnType<typeof setTimeout>

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
        usingFallbackRef.current = false
        clearTimeout(connectTimeout)
      }
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data)
          if (msg.type === 'pulse' && typeof msg.bpm === 'number') {
            sidecarAlive = true
            setReading(msg.bpm, msg.confidence ?? 0.8, 'presage')
          }
        } catch {
          /* ignore malformed frame */
        }
      }
      ws.onclose = () => {
        sidecarAlive = false
        scheduleFallback()
        reconnectTimer = setTimeout(connectSidecar, 4000)
      }
      ws.onerror = () => {
        sidecarAlive = false
      }
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
      const tick = () => {
        if (!usingFallbackRef.current) return // sidecar came back
        fallbackRef.current!.sample()
        const { bpm, confidence } = fallbackRef.current!.estimate()
        if (bpm != null) setReading(bpm, confidence, 'fallback')
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    connectSidecar()

    return () => {
      ws?.close()
      clearTimeout(reconnectTimer)
      cancelAnimationFrame(rafRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
