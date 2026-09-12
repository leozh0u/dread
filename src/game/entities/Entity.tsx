import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useDirector } from '../director'
import { usePlayerPosition } from '../playerPosition'
import { distance3 } from '../triggers'
import { pointAtArcLength, projectToArcLength, shortestArcDelta, PATH_TOTAL_LENGTH } from '../maze'
import { setMonsterProximity, setMonsterAudioPosition, playMonsterFootstep, playSpatialSfx } from '../scareFx'
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
    voiceGap: [number, number] // seconds between vocalisations, [min, max]
  }
> = {
  // Tall and slow: glides, barely makes a sound, no bob at all.
  long: {
    patrol: 1.5, hunt: 2.6, retreat: 2.2, stepDist: 2.4, stepPitch: 0.55, bob: 0,
    idle: 'long-presence', close: 'long-near', voiceGap: [14, 26],
  },
  // Low and fast: rapid skittering steps, high and light.
  crawler: {
    patrol: 2.4, hunt: 4.4, retreat: 3.0, stepDist: 0.7, stepPitch: 1.8, bob: 0.06,
    idle: 'crawler-skitter', close: 'crawler-shriek', voiceGap: [7, 15],
  },
  // Heavy and deliberate: slow, enormous, dragging footfalls.
  smile: {
    patrol: 1.2, hunt: 2.9, retreat: 2.0, stepDist: 1.9, stepPitch: 0.4, bob: 0.03,
    idle: 'smile-drag', close: 'smile-laugh', voiceGap: [10, 20],
  },
}

const MAX_AUDIBLE_DIST = 20
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
  // Mutated every frame, read by the creature's own frame loop. Never a
  // prop and never state: props would freeze (refs don't re-render) and
  // state would re-render three creatures at 60fps for nothing.
  const state = useRef<EntityState>({ closeness: 0, hunting: false, attacking: false })

  useFrame(({ clock, camera }, delta) => {
    if (!group.current) return
    const t = clock.elapsedTime
    const dt = Math.min(delta, 0.1)
    const phase = useDirector.getState().phase
    const player = usePlayerPosition.getState()
    const prof = PROFILE[kind]

    const hunting = phase === 'STALK' || phase === 'STRIKE'
    const retreating = phase === 'WITHDRAW'
    const speed = hunting ? prof.hunt : retreating ? prof.retreat : prof.patrol

    // Unpredictable rhythm — hitches and surges rather than a metronome.
    hitchPhase.current += dt * (0.6 + 0.4 * Math.sin(t * 0.37 + index))
    const hitch = 0.55 + 0.45 * Math.sin(hitchPhase.current * 2.3) * Math.sin(hitchPhase.current * 0.6)
    const effSpeed = speed * THREE.MathUtils.clamp(hitch, 0.35, 1.15)

    if (hunting) {
      const targetS = projectToArcLength(player)
      const d = shortestArcDelta(pathS.current, targetS)
      pathS.current += Math.sign(d) * Math.min(Math.abs(d), effSpeed * dt)
    } else if (retreating) {
      const towardPlayer = shortestArcDelta(pathS.current, projectToArcLength(player))
      pathS.current += (towardPlayer >= 0 ? -1 : 1) * effSpeed * dt
    } else {
      pathS.current += effSpeed * dt
    }
    pathS.current = ((pathS.current % PATH_TOTAL_LENGTH) + PATH_TOTAL_LENGTH) % PATH_TOTAL_LENGTH

    const prevX = group.current.position.x
    const prevZ = group.current.position.z
    const pos = pointAtArcLength(pathS.current)
    group.current.position.x = pos.x
    group.current.position.z = pos.z

    // Inspect mode (press M) lines all three up in front of the player so
    // their designs can actually be looked at side by side.
    if (inspect.on) {
      const dir = new THREE.Vector3()
      camera.getWorldDirection(dir)
      dir.y = 0
      dir.normalize()
      const right = new THREE.Vector3(-dir.z, 0, dir.x)
      const offset = (index - 1) * 2.6
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
      )
    }

    // Vocalisations: its own voice, from its own position. Fires more
    // often and switches to the close-range sound as it gets near, so
    // the soundtrack of it approaching changes character rather than
    // just getting louder.
    if (t > nextVoice.current) {
      const near = normalized < 0.45
      playSpatialSfx(
        near ? prof.close : prof.idle,
        group.current.position.x,
        FLOOR_Y + 1.2,
        group.current.position.z,
        { volume: near ? 0.9 : 0.55, rate: 0.9 + Math.random() * 0.2 },
      )
      const [lo, hi] = prof.voiceGap
      // Closer = more frequent, down to a third of the idle interval
      const scale = 0.35 + normalized * 0.65
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
      setMonsterProximity(normalized)
      setMonsterAudioPosition(group.current.position.x, FLOOR_Y + 1, group.current.position.z)
    }

    // Hand the creature its live state for this frame
    state.current.closeness = 1 - normalized
    state.current.hunting = hunting
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
