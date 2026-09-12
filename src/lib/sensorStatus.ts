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
interface SensorState {
  framesSent: number
  framesDropped: number
  sidecarConnected: boolean
  presageReadings: number
  setFrames: (sent: number, dropped: number) => void
  setSidecar: (connected: boolean) => void
  countReading: () => void
  reset: () => void
}

export const useSensorStatus = create<SensorState>((set, get) => ({
  framesSent: 0,
  framesDropped: 0,
  sidecarConnected: false,
  presageReadings: 0,
  setFrames: (framesSent, framesDropped) => set({ framesSent, framesDropped }),
  setSidecar: (sidecarConnected) => set({ sidecarConnected }),
  countReading: () => set({ presageReadings: get().presageReadings + 1 }),
  reset: () => set({ framesSent: 0, framesDropped: 0, presageReadings: 0 }),
}))
