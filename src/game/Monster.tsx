import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useDirector } from './director'
import { setMonsterProximity, setMonsterAudioPosition } from './scareFx'

const SKIN = '#0d0d0d'
const EYE = '#ff2222'

/**
 * A real articulated creature — torso/head/arms/legs built from primitives
 * (not a sourced/rigged model, no time for that this weekend), animated
 * procedurally: a constant uneasy lurch-walk, plus a sharp lunge-and-recoil
 * "attack" pose that fires whenever the Director lands a 'proximity' scare
 * (see director.ts's scareLog — we watch for a new entry rather than a
 * separate event system, so this can never desync from what actually
 * scared the player).
 *
 * Position is still driven by monsterDistance the same way the old
 * placeholder was: z = -2 - distance*27, clamped inside the calm room's
 * far wall.
 */
export function Monster() {
  const distance = useDirector((s) => s.monsterDistance)
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

  useFrame(({ clock }) => {
    if (!group.current) return
    const t = clock.elapsedTime

    // Position: lerp toward target z derived from Director distance.
    const targetZ = -2 - distance * 27
    group.current.position.z = THREE.MathUtils.lerp(group.current.position.z, targetZ, 0.02)
    setMonsterProximity(distance)
    setMonsterAudioPosition(group.current.position.x, group.current.position.y, group.current.position.z)

    // New proximity scare landed -> start an attack window.
    if (scareLog.length > lastScareCount.current) {
      const latest = scareLog[scareLog.length - 1]
      lastScareCount.current = scareLog.length
      if (latest.type === 'proximity') {
        attackStart.current = t
        attackUntil.current = t + 0.55
      }
    }

    const attacking = t < attackUntil.current
    const walkSpeed = 6
    const swing = Math.sin(t * walkSpeed) * 0.6

    if (attacking) {
      // Lunge forward and recoil — a fast in-out envelope over the window.
      const p = (t - attackStart.current) / 0.55 // 0..1
      const lunge = Math.sin(Math.min(1, p) * Math.PI) // 0 -> 1 -> 0
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

    // Uneasy, slightly irregular head tremor — never perfectly still.
    if (head.current) {
      head.current.rotation.y = Math.sin(t * 1.7) * 0.15
      head.current.rotation.z = Math.sin(t * 2.3) * 0.05
    }
    // Body bob from the walk cycle.
    group.current.position.y = 0.9 + Math.abs(Math.sin(t * walkSpeed)) * 0.08

    // Eyes pulse brighter the closer it gets.
    const closeness = 1 - Math.max(0, Math.min(1, distance))
    const eyeIntensity = 1.5 + closeness * 6 + (attacking ? 4 : 0)
    if (eyeL.current) (eyeL.current.material as THREE.MeshStandardMaterial).emissiveIntensity = eyeIntensity
    if (eyeR.current) (eyeR.current.material as THREE.MeshStandardMaterial).emissiveIntensity = eyeIntensity
  })

  return (
    <group ref={group} position={[0, 0.9, -25]}>
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
