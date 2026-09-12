import { create } from 'zustand'

export type SessionStatus = 'calibrating' | 'playing' | 'ended'

interface SessionState {
  status: SessionStatus
  startedAt: number | null
  setStatus: (s: SessionStatus) => void
  start: () => void
}

/** Session length for the MVP: fixed 90s after calibration, matching the
 * "90-second repeatable demo ritual" the whole project is built around —
 * something a judge can watch start to finish, cold, in a loud room,
 * four times in a row. */
export const SESSION_DURATION_MS = 90_000

export const useSession = create<SessionState>((set) => ({
  status: 'calibrating',
  startedAt: null,
  setStatus: (status) => set({ status }),
  start: () => set({ status: 'playing', startedAt: Date.now() }),
}))
