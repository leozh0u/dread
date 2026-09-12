import { useEffect, useRef } from 'react'
import { usePulseStore } from '../lib/usePulse'
import { useDirector, type ScareType, type DirectorPhase } from './director'
import { useSensorless } from './sensorless'
import { duckAmbient, playSfx } from './scareFx'
import { useSession } from './session'
import { useBlinkStore } from '../lib/useBlinkDetection'
import { arousalFrom, hasRecovered } from './arousal'

const CALIBRATION_MS = 60_000 // Presage HRV baseline window — see plan notes

/**
 * How long to wait for ANY pulse reading before giving up on the sensor
 * and starting the game anyway.
 *
 * Calibration only advanced while a reading existed, and there was no
 * timeout — so if the camera was denied, unavailable, or simply failed,
 * bpm stayed null forever, the session never started, and the player sat
 * in a dark maze where nothing would ever happen. A judge hitting that
 * doesn't file a bug, they close the tab, and "allow camera access" is
 * exactly the prompt people reflexively dismiss.
 *
 * The biometrics are the point of this game, but they cannot be a
 * precondition for it running at all.
 */
const SENSOR_GRACE_MS = 25_000
const DEFAULT_BASELINE = 72

/**
 * With no sensor there's no arousal to react to, so the Director would
 * sit in one phase forever and the monster would never escalate or back
 * off. Falling back to a slow timed cycle keeps the game's rhythm — push,
 * strike, withdraw, recover — just without it being about *you*.
 */
const BLIND_PHASE_MS = 22_000

/**
 * What it takes for a blind run to decide the sensor is genuinely back.
 * Readings arrive about once per animation frame, so this is a couple of
 * seconds of uninterrupted signal rather than a lucky estimate.
 */
const LATE_ACQUIRE_SAMPLES = 90
const LATE_ACQUIRE_CONFIDENCE = 0.3

/**
 * TWO CLOCKS. This is the core design constraint of the whole project.
 *
 * Slow clock: Presage pulse, averaged over ~12s. Good for "is this person
 * actually frightened", useless for "did that just land".
 *
 * Fast clock: the startle response on the face, 100-300ms (see
 * useBlinkDetection.ts). Good for "did that just land", tells you nothing
 * about sustained arousal.
 *
 * The reason both are needed isn't elegance, it's that they fail in
 * opposite places. rPPG is corrupted by motion — and the player moves most
 * at exactly the moment a scare lands, so pulse confidence collapses
 * precisely when the measurement matters. The face doesn't care that you
 * moved. So: judge a scare on the face, judge the person on the pulse, and
 * when pulse confidence collapses, lean on the face.
 */
export const SCARE_WINDOW_MS = 12_000
const FLINCH_CREDIT_BPM = 9 // what a flinch is "worth" when pulse is unusable
const LOW_CONFIDENCE = 0.35

/**
 * Turn "what the two channels saw" into the single bpm-after number the
 * bandit learns from.
 *
 * Pulled out as a pure function because it decides what the Director
 * believes about the player, and a wrong answer here is invisible — the
 * game keeps running, it just learns the wrong thing and picks worse
 * scares forever. Tested in scripts/directortest.ts.
 */
export function scoreScare(args: {
  bpmBefore: number
  bpmNow: number
  confidence: number
  flinched: boolean
}): number {
  const { bpmBefore, bpmNow, confidence, flinched } = args
  const pulseUsable = confidence >= LOW_CONFIDENCE

  // If Presage lost the signal — most likely precisely BECAUSE the player
  // jumped — the bpm delta is noise, not evidence. Score off the face
  // rather than teaching the bandit from garbage.
  if (!pulseUsable) return bpmBefore + (flinched ? FLINCH_CREDIT_BPM : 0)

  // A flinch is real evidence even when the pulse also registered, so it
  // adds on top rather than being discarded.
  return flinched ? bpmNow + FLINCH_CREDIT_BPM / 2 : bpmNow
}

/**
 * How long STRIKE stays on screen before the Director withdraws.
 *
 * STRIKE used to be set and overwritten inside the same tick —
 * `setPhase('STRIKE')`, fire the scare, `setPhase('WITHDRAW')`, all in one
 * synchronous block. React batches those, so the phase readout went
 * straight from STALK to WITHDRAW and the player never saw the game
 * commit to anything. The one moment the Director decides to come for you
 * was the one moment it never showed.
 *
 * It matters beyond the readout: STRIKE is the phase the creatures read to
 * decide whether to pursue in earnest, so a strike that existed for zero
 * frames was a strike they could not act on.
 */
const STRIKE_HOLD_MS = 2200

/**
 * The phase machine, as a pure function.
 *
 * This is the headline claim of the entire project — scared and it backs
 * off, calm and it comes for you — and it had no test, because it lived
 * inside a useEffect tangled up with audio, refs and the bandit. It is the
 * first thing the demo video says out loud and the thing a judge is most
 * likely to poke at.
 *
 * The inversion lives in one line: STALK advances to STRIKE when the
 * player has RECOVERED, not when they are frightened.
 */
export function nextPhase(args: {
  phase: DirectorPhase
  arousal: number
  recovered: boolean
}): { phase: DirectorPhase; fireScare: boolean } {
  const { phase, arousal, recovered } = args
  switch (phase) {
    case 'CALIBRATING':
      // Nothing happens until there is a baseline to compare against.
      return { phase, fireScare: false }
    case 'STALK':
      // THE INVERSION. Calm is the trigger, not fright.
      return recovered ? { phase: 'STRIKE', fireScare: true } : { phase, fireScare: false }
    case 'STRIKE':
      // Held for STRIKE_HOLD_MS by the caller, then it always withdraws —
      // the whole point is that it does not stay and grind you down.
      return { phase: 'WITHDRAW', fireScare: false }
    case 'WITHDRAW':
      // Still frightened: stay away and let it land. Settled: start
      // allowing them back up.
      return { phase: arousal > AROUSAL_HIGH ? 'WITHDRAW' : 'RECOVER', fireScare: false }
    case 'RECOVER':
      return { phase: recovered ? 'STALK' : 'RECOVER', fireScare: false }
    default:
      return { phase, fireScare: false }
  }
}

/** Above this, the player is still visibly frightened. */
export const AROUSAL_HIGH = 0.6

/**
 * Wires live biometrics to Director phase transitions (CALIBRATING ->
 * STALK -> STRIKE -> WITHDRAW -> RECOVER -> ...). Mount once at the game
 * root. Pure side-effect hook — no rendering. Monster.tsx reads `phase`
 * directly to decide where the monster actually goes.
 *
 * Reads BOTH clocks — see the note above SCARE_WINDOW_MS for why one isn't
 * enough.
 */
export function useDirectorLoop(onScare: (type: ScareType) => void) {
  const bpm = usePulseStore((s) => s.bpm)
  const confidence = usePulseStore((s) => s.confidence)
  const baseline = usePulseStore((s) => s.baseline)
  const setBaseline = usePulseStore((s) => s.setBaseline)
  const phase = useDirector((s) => s.phase)
  const setPhase = useDirector((s) => s.setPhase)
  const pickScare = useDirector((s) => s.pickScare)
  const recordScareOutcome = useDirector((s) => s.recordScareOutcome)
  const monsterDistance = useDirector((s) => s.monsterDistance)
  const sessionStart = useSession((s) => s.start)
  const blind = useSensorless((s) => s.blind)

  const lastPhase = useRef<DirectorPhase | null>(null)
  const calibrationStart = useRef<number | null>(null)
  /** Wall-clock until which STRIKE is held. See STRIKE_HOLD_MS. */
  const strikeUntil = useRef(0)
  const calibrationSamples = useRef<number[]>([])
  const pendingScare = useRef<{
    type: ScareType
    bpmBefore: number
    firedAt: number
    flinchBaseline: number
  } | null>(null)

  // --- Calibration: first 60s of readings sets resting baseline ---
  useEffect(() => {
    if (phase !== 'CALIBRATING' || bpm == null) return
    if (calibrationStart.current == null) calibrationStart.current = Date.now()
    calibrationSamples.current.push(bpm)

    if (Date.now() - calibrationStart.current >= CALIBRATION_MS) {
      const avg =
        calibrationSamples.current.reduce((a, b) => a + b, 0) / calibrationSamples.current.length
      setBaseline(Math.round(avg))
      setPhase('STALK')
      sessionStart()
    }
  }, [bpm, phase, setBaseline, setPhase, sessionStart])

  // --- Make the adaptive loop audible ---
  // Without this the Director's response to the player's body happened
  // entirely off screen: the monster changed speed somewhere in the maze
  // and nothing told you the game had reacted to you at all.
  useEffect(() => {
    if (lastPhase.current === phase) return
    const prev = lastPhase.current
    lastPhase.current = phase
    if (prev == null) return

    if (phase === 'WITHDRAW') {
      // It got to you, and it's backing off to let that land.
      duckAmbient(4.5)
      if (Math.random() < 0.4) playSfx('vo-still-here', { volume: 0.5 })
    }
  }, [phase])

  // --- Watchdog: start the game even if the sensor never works ---
  useEffect(() => {
    if (phase !== 'CALIBRATING') return
    const timer = setTimeout(() => {
      if (useDirector.getState().phase !== 'CALIBRATING') return
      if (usePulseStore.getState().bpm != null) return
      console.warn('[dread] no pulse signal — starting without it')
      useSensorless.getState().setBlind(true)
      setBaseline(DEFAULT_BASELINE)
      setPhase('STALK')
      sessionStart()
    }, SENSOR_GRACE_MS)
    return () => clearTimeout(timer)
  }, [phase, setBaseline, setPhase, sessionStart])

  /**
   * LATE ACQUISITION — a blind run that gets its sight back.
   *
   * The watchdog gives up after 25 seconds, sets a placeholder baseline of
   * 72 and starts the game. That is right: a judge who dismissed the
   * camera prompt must still get a playable game. But blind then latched
   * for the whole session, so a run that began a few seconds before the
   * camera was ready spent its entire length comparing the player against
   * a number that was never theirs. Every Director decision in that run —
   * escalate, withdraw, recover — was made against a stranger's heart
   * rate. Leo's runs were starting exactly that way.
   *
   * The original reasoning for latching was sound as far as it went: a
   * baseline that was never real cannot be trusted later. The answer is
   * not to stay blind, it is to stop using the fake baseline. Once real
   * readings are actually arriving, a few seconds of them gives a genuine
   * resting rate, and from that point the run is as good as one that
   * calibrated normally.
   *
   * Deliberately requires several consecutive readings rather than one.
   * A single reading arriving is not evidence the sensor is working; it
   * is evidence that one frequency estimate cleared the confidence floor.
   */
  const lateSamples = useRef<number[]>([])
  useEffect(() => {
    if (!blind || phase === 'CALIBRATING') return
    if (bpm == null || confidence < LATE_ACQUIRE_CONFIDENCE) {
      // A gap resets it. Half a dozen readings scattered across a minute
      // is a flaky signal, not a resting rate.
      lateSamples.current = []
      return
    }
    lateSamples.current.push(bpm)
    if (lateSamples.current.length < LATE_ACQUIRE_SAMPLES) return

    const sorted = [...lateSamples.current].sort((a, b) => a - b)
    const median = Math.round(sorted[Math.floor(sorted.length / 2)])
    lateSamples.current = []
    console.info(`[dread] sensor came back — recalibrating baseline to ${median} bpm`)
    setBaseline(median)
    useSensorless.getState().setBlind(false)
  }, [bpm, confidence, blind, phase, setBaseline])

  // --- Blind mode: keep the game's rhythm without a signal to react to ---
  useEffect(() => {
    if (!blind || phase === 'CALIBRATING') return
    const cycle: DirectorPhase[] = ['STALK', 'STRIKE', 'WITHDRAW', 'RECOVER']
    let i = 0
    const timer = setInterval(() => {
      i = (i + 1) % cycle.length
      const next = cycle[i]
      setPhase(next)
      if (next === 'STRIKE') onScare(useDirector.getState().pickScare())
    }, BLIND_PHASE_MS)
    return () => clearInterval(timer)
  }, [blind, phase, setPhase, onScare])

  // --- Post-calibration: react to arousal relative to baseline ---
  useEffect(() => {
    if (phase === 'CALIBRATING' || bpm == null || baseline == null) return
    const delta = bpm - baseline

    // --- scoring a scare, across both clocks ---
    const p = pendingScare.current
    if (p && Date.now() - p.firedAt > SCARE_WINDOW_MS) {
      // Did the face react in the moment? lastFlinchAt is a
      // performance.now() stamp, so a change since the scare fired means a
      // startle happened inside the window.
      const flinched = useBlinkStore.getState().lastFlinchAt > p.flinchBaseline
      const bpmAfter = scoreScare({
        bpmBefore: p.bpmBefore,
        bpmNow: bpm,
        confidence,
        flinched,
      })
      recordScareOutcome(p.type, p.bpmBefore, bpmAfter)
      pendingScare.current = null
    }

    // Arousal via the MATLAB-solved autonomic model (see arousal.ts and
    // matlab/autonomic_model.m). HRV isn't wired through from the
    // sidecar yet, so this currently runs on HR deviation alone — the
    // model handles that case, it's just less discriminating.
    const slowArousal = arousalFrom(delta, null)
    // The face can only raise arousal, never lower it. A calm face is not
    // evidence of calm — plenty of frightened people go still — but a
    // startled face is hard evidence of fright.
    const startle = useBlinkStore.getState().startle
    const arousal = Math.max(slowArousal, startle)
    // Recovery stays a pulse decision. Coming down is a slow, physiological
    // thing; letting a neutral face declare recovery would have the monster
    // return the instant someone stopped grimacing.
    const recovered = hasRecovered(delta, null) && startle < 0.3

    // Hold STRIKE long enough to be seen and acted on — see
    // STRIKE_HOLD_MS. Without this the phase existed for zero frames.
    if (phase === 'STRIKE' && Date.now() < strikeUntil.current) return

    const { phase: next, fireScare } = nextPhase({ phase, arousal, recovered })

    if (fireScare) {
      const type = pickScare()
      pendingScare.current = {
        type,
        bpmBefore: bpm,
        firedAt: Date.now(),
        flinchBaseline: useBlinkStore.getState().lastFlinchAt,
      }
      strikeUntil.current = Date.now() + STRIKE_HOLD_MS
      setPhase(next)
      onScare(type)
    } else if (next !== phase) {
      setPhase(next)
    }
  }, [bpm, confidence, baseline, phase, setPhase, pickScare, onScare, recordScareOutcome])

  // Monster position/movement (and therefore monsterDistance) is now owned
  // by Monster.tsx's per-frame AI — it patrols/hunts/retreats based on
  // `phase` and derives monsterDistance from its real distance to the
  // player, rather than this loop stepping an abstract slider. See
  // Monster.tsx for why: a scripted slider couldn't represent "the thing
  // is somewhere specific in a real corridor," which is what let it patrol
  // back and forth and made hiding in a room actually matter.

  return { monsterDistance }
}
