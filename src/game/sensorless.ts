import { create } from 'zustand'

/**
 * "The house can't see you."
 *
 * True when no pulse reading ever arrived — camera denied, no camera, or
 * the estimator simply never converged. The game still has to be fully
 * playable in that state: judges dismiss permission prompts reflexively,
 * and a horror game that silently refuses to start is one nobody scores.
 *
 * Kept as its own tiny store rather than a flag on the pulse store,
 * because "we have no signal" is a fact about the SESSION, not about the
 * current reading — a run that started blind stays blind even if a
 * reading turns up thirty seconds later, since the baseline it's being
 * compared against was never real.
 */
interface SensorlessState {
  blind: boolean
  setBlind: (v: boolean) => void
}

export const useSensorless = create<SensorlessState>((set) => ({
  blind: false,
  setBlind: (blind) => set({ blind }),
}))
