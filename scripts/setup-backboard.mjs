/**
 * One-command Backboard setup.
 *
 * Backboard scopes memories to an assistant, so a key alone isn't enough —
 * you also need an assistant id. Rather than making that a curl command to
 * copy, paste and mis-transcribe at 3am, this reads the key from
 * .env.local, creates the assistant, and writes the id back.
 *
 * Safe to run twice: if BACKBOARD_ASSISTANT_ID is already set it stops and
 * says so rather than orphaning the existing assistant along with every
 * memory attached to it.
 *
 *   node scripts/setup-backboard.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const ENV = '.env.local'

function readEnv(name) {
  if (!existsSync(ENV)) return null
  const line = readFileSync(ENV, 'utf8')
    .split('\n')
    .find((l) => l.trim().startsWith(`${name}=`))
  if (!line) return null
  const v = line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')
  return v || null
}

const key = readEnv('BACKBOARD_API_KEY')
if (!key) {
  console.error('No BACKBOARD_API_KEY in .env.local.\n')
  console.error('Add it first (in a terminal, not in chat):')
  console.error("  printf 'BACKBOARD_API_KEY=your_key\\n' >> .env.local\n")
  process.exit(1)
}

const existing = readEnv('BACKBOARD_ASSISTANT_ID')
if (existing) {
  console.log(`BACKBOARD_ASSISTANT_ID is already set (${existing.slice(0, 8)}…).`)
  console.log('Nothing to do. Delete that line first if you really want a new assistant —')
  console.log('a new one starts with no memories, so the house would forget everyone.')
  process.exit(0)
}

console.log('Creating the DREAD assistant…')
const res = await fetch('https://app.backboard.io/api/assistants', {
  method: 'POST',
  headers: { 'X-API-Key': key, 'content-type': 'application/json' },
  body: JSON.stringify({
    name: 'DREAD House',
    system_prompt:
      'You are the house in DREAD. You remember what frightens each player: ' +
      'which kinds of scare raise their heart rate most, and how they ended each run.',
  }),
})

const text = await res.text()
if (!res.ok) {
  console.error(`\nBackboard returned ${res.status}:`)
  console.error(text.slice(0, 500))
  if (res.status === 401) console.error('\nThat status means the API key was rejected.')
  process.exit(1)
}

let body
try {
  body = JSON.parse(text)
} catch {
  console.error('\nCould not parse the response:')
  console.error(text.slice(0, 500))
  process.exit(1)
}

const id = body.assistant_id ?? body.id ?? body.data?.assistant_id ?? body.data?.id
if (!id) {
  console.error('\nNo assistant id in the response. Raw body:')
  console.error(text.slice(0, 500))
  process.exit(1)
}

const prev = readFileSync(ENV, 'utf8')
writeFileSync(ENV, prev + (prev.endsWith('\n') ? '' : '\n') + `BACKBOARD_ASSISTANT_ID=${id}\n`)

console.log(`\nDone. BACKBOARD_ASSISTANT_ID=${id} written to .env.local`)
console.log('Restart the sidecar; it should print backboard=ready.')
