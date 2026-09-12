/**
 * The two-clock scare scoring, and the bandit it feeds.
 *
 * This decides what the Director believes about the player. A wrong answer
 * is invisible — the game keeps running, it just learns the wrong thing
 * and picks worse scares for the rest of the session — which is exactly
 * the kind of bug that survives to judging.
 */
import { scoreScare, nextPhase } from '../src/game/useDirectorLoop'
import { useDirector } from '../src/game/director'

let failures = 0
const check = (label: string, ok: boolean) => {
  console.log(`${ok ? '  ok  ' : '  FAIL'}  ${label}`)
  if (!ok) failures++
}

console.log('\n--- scare scoring across both clocks ---')

// Good pulse: trust it.
check(
  'good pulse, no flinch -> the pulse reading, unchanged',
  scoreScare({ bpmBefore: 70, bpmNow: 84, confidence: 0.9, flinched: false }) === 84,
)
check(
  'good pulse + flinch -> pulse plus a bonus (both channels saw it)',
  scoreScare({ bpmBefore: 70, bpmNow: 84, confidence: 0.9, flinched: true }) > 84,
)

// Collapsed pulse: the reading is noise. This is the case the whole design
// exists for — motion corrupts rPPG exactly when the player jumps.
check(
  'lost pulse + flinch -> credited from the face, NOT from the bad reading',
  scoreScare({ bpmBefore: 70, bpmNow: 140, confidence: 0.1, flinched: true }) === 79,
)
check(
  'lost pulse, no flinch -> no credit at all (delta 0), not a garbage spike',
  scoreScare({ bpmBefore: 70, bpmNow: 140, confidence: 0.1, flinched: false }) === 70,
)
check(
  'a wild low reading with no confidence is also ignored',
  scoreScare({ bpmBefore: 70, bpmNow: 20, confidence: 0.0, flinched: false }) === 70,
)

// A scare that genuinely did nothing must be able to score negative, or
// the bandit can never learn that an arm is bad.
check(
  'good pulse that dropped -> negative delta survives',
  scoreScare({ bpmBefore: 80, bpmNow: 72, confidence: 0.8, flinched: false }) === 72,
)

console.log('\n--- the inversion: calm invites it in, fright pushes it away ---')
{
  const calm = { arousal: 0.1, recovered: true }
  const frightened = { arousal: 0.9, recovered: false }
  const settling = { arousal: 0.3, recovered: false }

  // The claim the demo video makes in its first twenty seconds.
  const fromStalkCalm = nextPhase({ phase: 'STALK', ...calm })
  check('STALK + recovered -> STRIKE, and fires a scare', fromStalkCalm.phase === 'STRIKE' && fromStalkCalm.fireScare)

  const fromStalkScared = nextPhase({ phase: 'STALK', ...frightened })
  check('STALK + still frightened -> stays STALK, fires nothing', fromStalkScared.phase === 'STALK' && !fromStalkScared.fireScare)

  check('STRIKE always withdraws rather than grinding you down', nextPhase({ phase: 'STRIKE', ...frightened }).phase === 'WITHDRAW')
  check('WITHDRAW + high arousal -> stays away', nextPhase({ phase: 'WITHDRAW', ...frightened }).phase === 'WITHDRAW')
  check('WITHDRAW + settled -> RECOVER', nextPhase({ phase: 'WITHDRAW', ...settling }).phase === 'RECOVER')
  check('RECOVER + not yet recovered -> stays RECOVER', nextPhase({ phase: 'RECOVER', ...settling }).phase === 'RECOVER')
  check('RECOVER + recovered -> back to STALK', nextPhase({ phase: 'RECOVER', ...calm }).phase === 'STALK')
  check('CALIBRATING never fires a scare', !nextPhase({ phase: 'CALIBRATING', ...calm }).fireScare)

  // Only one scare per cycle, or a calm player would be machine-gunned.
  let phase: DirectorPhase = 'STALK'
  let fires = 0
  for (let i = 0; i < 40; i++) {
    const r = nextPhase({ phase, ...calm })
    if (r.fireScare) fires++
    phase = r.phase
  }
  check('a permanently calm player gets a paced cycle, not a barrage', fires > 3 && fires < 15, `${fires} scares in 40 ticks`)

  // And a permanently terrified one is left alone entirely.
  phase = 'STALK'
  fires = 0
  for (let i = 0; i < 40; i++) {
    const r = nextPhase({ phase, ...frightened })
    if (r.fireScare) fires++
    phase = r.phase
  }
  check('a permanently frightened player is never struck at', fires === 0)
  check('and it settles in STALK waiting for them', phase === 'STALK')
}

console.log('\n--- the bandit learns from it ---')
const d = useDirector.getState()
d.seedStats({
  proximity: { attempts: 0, totalDelta: 0 },
  audio: { attempts: 0, totalDelta: 0 },
  visual: { attempts: 0, totalDelta: 0 },
  absence: { attempts: 0, totalDelta: 0 },
})
// Audio works on this player; proximity doesn't.
for (let i = 0; i < 6; i++) {
  useDirector.getState().recordScareOutcome('audio', 70, scoreScare({ bpmBefore: 70, bpmNow: 88, confidence: 0.9, flinched: true }))
  useDirector.getState().recordScareOutcome('proximity', 70, scoreScare({ bpmBefore: 70, bpmNow: 71, confidence: 0.9, flinched: false }))
}
const stats = useDirector.getState().stats
check('audio accumulated a large average', stats.audio.totalDelta / stats.audio.attempts > 15)
check('proximity accumulated a small one', stats.proximity.totalDelta / stats.proximity.attempts < 3)

// pickScare explores 20% of the time, so check the tendency, not one call.
let audioPicks = 0
for (let i = 0; i < 400; i++) if (useDirector.getState().pickScare() === 'audio') audioPicks++
check(`exploits the better arm (${audioPicks}/400 audio)`, audioPicks > 300)
check(`still explores (${400 - audioPicks}/400 other)`, audioPicks < 400)

console.log('\n--- seeding from a previous session ---')
useDirector.setState({
  stats: {
    proximity: { attempts: 0, totalDelta: 0 },
    audio: { attempts: 0, totalDelta: 0 },
    visual: { attempts: 0, totalDelta: 0 },
    absence: { attempts: 0, totalDelta: 0 },
  },
})
useDirector.getState().recordScareOutcome('visual', 70, 80) // this session
useDirector.getState().seedStats({
  proximity: { attempts: 0, totalDelta: 0 },
  audio: { attempts: 4, totalDelta: 60 },
  visual: { attempts: 0, totalDelta: 0 },
  absence: { attempts: 0, totalDelta: 0 },
})
const after = useDirector.getState().stats
check('seeding ADDS to the past', after.audio.attempts === 4)
check('seeding does not discard this session', after.visual.attempts === 1)

console.log(failures ? `\n${failures} FAILURE(S)\n` : '\nDirector scoring is sound\n')
process.exit(failures ? 1 : 0)
