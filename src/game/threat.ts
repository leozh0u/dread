import { create } from 'zustand'

// Two distinct wins: walk out the unlocked door (fast, simple), or go
// deeper into the calm room and actually regulate your heart rate (slower,
// the "real" demonstration of the project's impact claim). Kept as
// separate outcomes rather than one 'escaped' so the end screen can tell
// a different story for each.
export type RunOutcome = 'playing' | 'died' | 'escaped_door' | 'escaped_calm'

interface ThreatState {
  isHidden: boolean
  detection: number // 0-100. Hits 100 while monster is close -> death.
  outcome: RunOutcome
  cluesCollected: Set<string>
  setHidden: (h: boolean) => void
  setDetection: (d: number) => void
  addClue: (id: string) => void
  setOutcome: (o: RunOutcome) => void
  reset: () => void
}

export const CLUES_REQUIRED = 3

export const useThreat = create<ThreatState>((set, get) => ({
  isHidden: false,
  detection: 0,
  outcome: 'playing',
  cluesCollected: new Set(),
  setHidden: (isHidden) => set({ isHidden }),
  setDetection: (d) => set({ detection: Math.max(0, Math.min(100, d)) }),
  addClue: (id) => {
    if (get().cluesCollected.has(id)) return // idempotent — re-entering a
    // pickup trigger shouldn't double-count
    const next = new Set(get().cluesCollected)
    next.add(id)
    set({ cluesCollected: next })
  },
  setOutcome: (outcome) => set({ outcome }),
  reset: () =>
    set({ isHidden: false, detection: 0, outcome: 'playing', cluesCollected: new Set() }),
}))
