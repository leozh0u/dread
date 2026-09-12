import { create } from 'zustand'

export type SessionStatus = 'calibrating' | 'playing' | 'ended'

interface SessionState {
  status: SessionStatus
  startedAt: number | null
  setStatus: (s: SessionStatus) => void
  start: () => void
}

/**
 * Tracks the play session's lifecycle. There is deliberately no fixed
 * timer here — the run ends only via a real outcome (see threat.ts:
 * detection maxes out -> died; calmRoom.ts: sustained regulation ->
 * escaped). A clock-based cutoff would fight the escape-the-house
 * objective by ending mid-exploration for no in-fiction reason.
 */
export const useSession = create<SessionState>((set) => ({
  status: 'calibrating',
  startedAt: null,
  setStatus: (status) => set({ status }),
  start: () => set({ status: 'playing', startedAt: Date.now() }),
}))
