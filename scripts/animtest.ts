/**
 * What the creatures are doing, and when.
 *
 * Leo: "add more animations to the monsters, like when it tracks you, and
 * runs towards you, and tries to kill you... monsters are really
 * important."
 *
 * Before this there was no animation state at all — a boolean about
 * pursuit and a distance, which tell a body nothing about how to hold
 * itself. All three creatures played one walk cycle with parameters
 * nudged, so noticing you, closing on you and killing you all looked like
 * walking.
 *
 * These states are only observable in play when a creature sees you at
 * close range, which is the single hardest situation to stage on demand —
 * so the choice is tested here rather than by trying to get eaten
 * repeatedly.
 */
import { pickAnim } from '../src/game/entities/Entity'

let failures = 0
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '  ok  ' : '  FAIL'}  ${label}${detail ? '  — ' + detail : ''}`)
  if (!ok) failures++
}

const base = { attacking: false, strike: 0, charging: false, alerting: false, hunting: false }

console.log('\n=== each state is reachable at all ===')
check("idle -> patrol", pickAnim(base) === 'patrol')
check("pursuing -> stalk", pickAnim({ ...base, hunting: true }) === 'stalk')
check("just noticed you -> alert", pickAnim({ ...base, alerting: true }) === 'alert')
check("mid-lunge -> charge", pickAnim({ ...base, charging: true }) === 'charge')
check("in contact -> strike", pickAnim({ ...base, attacking: true }) === 'strike')
check("close enough to reach you -> strike", pickAnim({ ...base, strike: 0.8 }) === 'strike')

console.log('\n=== urgency wins, so a beat is never played over a worse one ===')
{
  // The bug this ordering prevents: a creature mid-kill also hearing
  // something and playing a "what was that" pose over the top.
  check(
    'striking beats noticing',
    pickAnim({ ...base, attacking: true, alerting: true, hunting: true }) === 'strike',
  )
  check(
    'striking beats charging',
    pickAnim({ ...base, attacking: true, charging: true }) === 'strike',
  )
  check(
    'charging beats noticing',
    pickAnim({ ...base, charging: true, alerting: true, hunting: true }) === 'charge',
  )
  check(
    'noticing beats stalking',
    pickAnim({ ...base, alerting: true, hunting: true }) === 'alert',
  )
}

console.log('\n=== the strike threshold is a threshold, not a slope ===')
{
  // strike is a 0..1 proximity ramp, and it must not flicker the pose on
  // and off while a creature hovers at the edge of reach.
  check('just under the line is not a strike', pickAnim({ ...base, strike: 0.54, hunting: true }) === 'stalk')
  check('just over the line is', pickAnim({ ...base, strike: 0.56 }) === 'strike')
  check('a distant creature never strikes', pickAnim({ ...base, strike: 0.1, hunting: true }) === 'stalk')
}

console.log('\n=== a creature that has not found you stays calm ===')
{
  // Nothing but `hunting` should be able to pull it out of patrol, or it
  // would rear up and gape at an empty corridor.
  check('not hunting, nothing triggered -> patrol', pickAnim(base) === 'patrol')
  check(
    'a far-off strike value cannot wake a patrolling creature',
    pickAnim({ ...base, strike: 0.2 }) === 'patrol',
  )
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nAnimation states behave.')
process.exit(failures ? 1 : 0)
