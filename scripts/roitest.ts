/**
 * Does the patch grid find the pulse when only ONE patch contains skin?
 *
 * This is the specific failure Leo hit: a fixed region of interest that
 * landed on his hairline while his face sat somewhere else in the frame, so
 * the estimator had no cardiac signal to find and reported the slow drift it
 * could see instead — 51 against a hand-counted 68.
 */
import { estimatePulse } from '../src/lib/fallbackPulse'

let pass = 0, fail = 0
const ok = (label: string, cond: boolean, detail = '') => {
  if (cond) { pass++; console.log(`  ok    ${label}${detail ? '  — ' + detail : ''}`) }
  else { fail++; console.log(`  FAIL  ${label}${detail ? '  — ' + detail : ''}`) }
}

const FPS = 30, SECS = 12
function skin(bpm: number, seed = 1) {
  const out = []
  let r = seed
  const rnd = () => (r = (r * 1103515245 + 12345) % 2147483648) / 2147483648 - 0.5
  for (let i = 0; i < FPS * SECS; i++) {
    const t = i / FPS
    // Pulse + breathing + a slow exposure ramp, which is what a real face gives.
    const g = 128 + 0.8 * Math.sin(2 * Math.PI * (bpm / 60) * t)
      + 2.5 * Math.sin(2 * Math.PI * 0.25 * t) + 3 * t / SECS + rnd() * 1.2
    out.push({ t: i * (1000 / FPS), g })
  }
  return out
}
function wall(seed = 7) {
  const out = []
  let r = seed
  const rnd = () => (r = (r * 1103515245 + 12345) % 2147483648) / 2147483648 - 0.5
  for (let i = 0; i < FPS * SECS; i++) {
    const t = i / FPS
    // No heartbeat at all: drift and sensor noise only.
    out.push({ t: i * (1000 / FPS), g: 96 + 4 * t / SECS + 2.2 * Math.sin(2 * Math.PI * 0.18 * t) + rnd() * 1.5 })
  }
  return out
}

/** What the class does: take the highest-confidence patch that found a pulse. */
function bestOf(series: { t: number; g: number }[][]) {
  let best: { bpm: number | null; confidence: number } = { bpm: null, confidence: 0 }
  for (const s of series) {
    const r = estimatePulse(s)
    if (r.bpm != null && r.confidence > best.confidence) best = r
  }
  return best
}

console.log('\n=== one patch of skin among eight of wall ===')
for (const truth of [58, 68, 84, 96]) {
  for (const where of [0, 4, 8]) {
    const series = Array.from({ length: 9 }, (_, i) => (i === where ? skin(truth, where + 1) : wall(i + 20)))
    const got = bestOf(series)
    ok(`${truth} bpm found with skin only in patch ${where}`,
       got.bpm != null && Math.abs(got.bpm - truth) <= 3, `got ${got.bpm}`)
  }
}

console.log('\n=== the old single fixed patch would have missed it ===')
{
  // Patch 0 is the top-left of the grid; the old ROI was fixed near the top.
  const series = Array.from({ length: 9 }, (_, i) => (i === 4 ? skin(68, 3) : wall(i + 40)))
  const onlyFixed = estimatePulse(series[0])
  const grid = bestOf(series)
  ok('the fixed patch alone finds nothing or is wrong',
     onlyFixed.bpm == null || Math.abs(onlyFixed.bpm - 68) > 5, `fixed said ${onlyFixed.bpm}`)
  ok('the grid finds the real rate', grid.bpm != null && Math.abs(grid.bpm - 68) <= 3, `grid said ${grid.bpm}`)
}

console.log('\n=== nine patches of wall still refuse to invent a pulse ===')
{
  let invented = 0
  for (let seed = 0; seed < 25; seed++) {
    const series = Array.from({ length: 9 }, (_, i) => wall(seed * 9 + i))
    if (bestOf(series).bpm != null) invented++
  }
  ok('no pulse from an empty frame across 25 seeds', invented === 0, `invented ${invented} time(s)`)
}

console.log(`\n${fail === 0 ? 'Patch search works.' : `${fail} FAILED`}  (${pass} checks)`)
process.exit(fail === 0 ? 0 : 1)
