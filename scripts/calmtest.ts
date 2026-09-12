/**
 * The calm-room ending — the one the whole impact claim rests on.
 *
 * To finish this way you have to genuinely bring your heart rate back to
 * your own resting baseline and HOLD it there. That is the project's
 * entire "this is biofeedback, not an analogy" argument, and it is the
 * most important single shot in the demo video.
 *
 * It had never been exercised, because the rule lived inside a
 * setInterval and the only way to run it was to frighten a real person
 * and then calm them down again.
 */
import { stepRegulation } from '../src/game/useCalmRoomLoop'
import { CALM_BAND_BPM, CALM_HOLD_SECONDS } from '../src/game/calmRoom'

let failures = 0
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '  ok  ' : '  FAIL'}  ${label}${detail ? '  — ' + detail : ''}`)
  if (!ok) failures++
}

const TICK = 0.25
const BASE = 72

/** Run a sequence of per-tick bpm readings and report what happened. */
function run(readings: (number | null)[], opts: { inRoom?: (i: number) => boolean } = {}) {
  let secs = 0
  let escapedAt: number | null = null
  readings.forEach((bpm, i) => {
    const inCalmRoom = opts.inRoom ? opts.inRoom(i) : true
    const r = stepRegulation({
      inCalmRoom,
      regulatedSeconds: secs,
      bpm,
      baseline: BASE,
      tick: TICK,
    })
    secs = r.regulatedSeconds
    if (r.escaped && escapedAt === null) escapedAt = (i + 1) * TICK
  })
  return { secs, escapedAt }
}

const ticksFor = (seconds: number) => Math.ceil(seconds / TICK)

console.log('\n=== holding your baseline finishes the run ===')
{
  // Exactly at baseline, held for the required time plus one tick.
  const r = run(Array(ticksFor(CALM_HOLD_SECONDS) + 1).fill(BASE))
  check('sustained regulation reaches the calm ending', r.escapedAt !== null, `at ${r.escapedAt}s`)
  check(
    `it takes about the stated ${CALM_HOLD_SECONDS}s, not less`,
    r.escapedAt !== null && r.escapedAt >= CALM_HOLD_SECONDS,
    `${r.escapedAt}s`,
  )
}
{
  // The edges of the band must count, or the band is narrower than stated.
  for (const bpm of [BASE - CALM_BAND_BPM, BASE + CALM_BAND_BPM]) {
    const r = run(Array(ticksFor(CALM_HOLD_SECONDS) + 1).fill(bpm))
    check(`${bpm} bpm (baseline ${bpm > BASE ? '+' : '-'}${CALM_BAND_BPM}) counts as regulated`, r.escapedAt !== null)
  }
}

console.log('\n=== and being frightened does not ===')
{
  const r = run(Array(ticksFor(CALM_HOLD_SECONDS) * 3).fill(BASE + CALM_BAND_BPM + 1))
  check('one bpm outside the band never finishes', r.escapedAt === null)
  check('progress stays at zero while out of band', r.secs === 0)
}
{
  // Nearly there, then a spike. This is the case the mechanic exists for.
  const almost = ticksFor(CALM_HOLD_SECONDS) - 2
  const r = run([...Array(almost).fill(BASE), BASE + 40, ...Array(almost).fill(BASE)])
  check('a spike one tick from the end resets progress', r.escapedAt === null)
}
{
  // Walking out of the room resets, even while perfectly calm.
  const half = ticksFor(CALM_HOLD_SECONDS)
  const r = run(Array(half * 2).fill(BASE), { inRoom: (i) => i !== half - 1 })
  check('stepping out of the room resets progress', r.escapedAt === null || r.escapedAt >= CALM_HOLD_SECONDS * 1.5)
}

console.log('\n=== a dropped reading must not punish the player ===')
{
  // The estimator legitimately returns null between windows. Losing all
  // progress for that would make the ending feel arbitrary and unearnable.
  // One tick in five is a dropped reading, so it takes proportionally
  // longer in wall-clock to accumulate the same held seconds — which is
  // correct, and is the point: the gaps neither help nor punish.
  const n = ticksFor(CALM_HOLD_SECONDS)
  const withGaps = Array.from({ length: Math.ceil(n * 1.6) }, (_, i) => (i % 5 === 2 ? null : BASE))
  const r = run(withGaps)
  check('gaps in the pulse hold progress rather than resetting it', r.escapedAt !== null, `at ${r.escapedAt}s`)
  const clean = run(Array(Math.ceil(n * 1.6)).fill(BASE))
  check(
    'and they cost time rather than being free',
    r.escapedAt !== null && clean.escapedAt !== null && r.escapedAt > clean.escapedAt,
    `with gaps ${r.escapedAt}s vs clean ${clean.escapedAt}s`,
  )
}
{
  const r = run(Array(40).fill(null))
  check('no reading at all never finishes the run by itself', r.escapedAt === null)
}
{
  const r = stepRegulation({ inCalmRoom: true, regulatedSeconds: 3, bpm: 70, baseline: null })
  check('no baseline yet holds rather than progressing', r.escaped === false && r.regulatedSeconds === 3)
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nCalm-room regulation works.')
process.exit(failures ? 1 : 0)
