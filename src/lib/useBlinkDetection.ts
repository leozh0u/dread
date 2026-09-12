import { useEffect } from 'react'
import { create } from 'zustand'
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import { playWhisper } from '../game/scareFx'

interface BlinkState {
  eyesClosed: boolean
  setEyesClosed: (v: boolean) => void
}

export const useBlinkStore = create<BlinkState>((set) => ({
  eyesClosed: false,
  setEyesClosed: (eyesClosed) => set({ eyesClosed }),
}))

const CLOSED_SCORE_THRESHOLD = 0.55 // MediaPipe blendshape score, 0-1
const CLOSED_HOLD_MS = 3500 // how long eyes must stay shut before the whisper
const WHISPER_COOLDOWN_MS = 9000

const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'

/**
 * Real blink/eyes-closed detection off the same webcam feed already used
 * for pulse — MediaPipe's FaceLandmarker with blendshapes gives us
 * eyeBlinkLeft/eyeBlinkRight scores directly, so this doesn't need its own
 * eye-aspect-ratio math. Entirely client-side, no API key.
 *
 * If eyes stay closed past CLOSED_HOLD_MS, the house notices — a whisper
 * panned into a random ear (see scareFx.ts's playWhisper). This degrades
 * silently: if the model fails to load (no network, WebGL unavailable),
 * eyesClosed just never fires and the rest of the game is unaffected.
 */
export function useBlinkDetection(videoRef: React.RefObject<HTMLVideoElement | null>) {
  useEffect(() => {
    let landmarker: FaceLandmarker | null = null
    let raf = 0
    let cancelled = false
    let closedSince: number | null = null
    let lastWhisper = 0

    async function createLandmarker(fileset: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>) {
      try {
        return await FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
          outputFaceBlendshapes: true,
          runningMode: 'VIDEO',
          numFaces: 1,
        })
      } catch {
        // Some machines/browsers choke on the GPU delegate — CPU is slower
        // but far more universally supported, worth the fallback for a
        // live-judging demo where we don't control the hardware.
        return FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
          outputFaceBlendshapes: true,
          runningMode: 'VIDEO',
          numFaces: 1,
        })
      }
    }

    async function init() {
      const fileset = await FilesetResolver.forVisionTasks(WASM_BASE)
      if (cancelled) return
      landmarker = await createLandmarker(fileset)
      if (cancelled) {
        landmarker.close()
        return
      }
      tick()
    }

    function tick() {
      if (cancelled) return
      const video = videoRef.current
      if (video && video.readyState >= 2 && landmarker) {
        const result = landmarker.detectForVideo(video, performance.now())
        const shapes = result.faceBlendshapes?.[0]?.categories
        if (shapes) {
          const left = shapes.find((c) => c.categoryName === 'eyeBlinkLeft')?.score ?? 0
          const right = shapes.find((c) => c.categoryName === 'eyeBlinkRight')?.score ?? 0
          const closed = left > CLOSED_SCORE_THRESHOLD && right > CLOSED_SCORE_THRESHOLD
          useBlinkStore.getState().setEyesClosed(closed)

          const now = performance.now()
          if (closed) {
            if (closedSince == null) closedSince = now
            if (now - closedSince > CLOSED_HOLD_MS && now - lastWhisper > WHISPER_COOLDOWN_MS) {
              lastWhisper = now
              playWhisper(Math.random() < 0.5 ? 'left' : 'right')
            }
          } else {
            closedSince = null
          }
        }
      }
      raf = requestAnimationFrame(tick)
    }

    init().catch((err) => console.error('[blink] init failed', err))

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      landmarker?.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
