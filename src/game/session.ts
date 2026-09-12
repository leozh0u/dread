import { create } from 'zustand'
import { useThreat } from './threat'

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
  /**
   * Start playing — but never resurrect a run that has already resolved.
   *
   * A session of 'playing' alongside an outcome of 'died' is a state with
   * no way out of it: the HUD hides because the run is over, the end
   * screen does not show because the session says it is not, and the
   * player stands in the dark with no output and no button. Exactly the
   * kind of dead end this build is not allowed to have.
   *
   * It was reachable through the dev keys — C and J call start()
   * unconditionally, and those are the keys used for FILMING, so one
   * press after a death would have produced a frozen, outputless game on
   * camera. restartRun() is unaffected: it clears the outcome before
   * calling this, so by the time it arrives the run really is playable.
   */
  start: () =>
    set(() => {
      if (useThreat.getState().outcome !== 'playing') {
        console.warn('[dread] refusing to start a session on an already-ended run')
        return {}
      }
      return { status: 'playing', startedAt: Date.now() }
    }),
}))
