/**
 * The ambient sound scheduler.
 *
 * Leo's report was "more scary noises, more often", which is a judgement
 * about feel — but the two things underneath it are numbers: how long
 * between sounds, and how many distinct sounds are in play. Both are
 * checkable, and both were quietly bad (one sound a minute, five in
 * rotation) in a way nobody would have caught by listening for a minute.
 */
import { pickAmbient, ambientDelay, ambientPlacement } from '../src/game/useAmbientHorror'

let pass = 0
let fail = 0
function ok(label: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ok    ${label}${detail ? '  — ' + detail : ''}`) }
  else { fail++; console.log(`  FAIL  ${label}${detail ? '  — ' + detail : ''}`) }
}

console.log('\n=== the house is noisier than it was ===')
{
  // Old behaviour: 35-80s flat. New: single digits during STALK.
  const stalk = [...Array(2000)].map((_, i) => ambientDelay({ phase: 'STALK', arousal: 0, roll: i / 2000 }))
  const avg = stalk.reduce((a, b) => a + b, 0) / stalk.length
  ok('STALK averages well under the old 57s floor', avg < 15_000, `${(avg / 1000).toFixed(1)}s`)
  ok('and never gets slower than 20s', Math.max(...stalk) < 20_000, `max ${(Math.max(...stalk) / 1000).toFixed(1)}s`)
  ok('nor faster than 5s, which would be comic', Math.min(...stalk) > 5_000, `min ${(Math.min(...stalk) / 1000).toFixed(1)}s`)

  // A three minute run should now carry real density.
  const perRun = 180_000 / avg
  ok('a 3-minute run carries 12+ sounds, not 3', perRun > 12, `${perRun.toFixed(0)} sounds`)
}

console.log('\n=== the Director still runs the volume ===')
{
  const at = (phase: string, arousal = 0) => ambientDelay({ phase, arousal, roll: 0.5 })
  ok('the cold open is near-silent', at('CALIBRATING') > at('STALK') * 3)
  ok('STRIKE is the densest phase', at('STRIKE') < at('STALK') && at('STRIKE') < at('RECOVER'))
  ok('WITHDRAW genuinely backs off', at('WITHDRAW') > at('STALK') * 2, `${(at('WITHDRAW')/1000).toFixed(1)}s vs ${(at('STALK')/1000).toFixed(1)}s`)
  ok('RECOVER creeps back between the two', at('RECOVER') > at('STALK') && at('RECOVER') < at('WITHDRAW'))
  ok('an unknown phase does not crash or go silent', at('NONSENSE') > 0 && at('NONSENSE') < 25_000)
}

console.log('\n=== a frightened player gets a quieter house ===')
{
  const calm = ambientDelay({ phase: 'STALK', arousal: 0, roll: 0.5 })
  const scared = ambientDelay({ phase: 'STALK', arousal: 1, roll: 0.5 })
  ok('terrified is quieter than calm', scared > calm, `${(scared/1000).toFixed(1)}s vs ${(calm/1000).toFixed(1)}s`)
  ok('but never silent — capped at 2x', scared <= calm * 2.01)
  ok('out-of-range arousal is clamped, not trusted',
    ambientDelay({ phase: 'STALK', arousal: 9, roll: 0.5 }) === scared &&
    ambientDelay({ phase: 'STALK', arousal: -9, roll: 0.5 }) === calm)
}

console.log('\n=== the rotation is actually wide ===')
{
  const seen = new Set<string>()
  for (let i = 0; i < 20_000; i++) seen.add(pickAmbient(i / 20_000, null).name)
  ok('every sound in the bank can play', seen.size >= 12, `${seen.size} distinct`)

  // The old version could play the same clip twice running.
  let repeats = 0
  let last: any = null
  for (let i = 0; i < 20_000; i++) {
    const e = pickAmbient(Math.random(), last)
    if (last && e.name === last) repeats++
    last = e.name
  }
  ok('and never repeats back to back across 20k picks', repeats === 0, `${repeats} repeats`)

  // Voice should stay rare; it is an event, not room tone.
  let vo = 0
  for (let i = 0; i < 20_000; i++) if (pickAmbient(Math.random(), null).name.startsWith('vo-')) vo++
  const voPct = (vo / 20_000) * 100
  ok('the house speaking stays rare', voPct > 2 && voPct < 15, `${voPct.toFixed(1)}% of sounds`)
}

console.log('\n=== sounds land somewhere real ===')
{
  const far = ambientPlacement({ near: false, px: 0, pz: 29, fx: 0, fz: -1, arc: 40, angleRoll: 0.5, radiusRoll: 0.5 })
  ok('far sounds are muffled, as through a wall', far.occluded)

  // "Behind" has to hold whichever way the player is facing. The first
  // version of this only worked while they faced -z, which is the bug
  // this check exists to catch.
  const HEADINGS = [
    { fx: 0, fz: -1, label: 'north' },
    { fx: 1, fz: 0, label: 'east' },
    { fx: 0, fz: 1, label: 'south' },
    { fx: -0.707, fz: -0.707, label: 'northeast' },
  ]
  let tooClose = 0
  let tooFar = 0
  let worstRear = 1
  for (const h of HEADINGS) {
    let behind = 0
    for (let i = 0; i < 3000; i++) {
      const p = ambientPlacement({
        near: true, px: 10, pz: -4, fx: h.fx, fz: h.fz,
        arc: 0, angleRoll: Math.random(), radiusRoll: Math.random(),
      })
      const dx = p.x - 10
      const dz = p.z + 4
      const d = Math.hypot(dx, dz)
      if (d < 2) tooClose++
      if (d > 6.5) tooFar++
      // Dot against the facing direction: negative means behind them.
      if (dx * h.fx + dz * h.fz < 0) behind++
    }
    worstRear = Math.min(worstRear, behind / 3000)
  }
  ok('near sounds are never on top of you', tooClose === 0)
  ok('and never so far they lose the point', tooFar === 0)
  ok('they come from behind whichever way you face', worstRear > 0.8, `worst heading ${(worstRear*100).toFixed(0)}% rear`)
  ok('near sounds are not muffled', !ambientPlacement({ near: true, px: 0, pz: 0, fx: 0, fz: -1, arc: 0, angleRoll: 0.5, radiusRoll: 0.5 }).occluded)
  ok('a zero facing vector does not produce NaN', Number.isFinite(
    ambientPlacement({ near: true, px: 0, pz: 0, fx: 0, fz: 0, arc: 0, angleRoll: 0.3, radiusRoll: 0.5 }).x))
}

console.log(`\n${fail === 0 ? 'Ambient horror scheduler works.' : `${fail} FAILED`}  (${pass} checks)`)
process.exit(fail === 0 ? 0 : 1)
