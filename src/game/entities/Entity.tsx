import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useDirector } from '../director'
import { usePlayerPosition } from '../playerPosition'
import { distance3 } from '../triggers'
import { pointAtArcLength, PATH_TOTAL_LENGTH, nearestPatrolS } from '../maze'
import { updateNavField, navStep, navDistance, hasLineOfSight } from '../nav'
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
import { reportEntity, inspect } from './registry'

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
    patrol: 2.4, hunt: 4.4, retreat: 3.0, stepDist: 0.7, stepPitch: 1.8, bob: 0.06,
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
/** Creatures don't see through a closed hiding spot. */
const HIDDEN_SIGHT_RANGE = 2.2
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
  // Mutated every frame, read by the creature's own frame loop. Never a
  // prop and never state: props would freeze (refs don't re-render) and
  // state would re-render three creatures at 60fps for nothing.
  const state = useRef<EntityState>({ closeness: 0, hunting: false, attacking: false, speed: 0 })

  useFrame(({ clock, camera }, delta) => {
    if (!group.current) return
    const t = clock.elapsedTime
    const dt = Math.min(delta, 0.1)
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

    const directorHunt = phase === 'STALK' || phase === 'STRIKE'
    const alerted = t < alertUntil.current
    const hunting = alerted || directorHunt
    const retreating = phase === 'WITHDRAW' && !alerted
    const speed = hunting ? prof.hunt : retreating ? prof.retreat : prof.patrol

    // Unpredictable rhythm — hitches and surges rather than a metronome.
    hitchPhase.current += dt * (0.6 + 0.4 * Math.sin(t * 0.37 + index))
    const hitch = 0.55 + 0.45 * Math.sin(hitchPhase.current * 2.3) * Math.sin(hitchPhase.current * 0.6)
    const effSpeed = speed * THREE.MathUtils.clamp(hitch, 0.35, 1.15)

    const prevX = group.current.position.x
    const prevZ = group.current.position.z

    if (hunting || retreating) {
      // Free navigation of the real maze. Retreating walks the same field
      // uphill, which backs away along a route that exists rather than
      // reversing into a wall.
      const step = navStep(here.x, here.z)
      if (step) {
        const sign = retreating ? -1 : 1
        here.x += step.x * sign * effSpeed * dt
        here.z += step.z * sign * effSpeed * dt
      }
      // Keep patrol progress roughly in sync with where it actually is,
      // so returning to patrol doesn't teleport it across the level.
      pathS.current = nearestPatrolS(here.x, here.z, pathS.current)
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
      // Ease back onto the patrol line rather than snapping to it.
      here.x += (pos.x - here.x) * Math.min(1, dt * 3)
      here.z += (pos.z - here.z) * Math.min(1, dt * 3)
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
    if (closest === index) {
      useDirector.getState().setMonsterDistance(normalized)
      setMonsterOccluded(!los)
      setMonsterProximity(normalized)
      setMonsterAudioPosition(group.current.position.x, FLOOR_Y + 1, group.current.position.z)
    }

    // Hand the creature its live state for this frame
    state.current.closeness = 1 - normalized
    state.current.hunting = hunting
    state.current.speed = moved / Math.max(dt, 0.0001)
    state.current.attacking = attacking
  })

  return (
    <group ref={group} position={[0, FLOOR_Y, -6]}>
      <group ref={body}>
        <Creature kind={kind} state={state} />
      </group>
    </group>
  )
}
