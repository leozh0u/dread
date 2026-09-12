#!/usr/bin/env node
/**
 * Generates the game's audio assets from ElevenLabs, once, offline.
 *
 * The key never reaches the browser: DREAD ships as a static site, so
 * anything in the client bundle is public. This script runs locally
 * against .env.local (gitignored), writes MP3s into public/audio/, and
 * those committed files are what the game loads. No runtime API calls,
 * no key in the bundle, and the game still works with no network.
 *
 * Usage:  node scripts/generate-audio.mjs [--force]
 *
 * Existing files are skipped unless --force, so re-running is cheap and
 * won't burn credits regenerating what's already good.
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'public', 'audio')
const FORCE = process.argv.includes('--force')

function loadKey() {
  const envPath = join(ROOT, '.env.local')
  if (!existsSync(envPath)) {
    console.error('No .env.local found. Create it with:')
    console.error('  echo "ELEVENLABS_API_KEY=your_key" >> .env.local')
    process.exit(1)
  }
  const line = readFileSync(envPath, 'utf8')
    .split('\n')
    .find((l) => l.startsWith('ELEVENLABS_API_KEY='))
  if (!line) {
    console.error('.env.local has no ELEVENLABS_API_KEY line')
    process.exit(1)
  }
  return line.slice('ELEVENLABS_API_KEY='.length).trim().replace(/^["']|["']$/g, '')
}

/**
 * Sound effects, one per creature plus the shared scare/ambience set.
 * Prompts are written as sound-design briefs rather than descriptions of
 * monsters — "wet clicking", "sub-bass swell" — because that's the
 * vocabulary the model responds to.
 */
const SOUND_EFFECTS = [
  // --- THE LONG ONE: tall, silent, wrong. Presence rather than noise.
  {
    file: 'ent-long-presence.mp3',
    text: 'deep sub-bass drone swelling slowly, distant hollow room tone, oppressive, no music',
    duration: 8,
  },
  {
    file: 'ent-long-near.mp3',
    text: 'slow shuddering inhale, vast and dry, reversed air, unsettling',
    duration: 4,
  },
  // --- THE CRAWLER: fast, wet, insectile.
  {
    file: 'ent-crawler-skitter.mp3',
    text: 'rapid bony clicking and scraping on concrete, many limbs, fast and erratic',
    duration: 4,
  },
  {
    file: 'ent-crawler-shriek.mp3',
    text: 'short wet inhuman shriek, rising, distorted, ends abruptly',
    duration: 3,
  },
  // --- THE SMILE: heavy, dragging, enormous.
  {
    file: 'ent-smile-drag.mp3',
    text: 'enormous heavy body dragging slowly across a carpeted floor, low rumble',
    duration: 5,
  },
  {
    file: 'ent-smile-laugh.mp3',
    text: 'low distorted breathy laughter, slowed down, wrong, layered',
    duration: 4,
  },
  // --- Shared scares and ambience
  {
    file: 'scare-stinger.mp3',
    text: 'sudden violent horror stinger, harsh metallic scrape and low boom, very short',
    duration: 2,
  },
  {
    file: 'amb-door-groan.mp3',
    text: 'distant heavy metal door groaning open, echoing down a long corridor',
    duration: 5,
  },
  {
    file: 'amb-scratch.mp3',
    text: 'fingernails scratching slowly on drywall, close and dry',
    duration: 3,
  },
  {
    file: 'amb-flicker.mp3',
    text: 'fluorescent light buzzing and stuttering, electrical, failing ballast',
    duration: 5,
  },
]

/** Whispered lines. A hushed female voice reads as more unsettling than
 * a growl here, because the whisper is meant to sound close to your ear
 * rather than across the room. */
const VOICE_ID = 'EXAVITQu4vr4xnSDxMaL' // Sarah — soft, breathy
const VOICE_LINES = [
  { file: 'vo-open-your-eyes.mp3', text: 'Open your eyes. Open them.' },
  { file: 'vo-i-see-you.mp3', text: "I see you. Don't move." },
  { file: 'vo-still-here.mp3', text: "You're still here. Good." },
  { file: 'vo-breathe.mp3', text: 'Breathe. Slower. Slower than that.' },
  { file: 'vo-not-alone.mp3', text: "You were never alone in here." },
]

async function post(url, key, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`${res.status} ${await res.text().catch(() => '')}`)
  }
  return Buffer.from(await res.arrayBuffer())
}

async function main() {
  const key = loadKey()
  mkdirSync(OUT_DIR, { recursive: true })

  let made = 0
  let skipped = 0

  for (const sfx of SOUND_EFFECTS) {
    const out = join(OUT_DIR, sfx.file)
    if (existsSync(out) && !FORCE) {
      skipped++
      continue
    }
    process.stdout.write(`sfx  ${sfx.file} ... `)
    const buf = await post('https://api.elevenlabs.io/v1/sound-generation', key, {
      text: sfx.text,
      duration_seconds: sfx.duration,
      prompt_influence: 0.6,
    })
    writeFileSync(out, buf)
    console.log(`${(buf.length / 1024).toFixed(0)}kb`)
    made++
  }

  for (const vo of VOICE_LINES) {
    const out = join(OUT_DIR, vo.file)
    if (existsSync(out) && !FORCE) {
      skipped++
      continue
    }
    process.stdout.write(`vo   ${vo.file} ... `)
    const buf = await post(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
      key,
      {
        text: vo.text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.35, similarity_boost: 0.75, style: 0.5 },
      },
    )
    writeFileSync(out, buf)
    console.log(`${(buf.length / 1024).toFixed(0)}kb`)
    made++
  }

  console.log(`\ndone — ${made} generated, ${skipped} already present`)
  console.log('these files are committed; the API key never ships to the browser')
}

main().catch((err) => {
  console.error('\nfailed:', err.message)
  process.exit(1)
})
