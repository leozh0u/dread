import { create } from 'zustand'

/**
 * What the sensing stack is actually doing, right now.
 *
 * Every piece of this game's biometric pipeline failed silently at some
 * point tonight — the sidecar sat reporting "NO FRAMES" while the game
 * looked fine, the face model can fail to load with nothing on screen,
 * and a pulse reading that never arrives is indistinguishable from one
 * that arrives as null. From the player's side all of those look
 * identical: nothing happens.
 *
 * So the state is published here and shown on screen (components/Vitals).
 * It's a debugging tool that happens to also be the best thing in the
 * game to point a camera at, because "the house is reading you" is only
 * convincing if you can watch it read you.
 */
/**
 * Presage's own verdict on the framing, forwarded from the sidecar.
 *
 * `fix` is the plain-English instruction — "TOO DARK — put a lamp on your
 * face" rather than "kTooDark". Null once framing is good.
 */
export interface Validation {
  code: number
  name: string
  fix: string | null
  at: number
}

interface SensorState {
  framesSent: number
  framesDropped: number
  sidecarConnected: boolean
  presageReadings: number
  /** null = nothing reported yet; name 'kOk' = framing is good. */
  validation: Validation | null
  processing: string | null
  /**
   * Why the camera isn't running, in words the player can act on.
   *
   * getUserMedia failing wrote a line to the console and did nothing
   * else, so a denied permission, a camera held by another app, a machine
   * with no camera at all, and a page served over plain http were all the
   * same experience: the game quietly playing blind. Leo hit exactly this
   * — "the camera isn't on, at least there's no green light" — and there
   * was nothing on screen that could have told him why.
   */
  cameraError: string | null
  setFrames: (sent: number, dropped: number) => void
  setSidecar: (connected: boolean) => void
  setValidation: (v: Validation | null) => void
  setProcessing: (s: string | null) => void
  setCameraError: (msg: string | null) => void
  countReading: () => void
  reset: () => void
}

export const useSensorStatus = create<SensorState>((set, get) => ({
  framesSent: 0,
  framesDropped: 0,
  sidecarConnected: false,
  presageReadings: 0,
  validation: null,
  processing: null,
  cameraError: null,
  setFrames: (framesSent, framesDropped) => set({ framesSent, framesDropped }),
  setSidecar: (sidecarConnected) =>
    set(sidecarConnected ? { sidecarConnected } : { sidecarConnected, validation: null, processing: null }),
  setValidation: (validation) => set({ validation }),
  setProcessing: (processing) => set({ processing }),
  setCameraError: (cameraError) => set({ cameraError }),
  countReading: () => set({ presageReadings: get().presageReadings + 1 }),
  reset: () =>
    set({ framesSent: 0, framesDropped: 0, presageReadings: 0, validation: null, processing: null }),
}))
