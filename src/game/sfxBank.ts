/**
 * Real recorded audio, generated once from ElevenLabs and committed as
 * static files (see scripts/generate-audio.mjs). The API key never ships
 * to the browser — DREAD is a static site, so anything in the bundle is
 * public.
 *
 * These layer ON TOP of the procedural WebAudio design rather than
 * replacing it. The synthesised bed still carries the continuous stuff
 * (hum, drone, growl, footsteps, heartbeat) because it responds
 * continuously to distance and pulse, which a fixed recording can't. The
 * recordings carry the one-shot character moments — a shriek, a drag, a
 * whisper — which is what synthesis was worst at.
 *
 * Everything degrades silently: if a file can't be fetched or decoded,
 * the game just doesn't play that one-shot. It never blocks and never
 * throws.
 */

export type SfxName =
  | 'long-presence'
  | 'long-near'
  | 'crawler-skitter'
  | 'crawler-shriek'
  | 'smile-drag'
  | 'smile-laugh'
  | 'scare-stinger'
  | 'door-groan'
  | 'scratch'
  | 'flicker'
  | 'vo-open-your-eyes'
  | 'vo-i-see-you'
  | 'vo-still-here'
  | 'vo-breathe'
  | 'vo-not-alone'

const FILES: Record<SfxName, string> = {
  'long-presence': 'ent-long-presence.mp3',
  'long-near': 'ent-long-near.mp3',
  'crawler-skitter': 'ent-crawler-skitter.mp3',
  'crawler-shriek': 'ent-crawler-shriek.mp3',
  'smile-drag': 'ent-smile-drag.mp3',
  'smile-laugh': 'ent-smile-laugh.mp3',
  'scare-stinger': 'scare-stinger.mp3',
  'door-groan': 'amb-door-groan.mp3',
  scratch: 'amb-scratch.mp3',
  flicker: 'amb-flicker.mp3',
  'vo-open-your-eyes': 'vo-open-your-eyes.mp3',
  'vo-i-see-you': 'vo-i-see-you.mp3',
  'vo-still-here': 'vo-still-here.mp3',
  'vo-breathe': 'vo-breathe.mp3',
  'vo-not-alone': 'vo-not-alone.mp3',
}

const cache = new Map<SfxName, Promise<AudioBuffer | null>>()

/** Fetch + decode once, then reuse. Returns null rather than throwing if
 * anything goes wrong, so callers never need a try/catch. */
export function loadSfx(ctx: AudioContext, name: SfxName): Promise<AudioBuffer | null> {
  let entry = cache.get(name)
  if (!entry) {
    const url = `${import.meta.env.BASE_URL}audio/${FILES[name]}`
    entry = fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((buf) => ctx.decodeAudioData(buf))
      .catch(() => null)
    cache.set(name, entry)
  }
  return entry
}

/** Warm the cache for the sounds most likely to be needed, so the first
 * scare isn't preceded by a fetch. Fire-and-forget. */
export function preloadSfx(ctx: AudioContext) {
  const early: SfxName[] = [
    'crawler-skitter',
    'crawler-shriek',
    'smile-drag',
    'long-near',
    'scratch',
    'scare-stinger',
    'vo-open-your-eyes',
  ]
  for (const n of early) void loadSfx(ctx, n)
}
