import { useEffect, useRef } from 'react'
import { create } from 'zustand'
import { FallbackPulseEstimator } from './fallbackPulse'

export type PulseSource = 'presage' | 'fallback' | 'none'

interface PulseState {
  bpm: number | null
  confidence: number
  source: PulseSource
  baseline: number | null // resting HR, set after calibration
  history: { t: number; bpm: number }[]
  setReading: (bpm: number, confidence: number, source: PulseSource) => void
  setBaseline: (bpm: number) => void
}

export const usePulseStore = create<PulseState>((set, get) => ({
  bpm: null,
  confidence: 0,
  source: 'none',
  baseline: null,
  history: [],
  setReading: (bpm, confidence, source) => {
    const history = [...get().history, { t: Date.now(), bpm }].slice(-600) // ~keep last 10min @1hz
    set({ bpm, confidence, source, history })
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
