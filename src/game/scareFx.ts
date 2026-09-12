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

// --- Web Audio, no asset files needed for the hackathon build ---
// Real design pass is ElevenLabs sound-effects (see PLAN.md); this is the
// zero-dependency placeholder so scares are audible tonight.
let ctx: AudioContext | null = null
let ambientGain: GainNode | null = null

function getCtx() {
  if (!ctx) ctx = new AudioContext()
  return ctx
}

/** Must be called synchronously inside a real click handler — Chrome
 * leaves AudioContext suspended otherwise, and starting it 60s later
 * inside a calibration-complete effect (well outside the gesture window)
 * silently produces no sound. Called from StartGate's onClick. */
export function unlockAudio() {
  const audioCtx = getCtx()
  if (audioCtx.state === 'suspended') audioCtx.resume()
}

/** Low drone that runs the whole session — muted for the 'absence' scare. */
export function startAmbient() {
  const audioCtx = getCtx()
  const osc = audioCtx.createOscillator()
  const gain = audioCtx.createGain()
  osc.type = 'sine'
  osc.frequency.value = 48
  gain.gain.value = 0.02
  osc.connect(gain).connect(audioCtx.destination)
  osc.start()
  ambientGain = gain
}

export function setAmbientVolume(muted: boolean) {
  if (!ambientGain) return
  ambientGain.gain.linearRampToValueAtTime(muted ? 0 : 0.02, getCtx().currentTime + 0.3)
}

function stinger(freq: number, durationMs: number, type: OscillatorType = 'sawtooth') {
  const audioCtx = getCtx()
  const osc = audioCtx.createOscillator()
  const gain = audioCtx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime)
  osc.frequency.exponentialRampToValueAtTime(freq * 0.3, audioCtx.currentTime + durationMs / 1000)
  gain.gain.setValueAtTime(0.15, audioCtx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + durationMs / 1000)
  osc.connect(gain).connect(audioCtx.destination)
  osc.start()
  osc.stop(audioCtx.currentTime + durationMs / 1000)
}

/** Central dispatch — called by the Director loop when it decides to strike. */
export function playScare(type: ScareType, setMonsterDistance: (d: number) => void) {
  switch (type) {
    case 'proximity':
      setMonsterDistance(0.1)
      break
    case 'audio':
      stinger(220, 400)
      break
    case 'visual':
      useScareFx.getState().triggerFlash()
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
