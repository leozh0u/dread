import { create } from 'zustand'
import type { ScareType } from './director'
import { loadSfx, preloadSfx, type SfxName } from './sfxBank'

interface ScareFxState {
  flashActive: boolean
  ambientMuted: boolean
  triggerFlash: () => void
  setAmbientMuted: (m: boolean) => void
}

export const useScareFx = create<ScareFxState>((set) => ({
  flashActive: false,
  ambientMuted: false,
  triggerFlash: () => {
    set({ flashActive: true })
    setTimeout(() => set({ flashActive: false }), 120)
  },
  setAmbientMuted: (m) => set({ ambientMuted: m }),
}))

// --- Web Audio, no asset files or API keys needed ---
// Everything below is synthesized at runtime: filtered noise, oscillators,
// and envelopes. No ElevenLabs dependency — this is the real audio design,
// not a placeholder waiting on one. If/when an ElevenLabs key shows up this
// can layer voice lines on top, but the game is never silent without it.
let ctx: AudioContext | null = null
let masterGain: GainNode | null = null

function getCtx() {
  if (!ctx) {
    ctx = new AudioContext()
    masterGain = ctx.createGain()
    masterGain.gain.value = 1
    masterGain.connect(ctx.destination)
  }
  return ctx
}

// ---------------------------------------------------------------------------
// Room reverb. Every positioned sound is sent through a convolver built
// from a procedurally generated impulse response (a decaying noise burst),
// so footsteps and scrapes have the tail of a hard-walled corridor instead
// of sounding like they happened in a vacuum. This is the single biggest
// "the space is real" lever in the whole audio design.
// ---------------------------------------------------------------------------
let reverbSend: GainNode | null = null

function buildImpulseResponse(audioCtx: AudioContext, seconds: number, decay: number) {
  const rate = audioCtx.sampleRate
  const len = Math.floor(rate * seconds)
  const impulse = audioCtx.createBuffer(2, len, rate)
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch)
    for (let i = 0; i < len; i++) {
      // Noise with an exponential decay envelope — a rough but convincing
      // small-hard-room tail. Slight per-channel difference widens it.
      const t = i / len
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (ch === 0 ? 1 : 0.92)
    }
  }
  return impulse
}

/** Bus that positioned sounds send a copy of themselves into. */
function reverb() {
  const audioCtx = getCtx()
  if (!reverbSend) {
    const convolver = audioCtx.createConvolver()
    convolver.buffer = buildImpulseResponse(audioCtx, 1.6, 3.2)
    const wet = audioCtx.createGain()
    wet.gain.value = 0.32
    // Roll the top off the tail — concrete corridors eat high frequencies
    const damp = audioCtx.createBiquadFilter()
    damp.type = 'lowpass'
    damp.frequency.value = 2600
    reverbSend = audioCtx.createGain()
    reverbSend.gain.value = 1
    reverbSend.connect(convolver).connect(damp).connect(wet).connect(masterGain!)
  }
  return reverbSend
}

function master() {
  getCtx()
  return masterGain!
}

/** Must be called synchronously inside a real click handler — Chrome
 * leaves AudioContext suspended otherwise. Called from StartGate's onClick. */
export function unlockAudio() {
  const audioCtx = getCtx()
  if (audioCtx.state === 'suspended') audioCtx.resume()
}

// ---------------------------------------------------------------------------
// Noise buffer — one 2s white-noise buffer, reused (looped) everywhere so we
// never allocate a new Float32Array per sound effect.
// ---------------------------------------------------------------------------
let noiseBuffer: AudioBuffer | null = null
function getNoiseBuffer(audioCtx: AudioContext) {
  if (!noiseBuffer) {
    const len = audioCtx.sampleRate * 2
    noiseBuffer = audioCtx.createBuffer(1, len, audioCtx.sampleRate)
    const data = noiseBuffer.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  }
  return noiseBuffer
}

function noiseSource(audioCtx: AudioContext, loop = false) {
  const src = audioCtx.createBufferSource()
  src.buffer = getNoiseBuffer(audioCtx)
  src.loop = loop
  return src
}

// ---------------------------------------------------------------------------
// Ambient bed: sub-bass drone + filtered brown noise for room tone, plus a
// continuous monster growl layer whose volume/tone tracks how close it is.
// ---------------------------------------------------------------------------
let ambient: {
  droneGain: GainNode
  noiseGain: GainNode
  growlGain: GainNode
  growlFilter: BiquadFilterNode
  growlPanner: PannerNode
  occlusion: BiquadFilterNode
} | null = null

export function startAmbient() {
  const audioCtx = getCtx()
  preloadSfx(audioCtx)
  if (ambient) return // idempotent — restart shouldn't stack a second bed

  // Sub-bass drone, slowly detuned by an LFO so it never sits dead still.
  const drone = audioCtx.createOscillator()
  drone.type = 'sine'
  drone.frequency.value = 42
  const droneGain = audioCtx.createGain()
  droneGain.gain.value = 0.05
  const lfo = audioCtx.createOscillator()
  lfo.frequency.value = 0.07
  const lfoGain = audioCtx.createGain()
  lfoGain.gain.value = 3
  lfo.connect(lfoGain).connect(drone.frequency)
  drone.connect(droneGain).connect(master())
  drone.start()
  lfo.start()

  // Fluorescent hum — the defining sound of this kind of space, and the
  // thing that makes a lit corridor feel occupied by nothing. Mains-hum
  // fundamental plus its harmonic, very slightly detuned so it beats
  // against itself instead of sitting perfectly still.
  for (const [freq, level] of [
    [120, 0.022],
    [240, 0.012],
    [360, 0.005],
  ] as const) {
    const hum = audioCtx.createOscillator()
    hum.type = 'sawtooth'
    hum.frequency.value = freq + (Math.random() - 0.5) * 0.6
    const humFilter = audioCtx.createBiquadFilter()
    humFilter.type = 'lowpass'
    humFilter.frequency.value = 900
    const humGain = audioCtx.createGain()
    humGain.gain.value = level
    hum.connect(humFilter).connect(humGain).connect(master())
    hum.start()
  }

  // Filtered noise room tone — dark, low-passed "brown-ish" hiss.
  const roomNoise = noiseSource(audioCtx, true)
  const roomFilter = audioCtx.createBiquadFilter()
  roomFilter.type = 'lowpass'
  roomFilter.frequency.value = 220
  const noiseGain = audioCtx.createGain()
  noiseGain.gain.value = 0.035
  roomNoise.connect(roomFilter).connect(noiseGain).connect(master())
  roomNoise.start()

  // Monster growl bed — bandpassed noise, starts silent; setMonsterProximity
  // drives its gain/filter every frame, setMonsterAudioPosition drives the
  // panner so it actually sounds like it's coming from where the thing is
  // relative to the player, not centered in both ears.
  const growlNoise = noiseSource(audioCtx, true)
  const growlFilter = audioCtx.createBiquadFilter()
  growlFilter.type = 'bandpass'
  growlFilter.frequency.value = 90
  growlFilter.Q.value = 1.2
  const growlPanner = audioCtx.createPanner()
  growlPanner.panningModel = 'HRTF'
  growlPanner.distanceModel = 'inverse'
  // A tighter refDistance + steeper rolloff than the default exaggerates
  // the near/far and left/right difference — real HRTF alone can be
  // subtle on non-ideal speakers/headphones, and the whole point of this
  // sound is "I can tell where it is."
  growlPanner.refDistance = 1.2
  growlPanner.rolloffFactor = 2.2
  growlPanner.maxDistance = 40
  const growlGain = audioCtx.createGain()
  growlGain.gain.value = 0
  // Occlusion filter — setMonsterProximity opens/closes this with distance
  const occlusion = audioCtx.createBiquadFilter()
  occlusion.type = 'lowpass'
  occlusion.frequency.value = 600
  growlNoise
    .connect(growlFilter)
    .connect(growlPanner)
    .connect(occlusion)
    .connect(growlGain)
    .connect(master())
  growlGain.connect(reverb())
  growlNoise.start()

  // Heavy breathing, layered into the same panned/positioned chain as the
  // growl — a slow LFO on gain gives it an inhale/exhale rhythm instead of
  // a flat hiss, so the thing sounds like it's actually breathing
  // somewhere specific, not just "present."
  const breathNoise = noiseSource(audioCtx, true)
  const breathFilter = audioCtx.createBiquadFilter()
  breathFilter.type = 'lowpass'
  breathFilter.frequency.value = 500
  const breathGain = audioCtx.createGain()
  breathGain.gain.value = 0.06
  const breathLfo = audioCtx.createOscillator()
  breathLfo.frequency.value = 0.35
  const breathLfoGain = audioCtx.createGain()
  breathLfoGain.gain.value = 0.05
  breathLfo.connect(breathLfoGain).connect(breathGain.gain)
  breathNoise.connect(breathFilter).connect(breathGain).connect(growlPanner)
  breathNoise.start()
  breathLfo.start()

  ambient = { droneGain, noiseGain, growlGain, growlFilter, growlPanner, occlusion }
}

/** A one-shot positioned sound source — every "this happened over there"
 * effect (monster footsteps, ambient creaks/scratches) shares this
 * tuning so the whole game's spatial audio reads consistently. Tighter
 * refDistance + steeper rolloff than the Web Audio defaults, because the
 * point is "I can tell where that came from," not physical accuracy. */
function positionedPanner(audioCtx: AudioContext, x: number, y: number, z: number) {
  const panner = audioCtx.createPanner()
  panner.panningModel = 'HRTF'
  panner.distanceModel = 'inverse'
  panner.refDistance = 1.2
  panner.rolloffFactor = 2.2
  panner.maxDistance = 40
  if (panner.positionX) {
    panner.positionX.value = x
    panner.positionY.value = y
    panner.positionZ.value = z
  } else {
    panner.setPosition(x, y, z)
  }
  panner.connect(master())
  panner.connect(reverb()) // send a copy into the corridor tail
  return panner
}

/**
 * Plays a real recorded one-shot at a world position, through the same
 * panner + reverb chain as everything else so it sits in the space
 * rather than on top of it. Silently does nothing if the file didn't
 * load — never throws, never blocks.
 */
export function playSpatialSfx(
  name: SfxName,
  x: number,
  y: number,
  z: number,
  { volume = 1, rate = 1 }: { volume?: number; rate?: number } = {},
) {
  const audioCtx = getCtx()
  void loadSfx(audioCtx, name).then((buffer) => {
    if (!buffer) return
    const panner = positionedPanner(audioCtx, x, y, z)
    const src = audioCtx.createBufferSource()
    src.buffer = buffer
    src.playbackRate.value = rate
    const gain = audioCtx.createGain()
    gain.gain.value = volume
    src.connect(gain).connect(panner)
    src.start()
  })
}

/** Non-positional one-shot — for things that happen to *you* rather than
 * somewhere in the room (jumpscares, whispers at your ear). */
export function playSfx(name: SfxName, { volume = 1, rate = 1, pan = 0 } = {}) {
  const audioCtx = getCtx()
  void loadSfx(audioCtx, name).then((buffer) => {
    if (!buffer) return
    const src = audioCtx.createBufferSource()
    src.buffer = buffer
    src.playbackRate.value = rate
    const gain = audioCtx.createGain()
    gain.gain.value = volume
    const panner = audioCtx.createStereoPanner()
    panner.pan.value = pan
    src.connect(gain).connect(panner).connect(master())
    gain.connect(reverb())
    src.start()
  })
}

/** One heavy footstep — a low thud plus a breathy noise transient,
 * positioned at the monster's exact location so its footfalls pan and
 * attenuate correctly even though the continuous growl/breathing bed is
 * a separate, always-on chain. */
export function playMonsterFootstep(x: number, y: number, z: number, pitch = 1) {
  const audioCtx = getCtx()
  const t0 = audioCtx.currentTime
  const panner = positionedPanner(audioCtx, x, y, z)

  const osc = audioCtx.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(75 * pitch, t0)
  osc.frequency.exponentialRampToValueAtTime(32 * pitch, t0 + 0.16)
  const oGain = audioCtx.createGain()
  oGain.gain.setValueAtTime(0.3, t0)
  oGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22)
  osc.connect(oGain).connect(panner)
  osc.start(t0)
  osc.stop(t0 + 0.24)

  const src = noiseSource(audioCtx)
  const filter = audioCtx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 450 * pitch
  const nGain = audioCtx.createGain()
  nGain.gain.setValueAtTime(0.14, t0)
  nGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28)
  src.connect(filter).connect(nGain).connect(panner)
  src.start()
  src.stop(t0 + 0.3)
}

/** Called every frame with the monster's world position so the growl pans
 * and attenuates correctly relative to wherever the listener currently is. */
export function setMonsterAudioPosition(x: number, y: number, z: number) {
  if (!ambient) return
  const p = ambient.growlPanner
  if (p.positionX) {
    p.positionX.value = x
    p.positionY.value = y
    p.positionZ.value = z
  } else {
    p.setPosition(x, y, z)
  }
}

/** Called every frame from the camera so the whole spatial audio graph
 * (currently just the monster growl, but anything panned in future routes
 * through this) tracks where the player is actually looking. */
export function updateAudioListener(
  px: number,
  py: number,
  pz: number,
  fx: number,
  fy: number,
  fz: number,
) {
  const listener = getCtx().listener
  if (listener.positionX) {
    listener.positionX.value = px
    listener.positionY.value = py
    listener.positionZ.value = pz
    listener.forwardX.value = fx
    listener.forwardY.value = fy
    listener.forwardZ.value = fz
    listener.upX.value = 0
    listener.upY.value = 1
    listener.upZ.value = 0
  } else if (listener.setPosition) {
    listener.setPosition(px, py, pz)
    listener.setOrientation(fx, fy, fz, 0, 1, 0)
  }
}

export function setAmbientVolume(muted: boolean) {
  if (!ambient) return
  const t = getCtx().currentTime
  ambient.droneGain.gain.linearRampToValueAtTime(muted ? 0 : 0.05, t + 0.3)
  ambient.noiseGain.gain.linearRampToValueAtTime(muted ? 0 : 0.035, t + 0.3)
}

/** distance: 0 = on top of you, 1 = far away. Call every frame — cheap,
 * only touches gain/filter params, never allocates a node. */
export function setMonsterProximity(distance: number) {
  if (!ambient) return
  const closeness = 1 - Math.max(0, Math.min(1, distance))
  const t = getCtx().currentTime
  ambient.growlGain.gain.linearRampToValueAtTime(closeness ** 2 * 0.22, t + 0.15)
  ambient.growlFilter.frequency.linearRampToValueAtTime(80 + closeness * 60, t + 0.15)
  // Occlusion approximation: sound reaching you from far away in a maze
  // has gone through walls and around corners, which eats the high end.
  // Close = full bandwidth and clearly locatable; distant = a muffled
  // rumble you can feel but not pin down. That contrast is what makes
  // "it's getting closer" legible by ear alone.
  ambient.occlusion.frequency.linearRampToValueAtTime(420 + closeness * 3600, t + 0.2)
}

// ---------------------------------------------------------------------------
// Heartbeat — a real "lub-dub" synced to the player's actual bpm. This is
// the single most important sound in the game: it ties the core biometric
// mechanic to something the player *hears*, not just reads off a HUD number.
// ---------------------------------------------------------------------------
let heartbeatGetBpm: (() => number | null) | null = null
let heartbeatTimer: ReturnType<typeof setTimeout> | null = null

function thump(delaySec: number, freq: number, gainPeak: number) {
  const audioCtx = getCtx()
  const t0 = audioCtx.currentTime + delaySec
  const osc = audioCtx.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(freq, t0)
  osc.frequency.exponentialRampToValueAtTime(freq * 0.6, t0 + 0.14)
  const gain = audioCtx.createGain()
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.exponentialRampToValueAtTime(gainPeak, t0 + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18)
  osc.connect(gain).connect(master())
  osc.start(t0)
  osc.stop(t0 + 0.2)
}

function scheduleNextBeat() {
  const bpm = heartbeatGetBpm?.() ?? 70
  const clamped = Math.max(40, Math.min(160, bpm))
  thump(0, 55, 0.09) // lub
  thump(0.14, 42, 0.05) // dub
  const interval = (60_000 / clamped) - 40
  heartbeatTimer = setTimeout(scheduleNextBeat, Math.max(250, interval))
}

/** Starts the heartbeat loop; getBpm is polled fresh every beat so tempo
 * tracks the player's live pulse without re-subscribing anything. */
export function startHeartbeatAudio(getBpm: () => number | null) {
  if (heartbeatTimer != null) return // already running
  heartbeatGetBpm = getBpm
  scheduleNextBeat()
}

export function stopHeartbeatAudio() {
  if (heartbeatTimer != null) clearTimeout(heartbeatTimer)
  heartbeatTimer = null
  heartbeatGetBpm = null
}

// ---------------------------------------------------------------------------
// Footsteps
// ---------------------------------------------------------------------------
/** A short exhale-ish whoosh on takeoff — subtle, just enough that a jump
 * doesn't feel silent. */
export function playJumpSound() {
  const audioCtx = getCtx()
  const t0 = audioCtx.currentTime
  const src = noiseSource(audioCtx)
  const filter = audioCtx.createBiquadFilter()
  filter.type = 'highpass'
  filter.frequency.value = 800
  const gain = audioCtx.createGain()
  gain.gain.setValueAtTime(0.06, t0)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.15)
  src.connect(filter).connect(gain).connect(master())
  src.start()
  src.stop(t0 + 0.16)
}

/** Landing thud, scaled by how hard the fall was — a light hop lands soft,
 * jumping off something taller lands with real weight. `impact` is the
 * fall speed at touchdown (roughly 0-12 units/s in practice). */
export function playLandSound(impact: number) {
  const audioCtx = getCtx()
  const t0 = audioCtx.currentTime
  const strength = Math.min(1, impact / 8)
  const osc = audioCtx.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(85, t0)
  osc.frequency.exponentialRampToValueAtTime(40, t0 + 0.12)
  const oGain = audioCtx.createGain()
  oGain.gain.setValueAtTime(0.08 + strength * 0.22, t0)
  oGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18)
  osc.connect(oGain).connect(master())
  osc.start(t0)
  osc.stop(t0 + 0.2)

  const src = noiseSource(audioCtx)
  const filter = audioCtx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = 220
  filter.Q.value = 0.8
  const nGain = audioCtx.createGain()
  nGain.gain.setValueAtTime(0.04 + strength * 0.12, t0)
  nGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12)
  src.connect(filter).connect(nGain).connect(master())
  src.start()
  src.stop(t0 + 0.14)
}

let footstepLeft = true

/** The player's own footsteps — alternates a faint L/R pan per step (left
 * foot, right foot) for a subtle sense of your own body. Built entirely
 * from filtered noise, deliberately no oscillator/tone: a pitched sine
 * "thud" reads as a drum hit, not a footstep. Two noise layers instead —
 * a dull lowpassed "weight" (the sole meeting the floor) and a tiny
 * highpassed "scuff" (the contact transient) — with per-step randomized
 * cutoffs so consecutive steps don't sound identical. */
export function playFootstep() {
  const audioCtx = getCtx()
  const t0 = audioCtx.currentTime
  const panner = audioCtx.createStereoPanner()
  panner.pan.value = footstepLeft ? -0.35 : 0.35
  footstepLeft = !footstepLeft
  panner.connect(master())

  // Weight: dull, low, no ringing — a lowpass (not bandpass) so there's no
  // resonant tone, just a soft muffled thump.
  const weight = noiseSource(audioCtx)
  const weightFilter = audioCtx.createBiquadFilter()
  weightFilter.type = 'lowpass'
  weightFilter.frequency.value = 250 + Math.random() * 120
  weightFilter.Q.value = 0.3
  const weightGain = audioCtx.createGain()
  weightGain.gain.setValueAtTime(0.09, t0)
  weightGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.07)
  weight.connect(weightFilter).connect(weightGain).connect(panner)
  weight.start()
  weight.stop(t0 + 0.08)

  // Scuff: brief, quiet, high — the contact transient. Tiny relative to
  // the weight layer, just enough texture to read as a real step.
  const scuff = noiseSource(audioCtx)
  const scuffFilter = audioCtx.createBiquadFilter()
  scuffFilter.type = 'highpass'
  scuffFilter.frequency.value = 2500 + Math.random() * 1500
  const scuffGain = audioCtx.createGain()
  scuffGain.gain.setValueAtTime(0.02, t0)
  scuffGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.02)
  scuff.connect(scuffFilter).connect(scuffGain).connect(panner)
  scuff.start()
  scuff.stop(t0 + 0.03)
}

// ---------------------------------------------------------------------------
// Scare stingers — one distinct, textured sound per scare type instead of a
// single generic tone.
// ---------------------------------------------------------------------------
function screech() {
  // 'audio' scare: a rising filtered-noise shriek, unpleasant and sharp.
  const audioCtx = getCtx()
  const t0 = audioCtx.currentTime
  const src = noiseSource(audioCtx)
  const filter = audioCtx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.Q.value = 8
  filter.frequency.setValueAtTime(400, t0)
  filter.frequency.exponentialRampToValueAtTime(3200, t0 + 0.5)
  const gain = audioCtx.createGain()
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.08)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6)
  src.connect(filter).connect(gain).connect(master())
  src.start()
  src.stop(t0 + 0.65)
}

function stab() {
  // 'visual' scare: a sharp percussive stab to land with the screen flash.
  const audioCtx = getCtx()
  const t0 = audioCtx.currentTime
  const osc = audioCtx.createOscillator()
  osc.type = 'square'
  osc.frequency.setValueAtTime(180, t0)
  osc.frequency.exponentialRampToValueAtTime(50, t0 + 0.12)
  const gain = audioCtx.createGain()
  gain.gain.setValueAtTime(0.3, t0)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.15)
  osc.connect(gain).connect(master())
  osc.start(t0)
  osc.stop(t0 + 0.16)

  const src = noiseSource(audioCtx)
  const filter = audioCtx.createBiquadFilter()
  filter.type = 'highpass'
  filter.frequency.value = 2000
  const ngain = audioCtx.createGain()
  ngain.gain.setValueAtTime(0.15, t0)
  ngain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.08)
  src.connect(filter).connect(ngain).connect(master())
  src.start()
  src.stop(t0 + 0.1)
}

function proximityLunge() {
  // 'proximity' scare: a low distorted growl-punch as it snaps close.
  const audioCtx = getCtx()
  const t0 = audioCtx.currentTime
  const osc = audioCtx.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(90, t0)
  osc.frequency.exponentialRampToValueAtTime(35, t0 + 0.4)
  const filter = audioCtx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 400
  const gain = audioCtx.createGain()
  gain.gain.setValueAtTime(0.28, t0)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5)
  osc.connect(filter).connect(gain).connect(master())
  osc.start(t0)
  osc.stop(t0 + 0.55)
}

/** Fired when the player's eyes have been closed too long (see
 * useBlinkDetection.ts) — the recorded whisper panned hard into one ear,
 * with a breathy noise-hiss layered underneath for extra presence. */
export function playWhisper(ear: 'left' | 'right') {
  const audioCtx = getCtx()
  const t0 = audioCtx.currentTime
  const pan = ear === 'left' ? -0.9 : 0.9

  // Breathy hiss underneath, panned hard — sells "at your ear" even
  // before the words land.
  const panner = audioCtx.createStereoPanner()
  panner.pan.value = pan
  panner.connect(master())
  const src = noiseSource(audioCtx)
  const filter = audioCtx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = 1200
  filter.Q.value = 0.6
  const gain = audioCtx.createGain()
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.linearRampToValueAtTime(0.06, t0 + 0.3)
  gain.gain.linearRampToValueAtTime(0.0001, t0 + 1.6)
  src.connect(filter).connect(gain).connect(panner)
  src.start()
  src.stop(t0 + 1.7)

  // A real voice, pitched slightly down and hard-panned to the same ear.
  // Rotating between lines matters: the same clip twice stops being
  // frightening immediately.
  const lines: SfxName[] = [
    'vo-open-your-eyes',
    'vo-open-your-eyes', // weighted — it's the one that fits the trigger
    'vo-i-see-you',
    'vo-still-here',
    'vo-not-alone',
  ]
  playSfx(lines[Math.floor(Math.random() * lines.length)], {
    volume: 0.85,
    rate: 0.92,
    pan,
  })
}

/** A harsher, louder sting for the up-close "it almost got you" jumpscare —
 * distinct from the Director's four scare-type stingers below. */
export function playJumpscareSound() {
  // Real recording layered over the synthesised sweep — the recording
  // has the texture, the synth has the instant attack.
  playSfx('scare-stinger', { volume: 0.9 })
  const audioCtx = getCtx()
  const t0 = audioCtx.currentTime
  const src = noiseSource(audioCtx)
  const filter = audioCtx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.Q.value = 4
  filter.frequency.setValueAtTime(1800, t0)
  filter.frequency.exponentialRampToValueAtTime(200, t0 + 0.35)
  const gain = audioCtx.createGain()
  gain.gain.setValueAtTime(0.4, t0)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.4)
  src.connect(filter).connect(gain).connect(master())
  src.start()
  src.stop(t0 + 0.45)
}

// ---------------------------------------------------------------------------
// Ambient horror stingers — random, positioned, and NOT tied to the
// Director or the monster's actual location. These are the "something
// else in this house" sounds: a creak, a scratch, from a spot the monster
// isn't. Unpredictability is the point — see useAmbientHorror.ts, which
// fires these on a random timer at a random point in the maze.
// ---------------------------------------------------------------------------

/** A slow wooden creak — a door hinge or a floorboard settling. Long,
 * low, with an unstable pitch that never quite resolves. */
export function playCreak(x: number, y: number, z: number) {
  const audioCtx = getCtx()
  const t0 = audioCtx.currentTime
  const panner = positionedPanner(audioCtx, x, y, z)

  const osc = audioCtx.createOscillator()
  osc.type = 'sawtooth'
  const wobble = 60 + Math.random() * 40
  osc.frequency.setValueAtTime(wobble, t0)
  osc.frequency.linearRampToValueAtTime(wobble * 1.4, t0 + 0.6)
  osc.frequency.linearRampToValueAtTime(wobble * 0.8, t0 + 1.3)
  const filter = audioCtx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 500
  const gain = audioCtx.createGain()
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.linearRampToValueAtTime(0.12, t0 + 0.15)
  gain.gain.linearRampToValueAtTime(0.0001, t0 + 1.4)
  osc.connect(filter).connect(gain).connect(panner)
  osc.start(t0)
  osc.stop(t0 + 1.5)
}

/** A quick burst of scratching — claws or nails, several short irregular
 * scrapes rather than one clean sound. */
export function playScratch(x: number, y: number, z: number) {
  const audioCtx = getCtx()
  const panner = positionedPanner(audioCtx, x, y, z)
  const scrapes = 3 + Math.floor(Math.random() * 3)
  let cursor = audioCtx.currentTime

  for (let i = 0; i < scrapes; i++) {
    const t0 = cursor
    const src = noiseSource(audioCtx)
    const filter = audioCtx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 2000 + Math.random() * 2500
    filter.Q.value = 3
    const gain = audioCtx.createGain()
    const dur = 0.05 + Math.random() * 0.08
    gain.gain.setValueAtTime(0.001, t0)
    gain.gain.linearRampToValueAtTime(0.1, t0 + dur * 0.3)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    src.connect(filter).connect(gain).connect(panner)
    src.start(t0)
    src.stop(t0 + dur + 0.02)
    cursor += dur + 0.03 + Math.random() * 0.06
  }
}

/** Central dispatch — called by the Director loop when it decides to strike. */
export function playScare(type: ScareType, setMonsterDistance: (d: number) => void) {
  switch (type) {
    case 'proximity':
      setMonsterDistance(0.1)
      proximityLunge()
      break
    case 'audio':
      screech()
      break
    case 'visual':
      useScareFx.getState().triggerFlash()
      stab()
      break
    case 'absence':
      useScareFx.getState().setAmbientMuted(true)
      setAmbientVolume(true)
      setTimeout(() => {
        useScareFx.getState().setAmbientMuted(false)
        setAmbientVolume(false)
      }, 4000)
      break
  }
}
