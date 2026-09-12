import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useDirector } from '../director'
import { usePlayerPosition } from '../playerPosition'
import { distance3 } from '../triggers'
import { pointAtArcLength, PATH_TOTAL_LENGTH, nearestPatrolS } from '../maze'
import { updateNavField, navStep, navStepToward, navDistance, hasLineOfSight } from '../nav'
import { useMicStore } from '../../lib/useMic'
import { useThreat } from '../threat'
import {
  setMonsterProximity,
  setMonsterAudioPosition,
  setMonsterOccluded,
  playMonsterFootstep,
  playSpatialSfx,
} from '../scareFx'
import type { SfxName } from '../sfxBank'
import { Creature, type EntityKind, type EntityState } from './creatures'
import { reportEntity, claimHunt, entityEpoch, inspect } from './registry'
import { PLAYER_SPEED } from '../Player'

/** Per-kind movement and sound character. The three should never be
 * confused for each other with your eyes shut, which matters given how
 * much of this game is played by ear. */
const PROFILE: Record<
  EntityKind,
  {
    patrol: number
    hunt: number
    retreat: number
    stepDist: number
    stepPitch: number
    bob: number
    /** Its own recorded voice — idle presence, and what it does when
     * it's hunting you. Distinct per creature so you can tell which one
     * is near with your eyes shut. */
    idle: SfxName
    close: SfxName
    step: SfxName
    voiceGap: [number, number] // seconds between vocalisations, [min, max]
  }
> = {
  // Tall and slow: glides, barely makes a sound, no bob at all.
  long: {
    patrol: 1.5, hunt: 2.6, retreat: 2.2, stepDist: 2.4, stepPitch: 0.55, bob: 0,
    idle: 'long-presence', close: 'long-near', step: 'step-long', voiceGap: [40, 75],
  },
  // Low and fast: rapid skittering steps, high and light.
  crawler: {
    patrol: 2.4, hunt: 3.7, retreat: 3.0, stepDist: 0.7, stepPitch: 1.8, bob: 0.06,
    idle: 'crawler-skitter', close: 'crawler-shriek', step: 'step-crawler', voiceGap: [30, 60],
  },
  // Heavy and deliberate: slow, enormous, dragging footfalls.
  smile: {
    patrol: 1.2, hunt: 2.9, retreat: 2.0, stepDist: 1.9, stepPitch: 0.4, bob: 0.03,
    idle: 'smile-drag', close: 'smile-laugh', step: 'step-smile', voiceGap: [35, 65],
  },
}

const MAX_AUDIBLE_DIST = 20

/**
 * The player moves at 4 m/s (Player.tsx). The crawler used to hunt at
 * 4.4, which meant that once it had seen you, running was arithmetically
 * futile — it closed the distance no matter what you did, and you died in
 * 2.6 seconds. A chase you cannot win isn't tense, it's just a cutscene.
 *
 * Hunt speeds now sit below 4, but the hitch multiplier still peaks at
 * 1.15, so a creature can briefly surge past you and then fall back. You
 * escape by keeping moving and using the loops in the maze — and it's
 * close enough that it never feels safe.
 */


/**
 * How the creature decides to come after you.
 *
 * It used to be locked to the patrol polyline even while hunting, moving
 * only to where the player projected onto that line — so standing in any
 * room made you unreachable and nothing could ever catch you. Now it
 * navigates the real maze (nav.ts). Three ways it commits to a hunt:
 *
 *  - SIGHT: it can see you, and you're within its range. Line of sight is
 *    checked against the actual walls, so a corner genuinely breaks it.
 *  - SOUND: you made noise. Loud enough carries much further than sight,
 *    which is what makes the microphone matter and gives "stay quiet" a
 *    reason to exist.
 *  - THE DIRECTOR: a STRIKE phase sends it at you regardless, because the
 *    pulse-driven escalation has to be able to reach you.
 *
 * It keeps hunting for a few seconds after losing you, so breaking line
 * of sight isn't an instant reset — you have to actually get away.
 */
const SIGHT_RANGE = 14
const HEARING_RANGE = 26
const NOISE_TRIGGER = 0.12
const HUNT_MEMORY_S = 6

/* --- Lunge cycle tuning (see the lungeState ref for the design) -------
 * Durations and speed multipliers are deliberately stated together,
 * because the multipliers are only fair in combination with these
 * durations: weighted by time they average
 *   (0.28*0.05 + 0.55*2.4 + 0.9*0.45) / 1.73 ~= 1.0
 * so a full cycle closes the same ground a steady walk would. Change one
 * of these and the creature either becomes unfair or stops being
 * frightening — change them as a set. */
const COIL_S = 0.28
const LUNGE_S = 0.55
const RECOVER_S = 0.9
const COIL_MUL = 0.05
const LUNGE_MUL = 2.4
const RECOVER_MUL = 0.45
/** Randomised gap between lunges, so the rhythm can never be counted. */
const LUNGE_GAP_MIN_S = 2.2
const LUNGE_GAP_MAX_S = 5.5
/** Too close and it has nowhere to lunge from; too far and you have time
 * to simply walk away from it, which makes the whole move read as noise. */
const LUNGE_MIN_DIST = 2.5
const LUNGE_MAX_DIST = 11
/** Creatures don't see through a closed hiding spot. */
const HIDDEN_SIGHT_RANGE = 2.2

/**
 * How close a merely-STALKING creature will come.
 *
 * STALK closes on the player at patrol speed, which is right — but with
 * nothing to stop it, it simply arrives, stands next to you, and kills
 * you, because detection only needs line of sight. That makes STRIKE
 * meaningless (it was already on top of you) and puts the player under
 * unbroken lethal pressure from the first minute.
 *
 * So stalking holds at the edge of earshot: close enough that you hear it
 * moving and know it's coming, far enough that it can't kill you. Closing
 * the rest of the distance is what a STRIKE — or actually seeing you — is
 * for. The dread and the danger become separate things, which is the
 * whole point of a director.
 */
const STALK_HOLD_DIST = 11
/** Top surface of the floor slab. Creatures are modelled feet-at-origin,
 * so this is where that origin sits. */
const FLOOR_Y = -0.9

/**
 * One creature walking the maze. Movement is arc-length progress along
 * maze.ts's patrol polyline (see that file) — patrol walks it forever,
 * hunt closes on wherever the player projects onto it, withdraw backs
 * away. All three entities share this, and differ by PROFILE and by which
 * Creature they render.
 *
 * Each reports its distance to registry.ts every frame; the closest one
 * wins the right to drive the threat system and the monster audio bus, so
 * three creatures don't fight over one growl.
 */
export function Entity({ kind, index, startS }: { kind: EntityKind; index: number; startS: number }) {
  const group = useRef<THREE.Group>(null!)
  const body = useRef<THREE.Group>(null!)
  const scareLog = useDirector((s) => s.scareLog)

  const pathS = useRef(startS)
  /**
   * Where this creature stands on its very first frame.
   *
   * It used to be a hardcoded [0, FLOOR_Y, -6], which put all three in the
   * same spot six metres from the world origin — and the world origin is
   * precisely what the not-yet-written player position was being compared
   * against when the player could die at spawn without moving (see
   * playerPosition.ts). The guards there make that harmless now; starting
   * them where they actually belong makes the first frame simply correct
   * rather than merely survivable.
   */
  const home = useMemo(() => pointAtArcLength(startS), [startS])
  const facing = useRef(0)
  const distSinceStep = useRef(0)
  const hitchPhase = useRef(index * 3)
  const attackUntil = useRef(0)
  const lastScareCount = useRef(0)
  const nextVoice = useRef(4 + index * 5)
  const alertUntil = useRef(0)
  const patrolDir = useRef(1)
  const wanderT = useRef(3 + index * 2)
  const pauseUntil = useRef(0)
  const resyncIn = useRef(0)
  /**
   * THE LUNGE CYCLE.
   *
   * Movement was a smooth sine wobble on top of a constant walk speed —
   * unpredictable in the small, but never startling, because nothing ever
   * happened SUDDENLY. A creature that glides toward you at a gently
   * varying pace is a hazard to be managed; a creature that stops dead,
   * turns its head straight at you, and then covers four metres in half a
   * second is something else entirely.
   *
   * Four states, cycling while it is genuinely hunting you and close
   * enough for it to matter:
   *
   *   prowl   — the normal walk
   *   coil    — stops almost dead and snaps its head to you. This is the
   *             part that does the work. The pause before the movement is
   *             what makes the movement frightening; without it a lunge is
   *             just a speed change you never notice starting.
   *   lunge   — 2.4x, straight at you
   *   recover — heavy and slow, and the reason this stays fair
   *
   * FAIRNESS IS PRESERVED BY CONSTRUCTION. The multipliers are weighted
   * by their own durations to average almost exactly 1.0 over a full
   * cycle, so a creature closes on you at the same average rate as
   * before — it just does it in violent bursts instead of a glide. It can
   * gain about a metre and a half during a lunge and gives it back during
   * the recovery, so the chase is still winnable in the way the speed
   * ceiling was always meant to guarantee. See PLAYER_SPEED.
   */
  const lungeState = useRef<'prowl' | 'coil' | 'lunge' | 'recover'>('prowl')
  const lungeUntil = useRef(0)
  const nextLungeAt = useRef(0)
  const epoch = useRef(entityEpoch())
  // Mutated every frame, read by the creature's own frame loop. Never a
  // prop and never state: props would freeze (refs don't re-render) and
  // state would re-render three creatures at 60fps for nothing.
  const state = useRef<EntityState>({ closeness: 0, hunting: false, attacking: false, speed: 0 })

  useFrame(({ clock, camera }, delta) => {
    if (!group.current) return
    const t = clock.elapsedTime
    const dt = Math.min(delta, 0.1)

    // A new run: go back to where this creature starts, and forget the
    // player entirely.
    if (epoch.current !== entityEpoch()) {
      epoch.current = entityEpoch()
      pathS.current = startS
      const home = pointAtArcLength(startS)
      group.current.position.x = home.x
      group.current.position.z = home.z
      alertUntil.current = 0
      pauseUntil.current = 0
      patrolDir.current = 1
      distSinceStep.current = 0
      lungeState.current = 'prowl'
      lungeUntil.current = 0
      nextLungeAt.current = 0
    }

    const phase = useDirector.getState().phase
    const player = usePlayerPosition.getState()
    const prof = PROFILE[kind]

    // One shared distance field for all three creatures; early-outs unless
    // the player changed cell.
    updateNavField(player.x, player.z)

    const here = group.current.position
    const toPlayer = navDistance(here.x, here.z)
    const hidden = useThreat.getState().isHidden
    const noise = useMicStore.getState().level

    // Sight is blocked by walls, and by being hidden unless it's right on
    // top of you.
    // Computed once and used twice: for whether it can see you, and for
    // whether you can hear it clearly. Both need the same answer.
    const los = hasLineOfSight(here.x, here.z, player.x, player.z)
    const sightRange = hidden ? HIDDEN_SIGHT_RANGE : SIGHT_RANGE
    const canSee = toPlayer != null && toPlayer < sightRange && los

    // Noise carries through walls — that's the point of it.
    const heard = toPlayer != null && toPlayer < HEARING_RANGE && noise > NOISE_TRIGGER

    if (canSee || heard) alertUntil.current = t + HUNT_MEMORY_S

    // STALK is the Director's DEFAULT phase after calibration — it is
    // where the game sits most of the time, waiting for the player to
    // recover enough to be worth striking at. Treating it as a full hunt
    // meant something was sprinting after the player permanently from the
    // first minute, which leaves the escalation nowhere to go and makes
    // "it found me" meaningless because it had never lost you.
    //
    // So STALK closes on you at PATROL speed: slow, inexorable, and
    // escapable. Full pursuit is reserved for the two things that should
    // earn it — the Director committing to a STRIKE, or the creature
    // genuinely seeing or hearing you.
    const alerted = t < alertUntil.current
    const wantsPlayer = alerted || phase === 'STRIKE' || phase === 'STALK'
    // Only the closest interested creature actually comes for you — see
    // claimHunt. The rest keep patrolling, which is both fairer and
    // considerably more frightening.
    const pursuing = claimHunt(index, wantsPlayer)
    const fullHunt = pursuing && (alerted || phase === 'STRIKE')
    const hunting = pursuing
    const retreating = phase === 'WITHDRAW' && !alerted
    const speed = fullHunt ? prof.hunt : retreating ? prof.retreat : prof.patrol

    // Unpredictable rhythm — hitches and surges rather than a metronome.
    hitchPhase.current += dt * (0.6 + 0.4 * Math.sin(t * 0.37 + index))
    const hitch = 0.55 + 0.45 * Math.sin(hitchPhase.current * 2.3) * Math.sin(hitchPhase.current * 0.6)

    // --- LUNGE CYCLE (see lungeState) ---------------------------------
    // Only while it is actually hunting you, actually in range, and can
    // actually see you. A lunge out of sight down a corridor is just a
    // creature that inexplicably sped up; the whole beat depends on you
    // watching it happen.
    const lungeEligible =
      fullHunt && los && toPlayer != null && toPlayer > LUNGE_MIN_DIST && toPlayer < LUNGE_MAX_DIST

    if (t >= lungeUntil.current) {
      if (lungeState.current === 'coil') {
        lungeState.current = 'lunge'
        lungeUntil.current = t + LUNGE_S
        // Its voice, at the moment it commits. The sound is the tell that
        // makes a lunge survivable if you're listening — which is the
        // deal this whole game makes with the player.
        playSpatialSfx(prof.close, group.current.position.x, FLOOR_Y + 1.2, group.current.position.z, {
          volume: 1,
          rate: 1.05 + Math.random() * 0.15,
          occluded: false,
        })
      } else if (lungeState.current === 'lunge') {
        lungeState.current = 'recover'
        lungeUntil.current = t + RECOVER_S
      } else if (lungeState.current === 'recover') {
        lungeState.current = 'prowl'
        // Randomised so you can never count the beats between them.
        nextLungeAt.current = t + LUNGE_GAP_MIN_S + Math.random() * (LUNGE_GAP_MAX_S - LUNGE_GAP_MIN_S)
      } else if (lungeEligible && t >= nextLungeAt.current) {
        lungeState.current = 'coil'
        lungeUntil.current = t + COIL_S
      }
    }
    // A creature that loses sight of you mid-wind-up doesn't finish the
    // move; it just stops, which reads as it losing you.
    if (lungeState.current === 'coil' && !lungeEligible) {
      lungeState.current = 'prowl'
      nextLungeAt.current = t + 1.5
    }

    const lungeMul =
      lungeState.current === 'coil'
        ? COIL_MUL
        : lungeState.current === 'lunge'
          ? LUNGE_MUL
          : lungeState.current === 'recover'
            ? RECOVER_MUL
            : 1
    const lunging = lungeState.current === 'lunge'

    // Hard ceiling just above the player's own speed: a creature may
    // briefly surge past you, but can never simply outrun you in a
    // straight line, which would make the chase a formality. The lunge
    // gets a higher ceiling for the half-second it lasts — that IS the
    // scare — and pays it straight back in the recovery.
    const effSpeed = Math.min(
      speed * THREE.MathUtils.clamp(hitch, 0.35, 1.15) * lungeMul,
      PLAYER_SPEED * (lunging ? 1.7 : 1.08),
    )

    const prevX = group.current.position.x
    const prevZ = group.current.position.z

    // A stalking creature stops at the edge of earshot; a hunting one
    // doesn't stop at all.
    const holding = pursuing && !fullHunt && toPlayer != null && toPlayer < STALK_HOLD_DIST

    if ((hunting && !holding) || retreating) {
      // Free navigation of the real maze. Retreating walks the same field
      // uphill, which backs away along a route that exists rather than
      // reversing into a wall.
      const step = navStep(here.x, here.z)
      if (step) {
        const sign = retreating ? -1 : 1
        here.x += step.x * sign * effSpeed * dt
        here.z += step.z * sign * effSpeed * dt
      }
      // Resync patrol progress occasionally rather than every frame:
      // nearestPatrolS samples the polyline 120 times, and doing that for
      // three creatures at 60fps was 21,600 polyline evaluations a second
      // for a number that only matters when a hunt ends.
      // Holding at the edge of earshot: drift slowly rather than freezing
      // in place, so it still reads as something alive that is waiting.
      if (holding) {
        here.x += Math.sin(t * 0.6 + index) * 0.35 * dt
        here.z += Math.cos(t * 0.47 + index * 2) * 0.35 * dt
      }

      resyncIn.current -= dt
      if (resyncIn.current <= 0) {
        resyncIn.current = 0.5
        pathS.current = nearestPatrolS(here.x, here.z, pathS.current)
      }
    } else {
      // Patrolling: walk the loop, but not like a tram. It pauses, and it
      // reverses direction at random intervals, so you can't learn the
      // timetable and simply walk behind it forever.
      wanderT.current -= dt
      if (wanderT.current <= 0) {
        wanderT.current = 4 + Math.random() * 9
        if (Math.random() < 0.35) patrolDir.current *= -1
        pauseUntil.current = Math.random() < 0.4 ? t + 0.8 + Math.random() * 2.2 : 0
      }
      if (t > pauseUntil.current) {
        pathS.current += effSpeed * dt * patrolDir.current
      }
      pathS.current = ((pathS.current % PATH_TOTAL_LENGTH) + PATH_TOTAL_LENGTH) % PATH_TOTAL_LENGTH
      const pos = pointAtArcLength(pathS.current)

      // Getting back to the patrol line after a hunt has to be NAVIGATED,
      // not eased. The first version lerped straight toward the patrol
      // point, which dragged the creature through the walls of whatever
      // room it had chased the player into — visible, and exactly the
      // kind of clipping that makes a game look unfinished.
      const offPath = Math.hypot(pos.x - here.x, pos.z - here.z)
      if (offPath > 1.2) {
        const back = navStepToward(here.x, here.z, pos.x, pos.z)
        if (back) {
          here.x += back.x * effSpeed * dt
          here.z += back.z * effSpeed * dt
        }
      } else {
        // Close enough that the straight line is inside the corridor.
        here.x += (pos.x - here.x) * Math.min(1, dt * 3)
        here.z += (pos.z - here.z) * Math.min(1, dt * 3)
      }
    }

    // Inspect mode (press M) lines all three up in front of the player so
    // their designs can actually be looked at side by side.
    if (inspect.on) {
      const dir = new THREE.Vector3()
      camera.getWorldDirection(dir)
      dir.y = 0
      dir.normalize()
      const right = new THREE.Vector3(-dir.z, 0, dir.x)
      // 4.6 apart: the Smile's arm span is ~4.2 wide, so anything tighter
      // has them overlapping each other in the line-up.
      const offset = (index - 1) * 4.6
      group.current.position.x = camera.position.x + dir.x * 5 + right.x * offset
      group.current.position.z = camera.position.z + dir.z * 5 + right.z * offset
    }

    const dx = group.current.position.x - prevX
    const dz = group.current.position.z - prevZ
    const moved = Math.hypot(dx, dz)

    // Face direction of travel, with a beat of inertia.
    if (moved > 0.001) {
      const target = Math.atan2(dx, dz)
      let d = target - facing.current
      d = Math.atan2(Math.sin(d), Math.cos(d))
      facing.current += d * Math.min(1, dt * 4)
    }
    // THE HEAD SNAP. Facing normally eases toward the direction of
    // travel with a beat of inertia, which is right for walking and wrong
    // for this: the instant a creature stops to coil, it should whip round
    // and look straight at you. Easing turns that into a slow swivel and
    // loses the entire beat, so while coiled or lunging the facing is set
    // outright rather than approached.
    if (lungeState.current === 'coil' || lunging) {
      facing.current = Math.atan2(player.x - group.current.position.x, player.z - group.current.position.z)
    }
    // In inspect mode they turn to face you, so you see the silhouette
    // front-on rather than whichever way they happened to be walking.
    if (inspect.on) {
      const toCam = Math.atan2(
        camera.position.x - group.current.position.x,
        camera.position.z - group.current.position.z,
      )
      facing.current = toCam
    }
    group.current.rotation.y = facing.current
    group.current.position.y =
      FLOOR_Y + (prof.bob > 0 ? Math.abs(Math.sin(t * 7)) * prof.bob : 0)

    const realDist = distance3(player, [
      group.current.position.x,
      FLOOR_Y + 1,
      group.current.position.z,
    ])
    const normalized = THREE.MathUtils.clamp(realDist / MAX_AUDIBLE_DIST, 0, 1)

    // Footsteps, spaced by distance travelled so speed changes the tempo
    distSinceStep.current += moved
    if (distSinceStep.current > prof.stepDist) {
      distSinceStep.current = 0
      playMonsterFootstep(
        group.current.position.x,
        FLOOR_Y + 0.1,
        group.current.position.z,
        prof.stepPitch,
        prof.step,
        !los,
      )
    }

    // Vocalisations: its own voice, from its own position. Fires more
    // often and switches to the close-range sound as it gets near, so
    // the soundtrack of it approaching changes character rather than
    // just getting louder.
    if (t > nextVoice.current) {
      // The shriek/laugh is reserved for genuinely close encounters, and
      // even then only sometimes. A scream you hear every few seconds
      // stops being a scream and becomes wallpaper — the whole reason it
      // works is that it's rare and you can't predict it.
      const veryClose = normalized < 0.3
      const useClose = veryClose && Math.random() < 0.45
      playSpatialSfx(
        useClose ? prof.close : prof.idle,
        group.current.position.x,
        FLOOR_Y + 1.2,
        group.current.position.z,
        { volume: useClose ? 0.95 : 0.5, rate: 0.9 + Math.random() * 0.2, occluded: !los },
      )
      const [lo, hi] = prof.voiceGap
      // Closer means somewhat more frequent, but never frantic — floors
      // at 60% of the idle interval rather than a third of it.
      const scale = 0.6 + normalized * 0.4
      nextVoice.current = t + (lo + Math.random() * (hi - lo)) * scale
    }

    // Attack flinch on a proximity scare
    if (scareLog.length > lastScareCount.current) {
      const latest = scareLog[scareLog.length - 1]
      lastScareCount.current = scareLog.length
      if (latest.type === 'proximity') attackUntil.current = t + 0.6
    }
    const attacking = t < attackUntil.current
    if (body.current) {
      const lunge = attacking ? Math.sin(((t - (attackUntil.current - 0.6)) / 0.6) * Math.PI) : 0
      body.current.position.z = lunge * 1.2
      body.current.rotation.x = -lunge * 0.2
    }

    // Closest entity wins the audio bus and the threat system
    const closest = reportEntity(index, normalized, group.current.position)
    // Same guard as useThreatLoop, one level earlier: don't publish a
    // threat distance computed against a player position that has not been
    // written yet. Without this the Director latches monsterDistance=0.30
    // and monsterVisible=true on frame one and keeps them.
    if (closest === index && usePlayerPosition.getState().live) {
      useDirector.getState().setMonsterDistance(normalized)
      setMonsterOccluded(!los)
      useDirector.getState().setMonsterVisible(los)
      setMonsterProximity(normalized)
      setMonsterAudioPosition(group.current.position.x, FLOOR_Y + 1, group.current.position.z)
    }

    // Hand the creature its live state for this frame
    state.current.closeness = 1 - normalized
    state.current.hunting = fullHunt
    state.current.speed = moved / Math.max(dt, 0.0001)
    state.current.attacking = attacking
  })

  return (
    <group ref={group} position={[home.x, FLOOR_Y, home.z]}>
      <group ref={body}>
        <Creature kind={kind} state={state} />
      </group>
    </group>
  )
}
