/**
 * The rules that decide whether the player lives.
 *
 * Every other test here checks that something works; this one checks that
 * the game is FAIR. An unfair death is the fastest way to lose a player,
 * and the rules got materially more complex once the creatures could
 * actually reach anyone.
 */
import { stepDetection } from '../src/game/useThreatLoop'

let failures = 0
const check = (label: string, ok: boolean) => {
  console.log(`${ok ? '  ok  ' : '  FAIL'}  ${label}`)
  if (!ok) failures++
}

const tick = (o: Partial<Parameters<typeof stepDetection>[0]>) =>
  stepDetection({ detection: 50, close: false, isHidden: false, noisy: false, ...o })

console.log('\n--- the four situations ---')
check('far away: detection falls', tick({ close: false }).next < 50)
check('close and exposed: detection climbs', tick({ close: true }).next > 50)
check(
  'close, hidden, quiet: detection FALLS (hiding actually works)',
  tick({ close: true, isHidden: true }).next < 50,
)
check(
  'close, hidden, noisy: detection climbs',
  tick({ close: true, isHidden: true, noisy: true }).next > 50,
)

console.log('\n--- hiding has to be worth doing ---')
const exposed = tick({ close: true }).next - 50
const noisyHidden = tick({ close: true, isHidden: true, noisy: true }).next - 50
check('being seen is worse than being heard while hidden', exposed > noisyHidden)
check('noise while hidden is still dangerous, not free', noisyHidden > 0)

console.log('\n--- time to die, from full health ---')
const TICK_S = 0.2
function secondsToDeath(o: Partial<Parameters<typeof stepDetection>[0]>) {
  let d = 0
  for (let i = 0; i < 2000; i++) {
    d = Math.max(0, Math.min(100, stepDetection({ detection: d, close: false, isHidden: false, noisy: false, ...o }).next))
    if (d >= 100) return (i + 1) * TICK_S
  }
  return Infinity
}
const exposedDeath = secondsToDeath({ close: true })
const hiddenNoisyDeath = secondsToDeath({ close: true, isHidden: true, noisy: true })
console.log(`  seen in the open : ${exposedDeath.toFixed(1)}s`)
console.log(`  hidden but noisy : ${hiddenNoisyDeath.toFixed(1)}s`)
check('being caught in the open kills in 2-6s (enough time to react, not a coin flip)', exposedDeath >= 2 && exposedDeath <= 6)
check('noise while hidden gives you longer', hiddenNoisyDeath > exposedDeath)
check('hidden and quiet never dies', secondsToDeath({ close: true, isHidden: true }) === Infinity)

console.log('\n--- recovery ---')
function secondsToClear(from: number) {
  let d = from
  for (let i = 0; i < 2000; i++) {
    d = Math.max(0, stepDetection({ detection: d, close: false, isHidden: false, noisy: false }).next)
    if (d <= 0) return (i + 1) * TICK_S
  }
  return Infinity
}
const clear = secondsToClear(99)
console.log(`  from 99% to clear: ${clear.toFixed(1)}s`)
check('escaping resets you in a few seconds, so a near-miss is survivable', clear > 1 && clear < 8)
check('decay is slower than exposure, so escaping is a real cost', clear > exposedDeath)

console.log(failures ? `\n${failures} FAILURE(S)\n` : '\nDeath rules are fair\n')
process.exit(failures ? 1 : 0)
