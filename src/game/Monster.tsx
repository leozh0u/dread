import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useDirector } from './director'
import { usePlayerPosition } from './playerPosition'
import { distance3 } from './triggers'
import { setMonsterProximity, setMonsterAudioPosition, playMonsterFootstep } from './scareFx'

const SKIN = '#0d0d0d'
const EYE = '#ff2222'

// Confined to the corridor spine — it never enters the alcove rooms, which
// is what makes ducking into one actually safer rather than cosmetic.
const Z_MAX = 16
const Z_MIN = -19
const X_BOUND = 2.5

const PATROL_SPEED = 1.7
const HUNT_SPEED = 3.2
const RETREAT_SPEED = 2.4
const MAX_AUDIBLE_DIST = 20 // real distance beyond which it reads as "far" (1.0)
const STEP_DISTANCE = 1.1 // world units between footstep sounds

/**
 * A real articulated creature that is ALWAYS somewhere and ALWAYS moving —
 * patrolling back and forth along the corridor when it isn't actively
 * hunting, cutting straight toward the player's real position when the
 * Director calls for it (STALK/STRIKE), retreating along the corridor
 * when it calls for withdrawal. It never leaves the corridor bounds, so
 * the alcove rooms (and their hiding spots) are genuinely out of its
 * reach, not just visually implied to be.
 *
 * director.ts's phase still owns *when* it hunts vs. retreats (that's the
 * whole pulse-driven mechanic); this component owns *where it actually
 * is* in the world, and feeds a real-distance-derived proximity value
 * back into monsterDistance so HUD/audio/stealth-detection all react to
 * where the thing genuinely is rather than a scripted slider.
 */
export function Monster() {
  const scareLog = useDirector((s) => s.scareLog)
  const group = useRef<THREE.Group>(null!)
  const leftArm = useRef<THREE.Mesh>(null!)
  const rightArm = useRef<THREE.Mesh>(null!)
  const leftLeg = useRef<THREE.Mesh>(null!)
  const rightLeg = useRef<THREE.Mesh>(null!)
  const head = useRef<THREE.Group>(null!)
  const eyeL = useRef<THREE.Mesh>(null!)
  const eyeR = useRef<THREE.Mesh>(null!)

  const lastScareCount = useRef(0)
  const attackUntil = useRef(0)
  const attackStart = useRef(0)
  const patrolDir = useRef(1)
  const distSinceStep = useRef(0)

  useFrame(({ clock }, delta) => {
    if (!group.current) return
    const t = clock.elapsedTime
    const dt = Math.min(delta, 0.1) // guard against huge deltas on a stall/tab-switch
    const phase = useDirector.getState().phase
    const player = usePlayerPosition.getState()

    let speed = PATROL_SPEED
    let targetX = group.current.position.x
    let targetZ = group.current.position.z

    if (phase === 'STALK' || phase === 'STRIKE') {
      speed = HUNT_SPEED
      targetZ = player.z
      targetX = THREE.MathUtils.clamp(player.x, -X_BOUND, X_BOUND)
    } else if (phase === 'WITHDRAW') {
      speed = RETREAT_SPEED
      const away = group.current.position.z >= player.z ? 1 : -1
      targetZ = THREE.MathUtils.clamp(group.current.position.z + away * 12, Z_MIN, Z_MAX)
      targetX = 0
    } else {
      // CALIBRATING / RECOVER: keep patrolling, back and forth, never idle.
      targetZ = patrolDir.current > 0 ? Z_MAX : Z_MIN
      targetX = Math.sin(t * 0.4) * 1.6
      if (Math.abs(group.current.position.z - targetZ) < 0.6) patrolDir.current *= -1
    }

    const prevX = group.current.position.x
    const prevZ = group.current.position.z

    const diffZ = targetZ - prevZ
    const stepZ = Math.sign(diffZ) * Math.min(Math.abs(diffZ), speed * dt)
    group.current.position.z = THREE.MathUtils.clamp(prevZ + stepZ, Z_MIN, Z_MAX)
    group.current.position.x = THREE.MathUtils.lerp(prevX, targetX, Math.min(1, dt * 2))

    const moved = Math.hypot(
      group.current.position.x - prevX,
      group.current.position.z - prevZ,
    )
    distSinceStep.current += moved
    if (distSinceStep.current > STEP_DISTANCE) {
      distSinceStep.current = 0
      playMonsterFootstep(group.current.position.x, group.current.position.y, group.current.position.z)
    }

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
    const walkSpeed = phase === 'STALK' || phase === 'STRIKE' ? 9 : 6
    const swing = Math.sin(t * walkSpeed) * 0.6

    if (attacking) {
      const p = (t - attackStart.current) / 0.55
      const lunge = Math.sin(Math.min(1, p) * Math.PI)
      group.current.position.z += lunge * 3.5
      group.current.rotation.x = -lunge * 0.25
      if (leftArm.current) leftArm.current.rotation.x = -1.8 * lunge
      if (rightArm.current) rightArm.current.rotation.x = -1.8 * lunge
    } else {
      group.current.rotation.x = THREE.MathUtils.lerp(group.current.rotation.x, 0, 0.1)
      if (leftArm.current) leftArm.current.rotation.x = swing
      if (rightArm.current) rightArm.current.rotation.x = -swing
    }

    if (leftLeg.current) leftLeg.current.rotation.x = -swing
    if (rightLeg.current) rightLeg.current.rotation.x = swing

    if (head.current) {
      head.current.rotation.y = Math.sin(t * 1.7) * 0.15
      head.current.rotation.z = Math.sin(t * 2.3) * 0.05
    }
    group.current.position.y = 0.9 + Math.abs(Math.sin(t * walkSpeed)) * 0.08

    const closeness = 1 - normalized
    const eyeIntensity = 1.5 + closeness * 6 + (attacking ? 4 : 0)
    if (eyeL.current) (eyeL.current.material as THREE.MeshStandardMaterial).emissiveIntensity = eyeIntensity
    if (eyeR.current) (eyeR.current.material as THREE.MeshStandardMaterial).emissiveIntensity = eyeIntensity
  })

  return (
    <group ref={group} position={[0, 0.9, -6]}>
      {/* Torso — tall, hunched, asymmetric-ish via slight taper */}
      <mesh position={[0, 0, 0]} castShadow>
        <capsuleGeometry args={[0.32, 1.0, 4, 8]} />
        <meshStandardMaterial color={SKIN} roughness={0.95} />
      </mesh>

      {/* Head, tilted forward like it's always peering */}
      <group ref={head} position={[0, 0.95, 0.05]} rotation={[0.3, 0, 0]}>
        <mesh castShadow>
          <sphereGeometry args={[0.24, 12, 12]} />
          <meshStandardMaterial color={SKIN} roughness={0.9} />
        </mesh>
        <mesh ref={eyeL} position={[-0.09, 0.02, 0.2]}>
          <sphereGeometry args={[0.035, 8, 8]} />
          <meshStandardMaterial color={EYE} emissive={EYE} emissiveIntensity={2} toneMapped={false} />
        </mesh>
        <mesh ref={eyeR} position={[0.09, 0.02, 0.2]}>
          <sphereGeometry args={[0.035, 8, 8]} />
          <meshStandardMaterial color={EYE} emissive={EYE} emissiveIntensity={2} toneMapped={false} />
        </mesh>
        <pointLight color={EYE} intensity={3} distance={1.5} position={[0, 0, 0.2]} />
      </group>

      {/* Arms — long, thin, wrong proportions on purpose */}
      <group position={[-0.38, 0.55, 0]}>
        <mesh ref={leftArm} position={[0, -0.55, 0]} castShadow>
          <capsuleGeometry args={[0.07, 1.0, 4, 6]} />
          <meshStandardMaterial color={SKIN} roughness={0.95} />
        </mesh>
      </group>
      <group position={[0.38, 0.55, 0]}>
        <mesh ref={rightArm} position={[0, -0.55, 0]} castShadow>
          <capsuleGeometry args={[0.07, 1.0, 4, 6]} />
          <meshStandardMaterial color={SKIN} roughness={0.95} />
        </mesh>
      </group>

      {/* Legs */}
      <group position={[-0.14, -0.55, 0]}>
        <mesh ref={leftLeg} position={[0, -0.4, 0]} castShadow>
          <capsuleGeometry args={[0.1, 0.75, 4, 6]} />
          <meshStandardMaterial color={SKIN} roughness={0.95} />
        </mesh>
      </group>
      <group position={[0.14, -0.55, 0]}>
        <mesh ref={rightLeg} position={[0, -0.4, 0]} castShadow>
          <capsuleGeometry args={[0.1, 0.75, 4, 6]} />
          <meshStandardMaterial color={SKIN} roughness={0.95} />
        </mesh>
      </group>
    </group>
  )
}
