import { useEffect, useRef } from 'react'
import { create } from 'zustand'

interface MicState {
  level: number // 0-1, smoothed RMS volume
  setLevel: (l: number) => void
}

export const useMicStore = create<MicState>((set) => ({
  level: 0,
  setLevel: (level) => set({ level }),
}))

const SMOOTHING = 0.7 // heavier smoothing than pulse — mic is loud/spiky by nature,
// we want a level that reads "is this person being noisy" not every syllable

/**
 * Requests mic access and drives useMicStore off a Web Audio AnalyserNode.
 * Mount once at the game root, alongside the webcam. If mic access is
 * denied, level just stays 0 — the stealth mechanic degrades to "always
 * quiet," which is a safe failure direction (never punishes a player for
 * a permission they can't grant mid-demo).
 */
export function useMicSource() {
  const setLevel = useRef(useMicStore.getState().setLevel)

  useEffect(() => {
    let stream: MediaStream | null = null
    let audioCtx: AudioContext | null = null
    let raf = 0
    let smoothed = 0

    navigator.mediaDevices
      .getUserMedia({ audio: true, video: false })
      .then((s) => {
        stream = s
        audioCtx = new AudioContext()
        const source = audioCtx.createMediaStreamSource(s)
        const analyser = audioCtx.createAnalyser()
        analyser.fftSize = 512
        source.connect(analyser)
        const data = new Uint8Array(analyser.frequencyBinCount)

        const tick = () => {
          analyser.getByteTimeDomainData(data)
          let sumSquares = 0
          for (let i = 0; i < data.length; i++) {
            const centered = (data[i] - 128) / 128
            sumSquares += centered * centered
          }
          const rms = Math.sqrt(sumSquares / data.length) // 0-1ish
          smoothed = smoothed * SMOOTHING + rms * (1 - SMOOTHING)
          setLevel.current(Math.min(1, smoothed * 4)) // scale up — raw RMS is tiny
          raf = requestAnimationFrame(tick)
        }
        tick()
      })
      .catch((err) => console.error('[mic] getUserMedia failed', err))

    return () => {
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
      audioCtx?.close()
    }
  }, [])
}
