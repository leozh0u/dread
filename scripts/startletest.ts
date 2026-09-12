/**
 * The fast clock.
 *
 * Presage averages pulse over about twelve seconds, and rPPG is corrupted
 * by motion — so the slow channel is least trustworthy at the exact
 * moment something interesting happened. The face is the opposite: a
 * startle appears in 100-300ms and does not care that you moved. The
 * writeup and the demo video both lead with that pairing, so it is worth
 * knowing this half actually behaves.
 *
 * It lived inside a MediaPipe callback, where the only way to exercise it
 * was to sit in front of a webcam and try to look startled on command.
 */
import { stepStartle } from '../src/lib/useBlinkDetection'

let failures = 0
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '  ok  ' : '  FAIL'}  ${label}${detail ? '  — ' + detail : ''}`)
  if (!ok) failures++
}

const FRAME_MS = 50

/** Feed a sequence of composite scores and report what the channel did. */
function feed(composites: number[], startNeutral: number | null = null) {
  let state = { neutral: startNeutral, startle: 0, lastFlinch: -1e9 }
  const flinches: number[] = []
  const startles: number[] = []
  composites.forEach((composite, i) => {
    const now = i * FRAME_MS
    const r = stepStartle({ composite, neutral: state.neutral, startle: state.startle, now, lastFlinch: state.lastFlinch })
    state = { neutral: r.neutral, startle: r.startle, lastFlinch: r.lastFlinch }
    if (r.flinched) flinches.push(now)
    startles.push(r.startle)
  })
  return { flinches, startles, neutral: state.neutral, peak: Math.max(...startles) }
}

const rest = (n: number, v = 0.10) => Array(n).fill(v)

console.log('\n=== a resting face is not a startled one ===')
{
  const r = feed(rest(200))
  check('a perfectly still face never flinches', r.flinches.length === 0)
}
{
  // Real faces jitter; the model output is noisy. That must not register.
  const noisy = Array.from({ length: 200 }, (_, i) => 0.1 + Math.sin(i * 1.7) * 0.05)
  check('normal facial noise never flinches', feed(noisy).flinches.length === 0)
}
{
  // Someone whose resting face simply sits high. An absolute threshold
  // would call them permanently startled; this is scored against their own
  // neutral, so it must not.
  check('a person with a high resting face never flinches', feed(rest(200, 0.62)).flinches.length === 0)
}

console.log('\n=== a real startle registers, once ===')
{
  const r = feed([...rest(40), ...Array(6).fill(0.75), ...rest(60)])
  check('a sudden spike flinches', r.flinches.length >= 1)
  check('startle rises above zero', r.peak > 0, `peak ${r.peak.toFixed(2)}`)
  check(
    'one scare produces one flinch, not one per frame',
    r.flinches.length === 1,
    `${r.flinches.length} flinches`,
  )
}
{
  // The refractory window is what stops a single 6-frame spike counting
  // six times, so a spike longer than it should count twice.
  const long = [...rest(40), ...Array(60).fill(0.8), ...rest(20)]
  const r = feed(long)
  check('a spike far longer than the refractory counts more than once', r.flinches.length >= 2, `${r.flinches.length}`)
  check('but not once per frame', r.flinches.length < 8, `${r.flinches.length}`)
}
{
  const r = feed([...rest(40), ...Array(4).fill(0.9), ...rest(80)])
  const after = r.startles.slice(50)
  check('startle decays back toward zero afterwards', after[after.length - 1] < 0.02, `${after[after.length - 1].toFixed(3)}`)
}

console.log('\n=== a sustained fright must not become the new normal ===')
{
  // THIS IS THE ONE THAT MATTERS. If the rolling neutral chased a
  // frightened face, the channel would go quiet exactly when the player
  // was most alarmed, and the Director would conclude they had calmed
  // down while they were still terrified.
  const held = [...rest(40), ...Array(400).fill(0.7)]
  const r = feed(held)
  check(
    'a long scare does not drag neutral up to meet it',
    r.neutral !== null && r.neutral < 0.2,
    `neutral ended at ${r.neutral?.toFixed(3)}`,
  )
  check('and it keeps registering flinches throughout', r.flinches.length > 5, `${r.flinches.length} flinches`)
}
{
  // But a genuine slow drift in resting expression SHOULD be absorbed,
  // or the channel would fire forever on someone who just relaxed their
  // jaw differently.
  const drift = Array.from({ length: 600 }, (_, i) => 0.1 + (0.06 * i) / 600)
  const r = feed(drift)
  check('a slow drift in resting face is absorbed, not flinched at', r.flinches.length === 0)
}

console.log('\n=== the first sample cannot be a flinch ===')
{
  // Someone mid-expression when the model finishes loading must not start
  // the game already startled.
  const r = feed([0.95, ...rest(40)])
  check('the very first reading only sets neutral', r.flinches.length === 0)
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nFast arousal channel behaves.')
process.exit(failures ? 1 : 0)
