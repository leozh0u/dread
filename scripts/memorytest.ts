/**
 * The priors that seed the Director come back from Backboard as free text
 * that this code parses. That makes them untrusted input, and a bad parse
 * would silently poison the bandit — the house would "remember" something
 * that never happened. These cases cover the ways that text can be wrong.
 */
// Minimal browser shims so the module can load under Node.
;(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: () => 'p_test',
  setItem: () => {},
} as Storage

const calls: { url: string }[] = []
let nextBody: unknown = null
globalThis.fetch = (async (url: string) => {
  calls.push({ url: String(url) })
  return { ok: true, json: async () => nextBody } as Response
}) as typeof fetch

const { recallPriors, bestArm } = await import('../src/lib/houseMemory')

let failures = 0
const check = (label: string, ok: boolean) => {
  console.log(`${ok ? '  ok  ' : '  FAIL'}  ${label}`)
  if (!ok) failures++
}

const mem = (priors: unknown) => ({
  ok: true,
  memories: [{ content: `blah blah\n<priors>${JSON.stringify(priors)}</priors>` }],
})

console.log('\n--- house memory parsing ---')

nextBody = { ok: false }
check('no memories -> null', (await recallPriors()) === null)

nextBody = { ok: true, memories: [{ content: 'prose with no priors tag at all' }] }
check('unparseable memory -> null (not a zeroed bandit)', (await recallPriors()) === null)

nextBody = { ok: true, memories: [{ content: '<priors>{not json</priors>' }] }
check('malformed JSON -> null', (await recallPriors()) === null)

nextBody = mem({ stats: { audio: { attempts: 3, totalDelta: 30 } }, runs: 1 })
{
  const p = await recallPriors()
  check('partial stats parse', p?.stats.audio.attempts === 3)
  check('missing arms default to zero', p?.stats.visual.attempts === 0)
}

// Two runs must accumulate, or repeated evidence counts once.
nextBody = {
  ok: true,
  memories: [
    { content: `<priors>${JSON.stringify({ stats: { audio: { attempts: 2, totalDelta: 20 } }, runs: 1 })}</priors>` },
    { content: `<priors>${JSON.stringify({ stats: { audio: { attempts: 3, totalDelta: 15 } }, runs: 1 })}</priors>` },
  ],
}
{
  const p = await recallPriors()
  check('multiple runs accumulate attempts', p?.stats.audio.attempts === 5)
  check('multiple runs accumulate delta', p?.stats.audio.totalDelta === 35)
  check('run count accumulates', p?.runs === 2)
}

// Hostile / broken numbers must not reach the bandit.
nextBody = mem({
  stats: {
    audio: { attempts: NaN, totalDelta: 5 },
    visual: { attempts: 'lots', totalDelta: 5 },
    proximity: { attempts: 2, totalDelta: 40 },
  },
  runs: 1,
})
{
  const p = await recallPriors()
  check('NaN attempts rejected', p?.stats.audio.attempts === 0)
  check('non-numeric attempts rejected', p?.stats.visual.attempts === 0)
  check('valid arm alongside bad ones survives', p?.stats.proximity.attempts === 2)
}

console.log('\n--- bestArm ---')
check(
  'picks highest average, not highest total',
  bestArm({
    proximity: { attempts: 10, totalDelta: 50 }, // avg 5
    audio: { attempts: 2, totalDelta: 40 },      // avg 20
    visual: { attempts: 0, totalDelta: 0 },
    absence: { attempts: 0, totalDelta: 0 },
  }) === 'audio',
)
check(
  'no evidence -> null',
  bestArm({
    proximity: { attempts: 0, totalDelta: 0 },
    audio: { attempts: 0, totalDelta: 0 },
    visual: { attempts: 0, totalDelta: 0 },
    absence: { attempts: 0, totalDelta: 0 },
  }) === null,
)
check(
  'only negative reactions -> null (never claim a scare that calmed them)',
  bestArm({
    proximity: { attempts: 3, totalDelta: -9 },
    audio: { attempts: 2, totalDelta: -4 },
    visual: { attempts: 0, totalDelta: 0 },
    absence: { attempts: 0, totalDelta: 0 },
  }) === null,
)

console.log(failures ? `\n${failures} FAILURE(S)\n` : '\nHouse memory parsing is sound\n')
process.exit(failures ? 1 : 0)
