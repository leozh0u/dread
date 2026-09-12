/**
 * Consumes the autonomic arousal model solved in MATLAB
 * (matlab/autonomic_model.m) as a lookup table, bilinearly interpolated
 * at runtime.
 *
 * The modelling — sympathetic vs parasympathetic balance from heart rate
 * deviation and HRV — happens offline in MATLAB, once. The game ships the
 * solved surface. That's the normal way a MATLAB-designed model reaches a
 * realtime target, and it means nothing in the live demo depends on
 * anything that can fail.
 *
 * If the table hasn't been generated yet, `arousalFrom` falls back to a
 * heart-rate-only heuristic so the game is fully playable without it.
 * Check `usingModel` to know which is in effect.
 */

interface ArousalTable {
  hr_delta: number[]
  rmssd: number[]
  arousal: number[][] // [rmssdIndex][hrIndex]
  recovery: number[][]
  generated?: string
}

let table: ArousalTable | null = null

try {
  // Vite resolves this at build time if the file exists. It's generated
  // by the MATLAB script and committed; absent, we fall back.
  const mod = import.meta.glob('./arousalTable.json', { eager: true }) as Record<
    string,
    { default: ArousalTable }
  >
  const first = Object.values(mod)[0]
  if (first?.default?.arousal) table = first.default
} catch {
  table = null
}

export const usingModel = table != null
export const modelGeneratedAt = table?.generated ?? null

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

/** Index of the cell containing `v`, plus the fractional position within
 * it. Clamps at both ends. */
function locate(axis: number[], v: number) {
  const lo = axis[0]
  const hi = axis[axis.length - 1]
  if (v <= lo) return { i: 0, f: 0 }
  if (v >= hi) return { i: axis.length - 2, f: 1 }
  const step = (hi - lo) / (axis.length - 1)
  const raw = (v - lo) / step
  const i = Math.min(Math.floor(raw), axis.length - 2)
  return { i, f: raw - i }
}

/**
 * Net arousal, 0 (settled) .. 1 (maximally aroused).
 *
 * @param hrDelta  bpm above (or below) this player's calibrated baseline
 * @param rmssd    HRV in ms. Pass null when unavailable — the fallback
 *                 assumes a mid-range value, which is the honest thing to
 *                 do rather than inventing variability data.
 */
export function arousalFrom(hrDelta: number, rmssd: number | null): number {
  if (!table) {
    // Heart-rate-only fallback: a logistic on deviation alone. Less
    // discriminating than the model — it can't tell a settled high
    // resting rate from genuine activation — but never wrong-footed.
    return 1 / (1 + Math.exp(-0.16 * (hrDelta - 12)))
  }

  const hv = rmssd ?? 55 // mid-range when HRV isn't measured
  const h = locate(table.hr_delta, hrDelta)
  const r = locate(table.rmssd, hv)

  const a00 = table.arousal[r.i][h.i]
  const a01 = table.arousal[r.i][h.i + 1]
  const a10 = table.arousal[r.i + 1][h.i]
  const a11 = table.arousal[r.i + 1][h.i + 1]

  return lerp(lerp(a00, a01, h.f), lerp(a10, a11, h.f), r.f)
}

/**
 * Has the player actually come back down? Deliberately stricter than
 * "heart rate dropped": variability has to have returned too, because
 * someone whose HR falls while HRV stays suppressed is still activated.
 * That distinction is the whole reason the Director waits before
 * striking again.
 */
export function hasRecovered(hrDelta: number, rmssd: number | null): boolean {
  if (!table) return hrDelta < 4
  const hv = rmssd ?? 55
  const h = locate(table.hr_delta, hrDelta)
  const r = locate(table.rmssd, hv)
  // Nearest-cell rather than interpolated — it's a boolean gate, and
  // interpolating a step function just smears the edge.
  const ri = r.f > 0.5 ? r.i + 1 : r.i
  const hi = h.f > 0.5 ? h.i + 1 : h.i
  return table.recovery[ri][hi] > 0.5
}
