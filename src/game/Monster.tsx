import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useDirector } from './director'
import { usePlayerPosition } from './playerPosition'
import { distance3 } from './triggers'
import { pointAtArcLength, projectToArcLength, shortestArcDelta, PATH_TOTAL_LENGTH } from './maze'
import { setMonsterProximity, setMonsterAudioPosition, playMonsterFootstep } from './scareFx'

const SKIN = '#0a0908'
const SKIN_DARK = '#050504'
const EYE = '#ff2222'

/** Dev aid: press M to park the creature in front of you, lit, so its
 * design can be judged directly. Module-level so the key listener and
 * the frame loop share one flag without re-rendering anything. */
const inspect = { on: false }
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyM') inspect.on = !inspect.on
  })
}

const PATROL_SPEED = 1.7
const HUNT_SPEED = 3.2
const RETREAT_SPEED = 2.4
const MAX_AUDIBLE_DIST = 20 // real distance beyond which it reads as "far" (1.0)
const STEP_DISTANCE = 1.1 // world units between footstep sounds

/**
 * A real articulated creature that is ALWAYS somewhere and ALWAYS moving —
 * walking the maze's main loop and exit spur (see maze.ts) as arc-length
 * progress along that polyline, so it patrols a real winding, looping
 * route rather than a single straight corridor. It never leaves that
 * path, so the alcove rooms off it (and the loop's shortcut) are
 * genuinely out of its reach, not just visually implied to be.
 *
 * Visual/animation design leans on a few well-established horror-animation
 * principles rather than just "more motion" (see commit message for
 * sources): asymmetric limb timing instead of a mirrored walk cycle, an
 * unpredictable rhythm (brief hitches and speed-ups, not a metronome), a
 * center of mass that leans too far forward, and a gaze that lags behind
 * the body's facing — it's still looking at you a beat after it turns,
 * not perfectly locked on. The body actually rotates to face its direction
 * of travel now (it didn't before, which read as a sliding puppet); only
 * the head/eyes independently track the player.
 */
export function Monster() {
  const scareLog = useDirector((s) => s.scareLog)
  const group = useRef<THREE.Group>(null!)
  const bodyPivot = useRef<THREE.Group>(null!)
  const torso = useRef<THREE.Group>(null!)
  const leftArm = useRef<THREE.Mesh>(null!)
  const rightArm = useRef<THREE.Mesh>(null!)
  const leftLeg = useRef<THREE.Mesh>(null!)
  const rightLeg = useRef<THREE.Mesh>(null!)
  const head = useRef<THREE.Group>(null!)
  const eyeL = useRef<THREE.Mesh>(null!)
  const eyeR = useRef<THREE.Mesh>(null!)
  const inspectLight = useRef<THREE.PointLight>(null!)

  const lastScareCount = useRef(0)
  const attackUntil = useRef(0)
  const attackStart = useRef(0)
  const pathS = useRef(30) // arc-length progress along maze.ts's MONSTER_PATH
  const distSinceStep = useRef(0)
  const facing = useRef(0) // current body yaw, radians
  const gazeYaw = useRef(0) // head yaw, lags `facing` toward the player
  const hitchPhase = useRef(0) // accumulates at a noise-modulated rate -> unpredictable rhythm

  useFrame(({ clock, camera }, delta) => {
    if (!group.current) return
    const t = clock.elapsedTime
    const dt = Math.min(delta, 0.1) // guard against huge deltas on a stall/tab-switch
    const phase = useDirector.getState().phase
    const player = usePlayerPosition.getState()

    let speed = PATROL_SPEED
    let mode: 'hunt' | 'retreat' | 'patrol' = 'patrol'

    if (phase === 'STALK' || phase === 'STRIKE') {
      speed = HUNT_SPEED
      mode = 'hunt'
    } else if (phase === 'WITHDRAW') {
      speed = RETREAT_SPEED
      mode = 'retreat'
    }

    const prevX = group.current.position.x
    const prevZ = group.current.position.z

    // Unpredictable rhythm: a slow noise-ish oscillator that occasionally
    // stalls the effective speed near zero for a beat, then releases —
    // a hitch, not a steady metronome gait. Never fully stops the hunt.
    hitchPhase.current += dt * (0.6 + 0.4 * Math.sin(t * 0.37))
    const hitch = 0.55 + 0.45 * Math.sin(hitchPhase.current * 2.3) * Math.sin(hitchPhase.current * 0.6)
    const effSpeed = speed * THREE.MathUtils.clamp(hitch, 0.35, 1.15)

    // Movement is arc-length progress along the maze's patrol polyline
    // (see maze.ts) — this is what lets it walk a real winding, looping
    // route with the exact same "move a number toward a target number"
    // logic as the old single-corridor version needed.
    if (mode === 'hunt') {
      const targetS = projectToArcLength(player)
      const delta2 = shortestArcDelta(pathS.current, targetS)
      pathS.current += Math.sign(delta2) * Math.min(Math.abs(delta2), effSpeed * dt)
    } else if (mode === 'retreat') {
      const playerS = projectToArcLength(player)
      const towardPlayer = shortestArcDelta(pathS.current, playerS)
      const away = towardPlayer >= 0 ? -1 : 1 // step opposite of whichever direction closes distance
      pathS.current += away * effSpeed * dt
    } else {
      // CALIBRATING / RECOVER: keep walking the loop forward, never idle.
      pathS.current += effSpeed * dt
    }
    pathS.current = ((pathS.current % PATH_TOTAL_LENGTH) + PATH_TOTAL_LENGTH) % PATH_TOTAL_LENGTH

    const pos = pointAtArcLength(pathS.current)
    group.current.position.x = pos.x
    group.current.position.z = pos.z

    // Inspect mode (press M): parks the creature a few metres in front of
    // the player and lights it, so its design can actually be looked at
    // and critiqued instead of hunted for in the dark. Purely a dev aid.
    if (inspect.on) {
      const dir = new THREE.Vector3()
      camera.getWorldDirection(dir)
      dir.y = 0
      dir.normalize()
      group.current.position.x = camera.position.x + dir.x * 3.5
      group.current.position.z = camera.position.z + dir.z * 3.5
    }
    if (inspectLight.current) inspectLight.current.intensity = inspect.on ? 25 : 0

    const dx = group.current.position.x - prevX
    const dz = group.current.position.z - prevZ
    const moved = Math.hypot(dx, dz)
    distSinceStep.current += moved
    if (distSinceStep.current > STEP_DISTANCE) {
      distSinceStep.current = 0
      playMonsterFootstep(group.current.position.x, group.current.position.y, group.current.position.z)
    }

    // Body faces its direction of travel (a beat of inertia, not instant —
    // an instant snap reads as a puppet on a string).
    if (moved > 0.001) {
      const targetFacing = Math.atan2(dx, dz)
      let delta2 = targetFacing - facing.current
      delta2 = Math.atan2(Math.sin(delta2), Math.cos(delta2)) // shortest angular path
      facing.current += delta2 * Math.min(1, dt * 4)
    }
    if (bodyPivot.current) bodyPivot.current.rotation.y = facing.current

    // The head/gaze tracks the player independently of the body, lagging
    // behind — it's still catching up to looking at you, which is more
    // unsettling than either perfect tracking or no tracking at all.
    const toPlayerYaw = Math.atan2(player.x - group.current.position.x, player.z - group.current.position.z)
    let gazeDelta = toPlayerYaw - facing.current - gazeYaw.current
    gazeDelta = Math.atan2(Math.sin(gazeDelta), Math.cos(gazeDelta))
    gazeYaw.current += gazeDelta * Math.min(1, dt * 1.5)
    gazeYaw.current = THREE.MathUtils.clamp(gazeYaw.current, -1.1, 1.1)

    // Real proximity, derived from actual position — drives HUD/stealth
    // detection (useThreatLoop reads monsterDistance) and audio, all from
    // one number instead of a scripted slider.
    const realDist = distance3(player, [
      group.current.position.x,
      group.current.position.y,
      group.current.position.z,
    ])
    const normalized = THREE.MathUtils.clamp(realDist / MAX_AUDIBLE_DIST, 0, 1)
    useDirector.getState().setMonsterDistance(normalized)
    setMonsterProximity(normalized)
    setMonsterAudioPosition(group.current.position.x, group.current.position.y, group.current.position.z)

    // New proximity scare landed -> start an attack window (a real lunge
    // toward the player's exact position, not just a swipe animation).
    if (scareLog.length > lastScareCount.current) {
      const latest = scareLog[scareLog.length - 1]
      lastScareCount.current = scareLog.length
      if (latest.type === 'proximity') {
        attackStart.current = t
        attackUntil.current = t + 0.55
      }
    }

    const attacking = t < attackUntil.current
    const hunting = phase === 'STALK' || phase === 'STRIKE'
    const walkSpeed = (hunting ? 9 : 6) * THREE.MathUtils.clamp(hitch, 0.5, 1.3)
    // Asymmetric gait: legs/arms on a slightly different rate and phase
    // offset per side instead of a mirrored sine — a limp, not a stride.
    const swingL = Math.sin(t * walkSpeed) * 0.65
    const swingR = Math.sin(t * walkSpeed * 1.18 + 0.6) * 0.5

    if (attacking) {
      const p = (t - attackStart.current) / 0.55
      const lunge = Math.sin(Math.min(1, p) * Math.PI)
      group.current.position.z += lunge * 3.5
      if (torso.current) torso.current.rotation.x = -lunge * 0.3
      if (leftArm.current) leftArm.current.rotation.x = -1.9 * lunge
      if (rightArm.current) rightArm.current.rotation.x = -1.7 * lunge
    } else {
      // Wrong center of mass: leans noticeably forward, more so while
      // hunting, like it's always about to fall onto you.
      const lean = hunting ? 0.32 : 0.16
      if (torso.current) torso.current.rotation.x = THREE.MathUtils.lerp(torso.current.rotation.x, lean, 0.08)
      if (leftArm.current) leftArm.current.rotation.x = swingL
      if (rightArm.current) rightArm.current.rotation.x = -swingR
    }

    if (leftLeg.current) leftLeg.current.rotation.x = -swingL
    if (rightLeg.current) rightLeg.current.rotation.x = swingR

    if (head.current) {
      head.current.rotation.y = gazeYaw.current
      head.current.rotation.z = Math.sin(t * 2.1) * 0.06
    }
    group.current.position.y = 0.9 + Math.abs(Math.sin(t * walkSpeed)) * 0.07

    const closeness = 1 - normalized
    const eyeIntensity = 1.8 + closeness * 6.5 + (attacking ? 4 : 0)
    if (eyeL.current) (eyeL.current.material as THREE.MeshStandardMaterial).emissiveIntensity = eyeIntensity
    if (eyeR.current)
      (eyeR.current.material as THREE.MeshStandardMaterial).emissiveIntensity = eyeIntensity * 0.85 // asymmetric eyes — not perfectly even
  })

  return (
    <group ref={group} position={[0, 0.9, -6]}>
      {/* Faint, sickly backlight — without this the creature is pure black
          silhouette against pure black fog and just disappears. Cold and
          dim on purpose, not a pleasant glow — this isn't meant to
          illuminate it, just barely separate its outline from the dark. */}
      <pointLight position={[0, 1.1, -0.5]} color="#242820" intensity={1.6} distance={2} />
      {/* Only on in inspect mode (press M) — see the note at the top */}
      <pointLight ref={inspectLight} position={[0, 1.6, 1.6]} color="#ffffff" intensity={0} distance={7} />

      <group ref={bodyPivot}>
        <group ref={torso}>
          {/* Torso — a low-poly tapered hourglass, NOT a smooth capsule.
              Capsules/spheres are the "soft friendly robot" shape
              language (it's literally why Baymax is built from them) —
              angular and faceted reads as wrong/organic-horror instead. */}
          <mesh position={[0.02, 0, 0]} castShadow rotation={[0, 0, 0.05]} scale={[0.92, 1, 1.1]}>
            <cylinderGeometry args={[0.28, 0.15, 1.05, 6]} />
            <meshStandardMaterial color={SKIN} roughness={0.98} flatShading />
          </mesh>
          {/* Jutting collarbone/ribs — breaks the silhouette further */}
          <mesh position={[-0.22, 0.35, 0.08]} rotation={[0, 0, 0.4]}>
            <coneGeometry args={[0.03, 0.28, 4]} />
            <meshStandardMaterial color={SKIN_DARK} roughness={1} flatShading />
          </mesh>
          <mesh position={[0.2, 0.32, 0.1]} rotation={[0, 0, -0.35]}>
            <coneGeometry args={[0.03, 0.24, 4]} />
            <meshStandardMaterial color={SKIN_DARK} roughness={1} flatShading />
          </mesh>

          {/* Spine ridge — a row of small back spikes, uneven heights */}
          {[0.55, 0.3, 0.05, -0.2].map((y, i) => (
            <mesh
              key={i}
              position={[0, y, -0.26]}
              rotation={[-0.5 - i * 0.05, 0, 0]}
              scale={[1, 0.8 + (i % 2) * 0.3, 1]}
            >
              <coneGeometry args={[0.05, 0.22, 5]} />
              <meshStandardMaterial color={SKIN_DARK} roughness={1} flatShading />
            </mesh>
          ))}

          {/* Head — a low-poly faceted shard, not a rounded sphere.
              Elongated, tilted, off-axis: nothing about it should read
              as a "face" you could call cute. */}
          <group ref={head} position={[0, 0.92, 0.05]} rotation={[0.25, 0.08, 0.06]}>
            <mesh castShadow scale={[0.7, 1.35, 0.8]}>
              <octahedronGeometry args={[0.22, 0]} />
              <meshStandardMaterial color={SKIN} roughness={0.95} flatShading />
            </mesh>
            <mesh position={[0, -0.16, 0.08]} rotation={[0.3, 0, 0]} scale={[0.8, 1, 0.9]}>
              <coneGeometry args={[0.11, 0.22, 5]} />
              <meshStandardMaterial color={SKIN_DARK} roughness={0.97} flatShading />
            </mesh>
            {/* Eyes — thin glowing slits, not round dots */}
            <mesh ref={eyeL} position={[-0.1, 0.05, 0.16]} scale={[1, 0.35, 0.6]}>
              <sphereGeometry args={[0.045, 6, 4]} />
              <meshStandardMaterial color={EYE} emissive={EYE} emissiveIntensity={2} toneMapped={false} />
            </mesh>
            <mesh ref={eyeR} position={[0.09, -0.02, 0.17]} scale={[0.8, 0.3, 0.6]}>
              <sphereGeometry args={[0.035, 6, 4]} />
              <meshStandardMaterial color={EYE} emissive={EYE} emissiveIntensity={2} toneMapped={false} />
            </mesh>
            <pointLight color={EYE} intensity={2.5} distance={1.3} position={[0, 0, 0.15]} />
          </group>

          {/* Arms — thin low-poly tapered rods, not smooth capsules, with
              a visible angular elbow joint and clawed fingers. Left is
              longer than right — asymmetric, wrong proportions. */}
          <group position={[-0.36, 0.5, 0]}>
            <mesh ref={leftArm} position={[0, -0.62, 0]} castShadow scale={[1, 1.15, 1]}>
              <cylinderGeometry args={[0.05, 0.03, 1.15, 5]} />
              <meshStandardMaterial color={SKIN} roughness={0.98} flatShading />
              <mesh position={[0, -0.02, 0]}>
                <boxGeometry args={[0.09, 0.09, 0.09]} />
                <meshStandardMaterial color={SKIN_DARK} roughness={1} flatShading />
              </mesh>
              {[-0.06, 0, 0.06].map((x, i) => (
                <mesh key={i} position={[x, -0.68, 0.03]} rotation={[1.4, 0, 0]}>
                  <coneGeometry args={[0.016, 0.15, 4]} />
                  <meshStandardMaterial color={SKIN_DARK} roughness={1} flatShading />
                </mesh>
              ))}
            </mesh>
          </group>
          <group position={[0.36, 0.5, 0]}>
            <mesh ref={rightArm} position={[0, -0.5, 0]} castShadow>
              <cylinderGeometry args={[0.045, 0.028, 0.95, 5]} />
              <meshStandardMaterial color={SKIN} roughness={0.98} flatShading />
              <mesh position={[0, -0.02, 0]}>
                <boxGeometry args={[0.08, 0.08, 0.08]} />
                <meshStandardMaterial color={SKIN_DARK} roughness={1} flatShading />
              </mesh>
              {[-0.05, 0, 0.05].map((x, i) => (
                <mesh key={i} position={[x, -0.55, 0.03]} rotation={[1.4, 0, 0]}>
                  <coneGeometry args={[0.014, 0.13, 4]} />
                  <meshStandardMaterial color={SKIN_DARK} roughness={1} flatShading />
                </mesh>
              ))}
            </mesh>
          </group>

          {/* Legs — thin, faceted, uneven, digitigrade-ish taper */}
          <group position={[-0.13, -0.5, 0]}>
            <mesh ref={leftLeg} position={[0, -0.42, 0.02]} castShadow>
              <cylinderGeometry args={[0.09, 0.05, 0.85, 5]} />
              <meshStandardMaterial color={SKIN} roughness={0.98} flatShading />
              <mesh position={[0, -0.03, 0]}>
                <boxGeometry args={[0.13, 0.1, 0.13]} />
                <meshStandardMaterial color={SKIN_DARK} roughness={1} flatShading />
              </mesh>
            </mesh>
          </group>
          <group position={[0.13, -0.5, 0]}>
            <mesh ref={rightLeg} position={[0, -0.4, -0.02]} castShadow>
              <cylinderGeometry args={[0.08, 0.045, 0.8, 5]} />
              <meshStandardMaterial color={SKIN} roughness={0.98} flatShading />
              <mesh position={[0, -0.03, 0]}>
                <boxGeometry args={[0.12, 0.09, 0.12]} />
                <meshStandardMaterial color={SKIN_DARK} roughness={1} flatShading />
              </mesh>
            </mesh>
          </group>
        </group>
      </group>
    </group>
  )
}
