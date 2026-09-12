import { create } from 'zustand'

interface CalmRoomState {
  inCalmRoom: boolean
  regulatedSeconds: number // consecutive seconds spent within the calm band
  setInCalmRoom: (v: boolean) => void
  setRegulatedSeconds: (n: number) => void
  reset: () => void
}

export const CALM_BAND_BPM = 5 // must be within baseline +/- this to count as "regulated"
export const CALM_HOLD_SECONDS = 8 // sustained for this long -> door opens, you're out

export const useCalmRoom = create<CalmRoomState>((set) => ({
  inCalmRoom: false,
  regulatedSeconds: 0,
  setInCalmRoom: (inCalmRoom) => set({ inCalmRoom }),
  setRegulatedSeconds: (regulatedSeconds) => set({ regulatedSeconds }),
  reset: () => set({ inCalmRoom: false, regulatedSeconds: 0 }),
}))
