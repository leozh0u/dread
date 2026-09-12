/**
 * Does the fallback heart-rate estimator actually work?
 *
 * This is the one piece of real signal processing in the project, and it
 * decides whether the game has a heartbeat at all when the Presage sidecar
 * is unavailable — which is the state a judge is most likely to see. It
 * had never been tested, because it lived inside a class that took an
 * HTMLVideoElement, so exercising it required a human sitting in front of
 * a webcam.
 *
 * Synthetic green-channel signals with known answers, including the ones
 * designed to break it: harmonics, lighting drift, dropped frames, and
 * pure noise, which must return null rather than a confident fiction.
 */
import { estimatePulse, type GreenSample } from '../src/lib/fallbackPulse'
import { smoothReading } from '../src/lib/usePulse'

let failures = 0
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? '  ok  ' : '  FAIL'}  ${label}${detail ? '  — ' + detail : ''}`)
  if (!ok) failures++
}

/** A camera-like green trace: a pulse buried in brightness and noise. */
function synth(opts: {
  bpm: number
  seconds?: number
  fps?: number
  amplitude?: number
  noise?: number
  drift?: number
  harmonic?: number
  jitterMs?: number
  dropFrames?: number
  seed?: number
}): GreenSample[] {
  const {
    bpm, seconds = 8, fps = 30, amplitude = 1.2, noise = 0,
    drift = 0, harmonic = 0, jitterMs = 0, dropFrames = 0, seed = 1,
  } = opts
  // Deterministic pseudo-random, so a failure is always reproducible.
  let s = seed
  const rand = () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296 - 0.5
  }
  const out: GreenSample[] = []
  const n = Math.round(seconds * fps)
  for (let i = 0; i < n; i++) {
    if (dropFrames && i % dropFrames === 0) continue // camera hitches
    const t = (i / fps) * 1000 + (jitterMs ? rand() * jitterMs : 0)
    const sec = t / 1000
    const g =
      128 +                                              // mid-grey skin
      drift * sec +                                      // lighting drift
      amplitude * Math.sin(2 * Math.PI * (bpm / 60) * sec) +
      harmonic * Math.sin(2 * Math.PI * (2 * bpm / 60) * sec) +
      noise * rand()
    out.push({ t, g })
  }
  return out
}

console.log('\n=== recovers a known rate ===')
for (const bpm of [48, 62, 75, 96, 120, 150]) {
  const r = estimatePulse(synth({ bpm }))
  check(`${bpm} bpm, clean`, r.bpm !== null && Math.abs(r.bpm - bpm) <= 2, `got ${r.bpm}`)
}

console.log('\n=== survives what a real webcam does to it ===')
{
  const r = estimatePulse(synth({ bpm: 72, noise: 2.5, seed: 7 }))
  check('72 bpm under noise twice the signal', r.bpm !== null && Math.abs(r.bpm - 72) <= 3, `got ${r.bpm}`)
}
{
  // A cloud passing, or an auto-exposure ramp: a slow trend far larger
  // than the pulse itself.
  const r = estimatePulse(synth({ bpm: 84, drift: 6, noise: 1 }))
  check('84 bpm under heavy lighting drift', r.bpm !== null && Math.abs(r.bpm - 84) <= 3, `got ${r.bpm}`)
}
{
  // Frame timing is never uniform in a browser.
  const r = estimatePulse(synth({ bpm: 66, jitterMs: 12, noise: 1, dropFrames: 11 }))
  check('66 bpm with frame jitter and drops', r.bpm !== null && Math.abs(r.bpm - 66) <= 3, `got ${r.bpm}`)
}
{
  // THE HARMONIC TRAP. A pulse waveform is not a pure sine; its second
  // harmonic sits at exactly double the rate. The old band reached 240
  // bpm, so 70 bpm had its 140 bpm harmonic inside the search space.
  const r = estimatePulse(synth({ bpm: 70, harmonic: 0.8, noise: 0.5 }))
  check('70 bpm is not mistaken for its 140 bpm harmonic', r.bpm !== null && Math.abs(r.bpm - 70) <= 3, `got ${r.bpm}`)
}

console.log('\n=== refuses to invent a pulse ===')
{
  // A covered lens: a flat wall, sensor noise only. Swept over many seeds,
  // because "noise happened not to peak this time" is not a property — one
  // lucky seed would let a fabricated heart rate ship.
  let invented = 0
  const tried = 40
  for (let seed = 1; seed <= tried; seed++) {
    if (estimatePulse(synth({ bpm: 0, amplitude: 0, noise: 3, seed })).bpm !== null) invented++
  }
  check(`pure noise returns null across ${tried} seeds`, invented === 0, `invented a pulse ${invented} time(s)`)
}
{
  // And it must still find a real pulse buried in that same noise, or the
  // rejection threshold has simply been set high enough to reject
  // everything, which passes the test above for the wrong reason.
  let found = 0
  const tried = 40
  for (let seed = 1; seed <= tried; seed++) {
    const r = estimatePulse(synth({ bpm: 78, amplitude: 1.2, noise: 3, seed }))
    if (r.bpm !== null && Math.abs(r.bpm - 78) <= 4) found++
  }
  check(`still finds 78 bpm under that same noise (${found}/${tried})`, found >= tried * 0.8)
}
{
  // An empty, evenly lit room.
  const flat: GreenSample[] = Array.from({ length: 240 }, (_, i) => ({ t: (i / 30) * 1000, g: 128 }))
  check('a perfectly flat image returns null', estimatePulse(flat).bpm === null)
}
{
  const r = estimatePulse(synth({ bpm: 75, seconds: 2 }))
  check('too short a window returns null', r.bpm === null, `got ${r.bpm}`)
}
{
  check('too few samples returns null', estimatePulse(synth({ bpm: 75, seconds: 8, fps: 3 })).bpm === null)
}

console.log('\n=== confidence means something ===')
{
  const clean = estimatePulse(synth({ bpm: 72, noise: 0.2 }))
  const murky = estimatePulse(synth({ bpm: 72, noise: 2.4, seed: 11 }))
  check(
    'a clean signal is more trusted than a murky one',
    clean.confidence > murky.confidence,
    `clean ${clean.confidence.toFixed(2)} vs murky ${murky.confidence.toFixed(2)}`,
  )
  check('confidence stays within 0..1', clean.confidence <= 1 && murky.confidence >= 0)
}
{
  // Doubling the room brightness must not change how much we trust it.
  const dim = synth({ bpm: 72, noise: 1, seed: 5 })
  const bright = dim.map((s) => ({ t: s.t, g: s.g * 2 }))
  const a = estimatePulse(dim)
  const b = estimatePulse(bright)
  check(
    'brightness does not change confidence',
    Math.abs(a.confidence - b.confidence) < 0.01 && a.bpm === b.bpm,
    `dim ${a.confidence.toFixed(2)} / bright ${b.confidence.toFixed(2)}`,
  )
}

console.log('\n=== breathing and sway are not a heart rate ===')
{
  // LEO SAW A CONFIDENT 40 BPM WHILE SITTING STILL. Reproduced exactly: a
  // signal containing nothing but slow leaning and breathing, with no
  // pulse in it at all, returned 40 bpm — the bottom of the old band — at
  // confidence 1.00. It is a genuinely sharp peak, so the peakiness floor
  // had no reason to reject it. It simply is not a heart.
  const motion: [string, (s: number) => number][] = [
    ['head sway', (s) => 9 * Math.sin(s * 0.8) + 4 * Math.sin(s * 1.35 + 1)],
    ['leaning and breathing', (s) => 7 * Math.sin(s * 0.55) + 3 * Math.sin(s * 0.25)],
    ['walking bob', (s) => 6 * Math.sin(s * 1.9)],
    ['fidgeting', (s) => 5 * Math.sin(s * 0.9) + 4 * Math.sin(s * 0.4 + 2)],
  ]
  for (const [name, fn] of motion) {
    const samples: GreenSample[] = []
    for (let i = 0; i < 8 * 60; i++) samples.push({ t: (i / 60) * 1000, g: 128 + fn(i / 60) })
    const r = estimatePulse(samples)
    check(`${name} with no pulse returns null`, r.bpm === null, `got ${r.bpm}`)
  }
}
{
  // And the other half: a real pulse must still survive all that motion
  // on top of it, or the filter has just been set to reject everything.
  const withPulse: [string, number, (s: number) => number][] = [
    ['72 under heavy sway', 72, (s) => 9 * Math.sin(s * 0.8) + 1.0 * Math.sin(2 * Math.PI * 1.2 * s)],
    ['76 through breathing', 76, (s) => 5 * Math.sin(s * 0.3) + 1.2 * Math.sin(2 * Math.PI * (76 / 60) * s)],
    ['55 resting', 55, (s) => 1.2 * Math.sin(2 * Math.PI * (55 / 60) * s)],
    ['130 frightened', 130, (s) => 1.2 * Math.sin(2 * Math.PI * (130 / 60) * s)],
  ]
  for (const [name, truth, fn] of withPulse) {
    const samples: GreenSample[] = []
    for (let i = 0; i < 8 * 60; i++) samples.push({ t: (i / 60) * 1000, g: 128 + fn(i / 60) })
    const r = estimatePulse(samples)
    check(`${name} is still found`, r.bpm !== null && Math.abs(r.bpm - truth) <= 3, `got ${r.bpm}`)
  }
}

console.log('\n=== the number on screen tracks the number measured ===')
{
  // THE BUG THIS COVERS. The step clamp used to limit the INPUT to the
  // moving average, and the average then applied alpha of that — so the
  // display could move at most alpha * maxStep per reading, which for the
  // fallback is 0.6 bpm. A bad first reading of 40 against a true 76 took
  // over sixty readings to correct, and Leo watched it sit at 40.
  // The old composition, for comparison: clamp the INPUT, then average.
  const oldWay = (prev: number, raw: number, maxStep: number, alpha: number) => {
    const clamped = prev + Math.max(-maxStep, Math.min(maxStep, raw - prev))
    return prev * (1 - alpha) + clamped * alpha
  }
  const count = (step: (p: number, r: number, m: number, a: number) => number) => {
    let v = 40
    let n = 0
    while (v < 75 && n < 500) { v = step(v, 76, 4, 0.15); n++ }
    return n
  }
  const now = count(smoothReading)
  const before = count(oldWay)
  check('a 36 bpm correction converges much faster than it did', now * 2 < before, `${now} readings vs ${before}`)
  // Readings arrive once per animation frame, so what matters is the
  // wall-clock cost, not the count.
  check('which is well under a second at 60 readings/sec', now / 60 < 0.5, `${(now / 60).toFixed(2)}s`)
  let v = 40
  for (let i = 0; i < 200; i++) v = smoothReading(v, 76, 4, 0.15)
  check('and it does get there', v >= 75.9, `reached ${v.toFixed(1)}`)
}
{
  // But a single wild reading must still not yank the display.
  const moved = Math.abs(smoothReading(72, 200, 4, 0.15) - 72)
  check('one absurd reading moves it by at most the step cap', moved <= 4.001, `${moved.toFixed(2)} bpm`)
  const movedDown = Math.abs(smoothReading(72, 0, 4, 0.15) - 72)
  check('and the same downward', movedDown <= 4.001, `${movedDown.toFixed(2)} bpm`)
}
{
  // Steady input must settle exactly, not hover short of it.
  let v = 60
  for (let i = 0; i < 200; i++) v = smoothReading(v, 72, 4, 0.15)
  check('a steady signal settles on the true value', Math.abs(v - 72) < 0.01, `${v.toFixed(3)}`)
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nFallback pulse estimator works.')
process.exit(failures ? 1 : 0)
