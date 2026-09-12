/**
 * Fails the build if a secret would ship to the browser.
 *
 * DREAD is a static site: anything in the bundle is public forever, and a
 * key that ships once is burned even if the next commit removes it. The
 * danger isn't carelessness, it's that the mistake is a ONE CHARACTER
 * difference — VITE_PERSONA_API_KEY instead of PERSONA_API_KEY — and Vite
 * will happily inline it with no warning at all.
 *
 * Two checks:
 *  1. No value from .env.local appears anywhere in dist/.
 *  2. No client code reads a non-VITE_ env var (and nothing named like a
 *     secret is VITE_-prefixed in the first place).
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

let failures = 0
const check = (label: string, ok: boolean) => {
  console.log(`${ok ? '  ok  ' : '  FAIL'}  ${label}`)
  if (!ok) failures++
}

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

console.log('\n--- secrets must not reach the browser ---')

if (!existsSync('dist')) {
  console.log('  SKIP  no dist/ — run `npm run build` first')
  process.exit(0)
}

// 1. No .env.local value may appear in the built output.
const envPath = '.env.local'
const bundleFiles = walk('dist').filter((f) => /\.(js|css|html|map)$/.test(f))
const bundle = bundleFiles.map((f) => readFileSync(f, 'utf8')).join('\n')

if (existsSync(envPath)) {
  const lines = readFileSync(envPath, 'utf8').split('\n')
  let scanned = 0
  for (const line of lines) {
    const t = line.trim()
    if (!t || t.startsWith('#') || !t.includes('=')) continue
    const name = t.slice(0, t.indexOf('='))
    const value = t.slice(t.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')
    // Short values would false-positive on ordinary code.
    if (value.length < 12) continue
    scanned++
    const isPublishable = name.startsWith('VITE_')
    const present = bundle.includes(value)
    if (isPublishable) {
      // These are MEANT to ship; just say so out loud.
      console.log(`  note  ${name} is publishable and ${present ? 'is' : 'is not'} in the bundle`)
    } else {
      check(`${name} (secret) absent from dist/`, !present)
    }
  }
  console.log(`  ${scanned} value(s) scanned across ${bundleFiles.length} built files`)
} else {
  console.log('  note  no .env.local on this machine — value scan skipped')
}

// 2. Client code must only ever read VITE_-prefixed vars.
const srcFiles = walk('src').filter((f) => /\.(ts|tsx)$/.test(f))
const badReads: string[] = []
const suspiciousPublishable: string[] = []
for (const f of srcFiles) {
  const text = readFileSync(f, 'utf8')
  for (const m of text.matchAll(/import\.meta\.env\.([A-Za-z0-9_]+)/g)) {
    const name = m[1]
    // BASE_URL/MODE/DEV/PROD are Vite's own, always safe.
    if (['BASE_URL', 'MODE', 'DEV', 'PROD', 'SSR'].includes(name)) continue
    if (!name.startsWith('VITE_')) badReads.push(`${f}: ${name}`)
    else if (/KEY|SECRET|TOKEN|PASSWORD/i.test(name)) suspiciousPublishable.push(`${f}: ${name}`)
  }
}
check(
  `client reads only VITE_ vars${badReads.length ? ` — ${badReads.join(', ')}` : ''}`,
  badReads.length === 0,
)
check(
  `no VITE_ var is named like a secret${suspiciousPublishable.length ? ` — ${suspiciousPublishable.join(', ')}` : ''}`,
  suspiciousPublishable.length === 0,
)

// 3. .env.local must never be tracked by git.
check('.env.local is gitignored', existsSync('.gitignore') && readFileSync('.gitignore', 'utf8').includes('.env.local'))

console.log(failures ? `\n${failures} FAILURE(S) — DO NOT DEPLOY\n` : '\nNo secrets in the bundle\n')
process.exit(failures ? 1 : 0)
