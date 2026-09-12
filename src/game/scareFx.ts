import { create } from 'zustand'
import type { ScareType } from './director'

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
} | null = null

export function startAmbient() {
  const audioCtx = getCtx()
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
  growlPanner.refDistance = 3
  growlPanner.maxDistance = 40
  const growlGain = audioCtx.createGain()
  growlGain.gain.value = 0
  growlNoise.connect(growlFilter).connect(growlPanner).connect(growlGain).connect(master())
  growlNoise.start()

  ambient = { droneGain, noiseGain, growlGain, growlFilter, growlPanner }
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
export function playFootstep() {
  const audioCtx = getCtx()
  const src = noiseSource(audioCtx)
  const filter = audioCtx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = 180 + Math.random() * 80
  filter.Q.value = 0.9
  const gain = audioCtx.createGain()
  gain.gain.setValueAtTime(0.05, audioCtx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.09)
  src.connect(filter).connect(gain).connect(master())
  src.start()
  src.stop(audioCtx.currentTime + 0.1)
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
 * useBlinkDetection.ts) — a breathy hiss panned hard into one ear, plus
 * the literal words via the browser's built-in speech synthesis (free,
 * no API key). Speech synthesis output can't be routed through this
 * WebAudio graph in most browsers, so it isn't itself spatialized — the
 * panned hiss underneath is what actually sells "which ear" it came from. */
export function playWhisper(ear: 'left' | 'right') {
  const audioCtx = getCtx()
  const t0 = audioCtx.currentTime
  const src = noiseSource(audioCtx)
  const filter = audioCtx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = 1200
  filter.Q.value = 0.6
  const gain = audioCtx.createGain()
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.linearRampToValueAtTime(0.1, t0 + 0.3)
  gain.gain.linearRampToValueAtTime(0.0001, t0 + 1.6)
  const panner = audioCtx.createStereoPanner()
  panner.pan.value = ear === 'left' ? -1 : 1
  src.connect(filter).connect(gain).connect(panner).connect(master())
  src.start()
  src.stop(t0 + 1.7)

  if ('speechSynthesis' in window) {
    const utter = new SpeechSynthesisUtterance('open your eyes')
    utter.volume = 0.5
    utter.pitch = 0.6
    utter.rate = 0.75
    window.speechSynthesis.speak(utter)
  }
}

/** A harsher, louder sting for the up-close "it almost got you" jumpscare —
 * distinct from the Director's four scare-type stingers below. */
export function playJumpscareSound() {
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
