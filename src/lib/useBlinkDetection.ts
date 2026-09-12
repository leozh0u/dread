import { useEffect } from 'react'
import { create } from 'zustand'
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import { playWhisper } from '../game/scareFx'

interface BlinkState {
  eyesClosed: boolean
  /** 0-1 startle intensity, decaying. The FAST arousal channel. */
  startle: number
  /** performance.now() of the last detected flinch, or 0. */
  lastFlinchAt: number
  /** True once the face model is actually running. */
  faceTracking: boolean
  setEyesClosed: (v: boolean) => void
  setStartle: (v: number, flinched: boolean) => void
  setFaceTracking: (v: boolean) => void
}

export const useBlinkStore = create<BlinkState>((set, get) => ({
  eyesClosed: false,
  startle: 0,
  lastFlinchAt: 0,
  faceTracking: false,
  setEyesClosed: (eyesClosed) => set({ eyesClosed }),
  setStartle: (startle, flinched) =>
    set({ startle, lastFlinchAt: flinched ? performance.now() : get().lastFlinchAt }),
  setFaceTracking: (faceTracking) => set({ faceTracking }),
}))

const CLOSED_SCORE_THRESHOLD = 0.55 // MediaPipe blendshape score, 0-1
const CLOSED_HOLD_MS = 3500 // how long eyes must stay shut before the whisper
const WHISPER_COOLDOWN_MS = 9000

/**
 * THE FAST CLOCK.
 *
 * Presage averages pulse over ~12 seconds, and motion corrupts rPPG
 * exactly when the player jumps — so the slow channel is at its least
 * trustworthy at the precise moment something interesting happened. The
 * face is the opposite: a startle response appears within 100-300ms and
 * doesn't care that you moved.
 *
 * Built from the blendshapes that actually mark startle — raised inner
 * brow, widened eyes, dropped jaw. Deliberately NOT from eyeBlink: people
 * blink 15-20 times a minute unprompted, so a blink-driven startle signal
 * would fire constantly and teach the Director nothing.
 *
 * Scored against a slow rolling baseline of the same person's neutral
 * face, because resting expressions differ enormously between people and
 * an absolute threshold would call some players permanently startled.
 */
const STARTLE_WEIGHTS = { brow: 0.45, eyeWide: 0.35, jaw: 0.2 }
const STARTLE_BASELINE_ALPHA = 0.02 // ~10s at 20fps
const FLINCH_THRESHOLD = 0.18 // deviation above this person's neutral
const FLINCH_REFRACTORY_MS = 1200
const STARTLE_DECAY = 0.9

/**
 * One step of the fast arousal channel, as a pure function.
 *
 * Extracted for the same reason as stepDetection, stepRegulation and
 * nextPhase: this is one half of the two-clock design that the demo video
 * and the writeup both lead with, and it lived inside a MediaPipe callback
 * where the only way to exercise it was to sit in front of a webcam and
 * try to look startled on command.
 *
 * `neutral` is this person's own resting composite, carried between calls.
 * Returning it rather than mutating a closure is what makes the whole
 * thing testable.
 */
export function stepStartle(args: {
  composite: number
  neutral: number | null
  startle: number
  now: number
  lastFlinch: number
}): { neutral: number; startle: number; flinched: boolean; lastFlinch: number } {
  const { composite, startle, now, lastFlinch } = args
  // First sample defines neutral. There is nothing to compare against yet,
  // so it must not be able to register as a flinch — otherwise a player who
  // happened to be mid-expression when the model loaded would start the
  // game already "startled".
  if (args.neutral == null) {
    return { neutral: composite, startle: 0, flinched: false, lastFlinch }
  }

  const deviation = composite - args.neutral
  const canFlinch = deviation > FLINCH_THRESHOLD && now - lastFlinch > FLINCH_REFRACTORY_MS

  if (canFlinch) {
    return {
      // Neutral is NOT updated during a flinch — see below.
      neutral: args.neutral,
      startle: Math.min(1, deviation / (FLINCH_THRESHOLD * 3)),
      flinched: true,
      lastFlinch: now,
    }
  }

  // Track neutral only while NOT above the flinch threshold. A long scare
  // would otherwise drag the baseline up to meet the frightened face, and
  // the channel would go quiet exactly when the player was most alarmed.
  const neutral =
    deviation < FLINCH_THRESHOLD
      ? args.neutral * (1 - STARTLE_BASELINE_ALPHA) + composite * STARTLE_BASELINE_ALPHA
      : args.neutral

  return { neutral, startle: startle * STARTLE_DECAY, flinched: false, lastFlinch }
}

/**
 * The face model runs on the main thread, alongside a 3D renderer and a
 * 24fps frame pump to the sidecar. 60fps inference buys nothing — a
 * startle lasts hundreds of milliseconds — and costs frames in the game.
 */
const DETECT_INTERVAL_MS = 50

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
    let lastDetect = 0
    let neutral: number | null = null
    let lastFlinch = 0
    let startle = 0

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
      useBlinkStore.getState().setFaceTracking(true)
      tick()
    }

    function tick() {
      if (cancelled) return
      const video = videoRef.current
      const now = performance.now()
      if (video && video.readyState >= 2 && landmarker && now - lastDetect >= DETECT_INTERVAL_MS) {
        lastDetect = now
        const result = landmarker.detectForVideo(video, now)
        const shapes = result.faceBlendshapes?.[0]?.categories
        if (shapes) {
          const left = shapes.find((c) => c.categoryName === 'eyeBlinkLeft')?.score ?? 0
          const right = shapes.find((c) => c.categoryName === 'eyeBlinkRight')?.score ?? 0
          const closed = left > CLOSED_SCORE_THRESHOLD && right > CLOSED_SCORE_THRESHOLD
          useBlinkStore.getState().setEyesClosed(closed)

          // --- fast arousal channel ---
          const score = (name: string) => shapes.find((c) => c.categoryName === name)?.score ?? 0
          const composite =
            STARTLE_WEIGHTS.brow * score('browInnerUp') +
            STARTLE_WEIGHTS.eyeWide * Math.max(score('eyeWideLeft'), score('eyeWideRight')) +
            STARTLE_WEIGHTS.jaw * score('jawOpen')

          const step = stepStartle({ composite, neutral, startle, now, lastFlinch })
          neutral = step.neutral
          startle = step.startle
          lastFlinch = step.lastFlinch
          useBlinkStore.getState().setStartle(step.startle, step.flinched)

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
      useBlinkStore.getState().setFaceTracking(false)
      landmarker?.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
