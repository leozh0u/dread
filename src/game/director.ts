import { create } from 'zustand'

export type DirectorPhase = 'CALIBRATING' | 'STALK' | 'STRIKE' | 'WITHDRAW' | 'RECOVER'
export type ScareType = 'proximity' | 'audio' | 'visual' | 'absence'

const SCARE_TYPES: ScareType[] = ['proximity', 'audio', 'visual', 'absence']

interface ScareStat {
  attempts: number
  totalDelta: number // sum of (peak bpm after - bpm before)
}

interface DirectorState {
  phase: DirectorPhase
  monsterDistance: number // 0 = on top of you, 1 = far away
  lastScare: ScareType | null
  scareLog: { t: number; type: ScareType; bpmBefore: number; bpmAfter: number }[]
  stats: Record<ScareType, ScareStat>
  setPhase: (p: DirectorPhase) => void
  setMonsterDistance: (d: number) => void
  recordScareOutcome: (type: ScareType, bpmBefore: number, bpmAfter: number) => void
  pickScare: () => ScareType
}

function freshStats(): Record<ScareType, ScareStat> {
  return {
    proximity: { attempts: 0, totalDelta: 0 },
    audio: { attempts: 0, totalDelta: 0 },
    visual: { attempts: 0, totalDelta: 0 },
    absence: { attempts: 0, totalDelta: 0 },
  }
}

/**
 * The whole game, honestly, is this file.
 *
 * Two clocks feed it (see usePulse.ts): a slow one (Presage pulse, ~12s
 * average) drives phase transitions here; a fast one (facial expression /
 * blink, not yet wired — see TODO) is meant to catch flinches the slow
 * clock misses. For the hackathon MVP we run purely off pulse deltas
 * against a rolling baseline.
 *
 * pickScare() is a simple epsilon-greedy multi-armed bandit: mostly picks
 * whichever scare type has produced the biggest pulse spike for THIS
 * player so far, with a 20% explore rate so it doesn't get stuck early.
 * This is deliberately not a trained model — see the project README for
 * why that would be the wrong tool for ~20 data points in a single session.
 */
export const useDirector = create<DirectorState>((set, get) => ({
  phase: 'CALIBRATING',
  monsterDistance: 1,
  lastScare: null,
  scareLog: [],
  stats: freshStats(),

  setPhase: (phase) => set({ phase }),
  setMonsterDistance: (d) => set({ monsterDistance: Math.max(0, Math.min(1, d)) }),

  recordScareOutcome: (type, bpmBefore, bpmAfter) => {
    const stats = { ...get().stats }
    stats[type] = {
      attempts: stats[type].attempts + 1,
      totalDelta: stats[type].totalDelta + (bpmAfter - bpmBefore),
    }
    set({
      stats,
      scareLog: [...get().scareLog, { t: Date.now(), type, bpmBefore, bpmAfter }],
    })
  },

  pickScare: () => {
    const { stats } = get()
    const explore = Math.random() < 0.2
    if (explore) {
      return SCARE_TYPES[Math.floor(Math.random() * SCARE_TYPES.length)]
    }
    let best: ScareType = 'proximity'
    let bestAvg = -Infinity
    for (const type of SCARE_TYPES) {
      const s = stats[type]
      const avg = s.attempts === 0 ? 0 : s.totalDelta / s.attempts
      if (avg > bestAvg) {
        bestAvg = avg
        best = type
      }
    }
    return best
  },
}))

/**
 * Arousal thresholds. Tune these against real calibration data on Saturday —
 * these numbers are a starting guess (roughly +12 bpm over baseline = scared,
 * back within +4 bpm = recovered) and WILL need adjusting per-player.
 */
export const AROUSAL = {
  SCARED_DELTA: 12,
  RECOVERED_DELTA: 4,
}
