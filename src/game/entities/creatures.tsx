import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Slab, Limb, Glow, Grin, VOID } from './shapes'

export type EntityKind = 'long' | 'crawler' | 'smile'

export interface CreatureProps {
  /** 0 = on top of the player, 1 = far away. Drives eye intensity etc. */
  closeness: number
  hunting: boolean
  attacking: boolean
}

/**
 * THE LONG ONE — Slender-derived. Nearly ceiling height, impossibly thin,
 * blank pale head with no features at all. It does not walk: it glides,
 * upright and still, which is exactly why it's worse than something that
 * runs. Four tendrils drift out from its shoulders.
 */
export function LongOne({ closeness, hunting }: CreatureProps) {
  const tendrils = useRef<THREE.Group>(null!)
  const head = useRef<THREE.Group>(null!)

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (tendrils.current) {
      tendrils.current.children.forEach((c, i) => {
        c.rotation.z = Math.sin(t * (0.6 + i * 0.17) + i) * 0.35
        c.rotation.x = Math.cos(t * (0.5 + i * 0.13) + i * 2) * 0.28
      })
    }
    // The head never bobs — total stillness above a moving body is the
    // whole trick with this one.
    if (head.current) head.current.rotation.y = Math.sin(t * 0.3) * 0.12
  })

  return (
    <group>
      {/* torso — a narrow slab, absurdly tall */}
      <Slab args={[0.34, 1.9, 0.22]} position={[0, 1.0, 0]} />
      {/* legs: two long thin verticals, no knees */}
      <Limb length={1.3} top={0.06} bottom={0.03} position={[-0.09, -0.62, 0]} />
      <Limb length={1.3} top={0.06} bottom={0.03} position={[0.09, -0.62, 0]} />
      {/* arms hanging far past where hands should stop */}
      <Limb length={1.5} top={0.045} bottom={0.02} position={[-0.2, 1.0, 0]} rotation={[0, 0, 0.06]} />
      <Limb length={1.5} top={0.045} bottom={0.02} position={[0.2, 1.0, 0]} rotation={[0, 0, -0.06]} />

      {/* blank pale head — no eyes, no mouth. Featurelessness is the point */}
      <group ref={head} position={[0, 2.12, 0]}>
        <mesh scale={[0.17, 0.24, 0.17]}>
          <sphereGeometry args={[1, 12, 10]} />
          <meshBasicMaterial color={hunting ? '#f2efe6' : '#cfcabb'} toneMapped={false} />
        </mesh>
      </group>

      {/* tendrils from the shoulders, drifting */}
      <group ref={tendrils} position={[0, 1.75, -0.1]}>
        {[-0.5, -0.25, 0.25, 0.5].map((a, i) => (
          <group key={i} rotation={[0, 0, a]}>
            <Limb length={1.5 + i * 0.12} top={0.03} bottom={0.008} position={[a * 1.4, 0.5, -0.15]} rotation={[0, 0, a * 1.6]} />
          </group>
        ))}
      </group>

      {/* faint halo so its outline separates from a dark corner */}
      <pointLight position={[0, 2.1, 0.2]} color="#9fb4c8" intensity={closeness * 3} distance={3} />
    </group>
  )
}

/**
 * THE CRAWLER — SCP-096-derived. Low to the ground, oversized bald
 * cranium, a grin far too wide for the skull, and fingers longer than its
 * forearms. Limbs fold above the body like a spider's. This is the fast
 * one: when it hunts it scuttles.
 */
export function Crawler({ closeness, hunting, attacking }: CreatureProps) {
  const legs = useRef<THREE.Group>(null!)
  const skull = useRef<THREE.Group>(null!)
  const jaw = useRef<THREE.Group>(null!)

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const rate = hunting ? 11 : 5
    if (legs.current) {
      legs.current.children.forEach((c, i) => {
        // opposing pairs, uneven amplitude — a scuttle, not a march
        const phase = i * 1.9
        c.rotation.x = Math.sin(t * rate + phase) * (0.4 + (i % 2) * 0.25)
        c.rotation.z = Math.cos(t * rate * 0.7 + phase) * 0.18
      })
    }
    if (skull.current) {
      skull.current.rotation.z = Math.sin(t * 2.3) * 0.09
      skull.current.rotation.x = -0.25 + Math.sin(t * 1.6) * 0.07
    }
    // jaw hangs wider the closer it gets, and gapes on the attack
    if (jaw.current) {
      const open = 0.18 + closeness * 0.5 + (attacking ? 0.7 : 0)
      jaw.current.scale.y = THREE.MathUtils.lerp(jaw.current.scale.y, 1 + open, 0.15)
    }
  })

  return (
    <group>
      {/* low, hunched spine */}
      <Slab args={[0.3, 0.26, 0.95]} position={[0, 0.05, 0]} rotation={[0.12, 0, 0]} />

      {/* four spider-folded limbs, knees above the back */}
      <group ref={legs}>
        {[
          [-0.26, 0.34],
          [0.26, 0.34],
          [-0.26, -0.34],
          [0.26, -0.34],
        ].map(([x, z], i) => (
          <group key={i} position={[x, 0.1, z]}>
            {/* upper segment rises */}
            <Limb length={0.72} top={0.05} bottom={0.035} position={[x * 0.6, 0.3, 0]} rotation={[0, 0, x > 0 ? -0.75 : 0.75]} />
            {/* lower segment drops to the floor */}
            <Limb length={0.85} top={0.035} bottom={0.012} position={[x * 1.45, -0.25, 0]} rotation={[0, 0, x > 0 ? 0.28 : -0.28]} />
            {/* absurd fingers */}
            {[-0.05, 0, 0.05].map((fx, j) => (
              <Limb
                key={j}
                length={0.42}
                top={0.012}
                bottom={0.003}
                position={[x * 1.6 + fx, -0.72, 0.12 + j * 0.04]}
                rotation={[0.9, 0, fx * 3]}
              />
            ))}
          </group>
        ))}
      </group>

      {/* oversized bald cranium, thrust forward on a long neck */}
      <group ref={skull} position={[0, 0.3, 0.62]}>
        <mesh scale={[0.27, 0.3, 0.28]}>
          <sphereGeometry args={[1, 14, 12]} />
          <meshBasicMaterial color="#d8d2c4" toneMapped={false} />
        </mesh>
        {/* hollow sockets — dark holes punched into the pale skull */}
        <mesh position={[-0.1, 0.04, 0.22]} scale={[0.075, 0.1, 0.05]}>
          <sphereGeometry args={[1, 8, 8]} />
          <meshBasicMaterial color={VOID} />
        </mesh>
        <mesh position={[0.1, 0.04, 0.22]} scale={[0.075, 0.1, 0.05]}>
          <sphereGeometry args={[1, 8, 8]} />
          <meshBasicMaterial color={VOID} />
        </mesh>
        {/* the grin, wider than the skull should allow */}
        <group ref={jaw} position={[0, -0.13, 0.2]}>
          <mesh position={[0, -0.04, 0]} scale={[0.23, 0.1, 0.06]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial color={VOID} />
          </mesh>
          <Grin position={[0, -0.02, 0.05]} width={0.42} arc={0.2} teeth={11} scale={0.8} color="#e9e2cf" />
        </group>
      </group>

      <pointLight position={[0, 0.4, 0.7]} color="#c9b08a" intensity={closeness * 2.5} distance={2.5} />
    </group>
  )
}

/**
 * THE SMILE — the Roblox/Doors-style corridor filler. Not a body: a mass
 * that occupies the hallway, with nothing visible on it but two eyes and
 * a grin. Six spindly arms brace against the walls. It doesn't step, it
 * slides, and the arms twitch while it does.
 */
export function Smile({ closeness, attacking }: CreatureProps) {
  const arms = useRef<THREE.Group>(null!)
  const face = useRef<THREE.Group>(null!)

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (arms.current) {
      arms.current.children.forEach((c, i) => {
        // irregular twitching rather than a cycle
        const s = Math.sin(t * (2.1 + i * 0.6) + i * 3)
        const s2 = Math.sin(t * (0.7 + i * 0.2))
        c.rotation.z = s * s2 * 0.4
        c.rotation.y = Math.cos(t * (1.3 + i * 0.3) + i) * 0.25
      })
    }
    if (face.current) {
      face.current.position.y = 1.45 + Math.sin(t * 0.9) * 0.05
      face.current.scale.setScalar(attacking ? 1.35 : 1)
    }
  })

  return (
    <group>
      {/* the mass — wide enough to fill a corridor, no discernible form */}
      <Slab args={[1.5, 2.4, 0.7]} position={[0, 1.1, 0]} />
      <Slab args={[1.05, 0.8, 0.6]} position={[0, 2.3, 0]} />
      <Slab args={[0.7, 0.9, 0.5]} position={[-0.55, 0.4, 0.1]} rotation={[0, 0, 0.3]} />
      <Slab args={[0.7, 0.9, 0.5]} position={[0.55, 0.4, 0.1]} rotation={[0, 0, -0.3]} />

      {/* six long arms braced outward against the walls */}
      <group ref={arms} position={[0, 1.7, 0]}>
        {[
          [-1, 0.55, -0.9],
          [1, 0.55, 0.9],
          [-1, 0.05, -1.25],
          [1, 0.05, 1.25],
          [-1, -0.5, -0.75],
          [1, -0.5, 0.75],
        ].map(([side, y, rot], i) => (
          <group key={i} position={[side * 0.6, y, 0]}>
            <Limb length={1.7} top={0.06} bottom={0.015} position={[side * 0.75, 0.1, 0]} rotation={[0, 0, rot]} />
            <Limb length={1.1} top={0.03} bottom={0.008} position={[side * 1.5, -0.5, 0.1]} rotation={[0.3, 0, rot * 0.4]} />
          </group>
        ))}
      </group>

      {/* the only features: two small eyes and a wide grin */}
      <group ref={face} position={[0, 1.45, 0.37]}>
        <Glow position={[-0.17, 0.12, 0]} scale={[0.052, 0.062, 0.03]} />
        <Glow position={[0.15, 0.16, 0]} scale={[0.044, 0.05, 0.03]} />
        <Grin position={[0, -0.06, 0]} width={0.62} arc={0.4} teeth={13} scale={1.15} />
      </group>

      <pointLight position={[0, 1.5, 0.6]} color="#ffffff" intensity={closeness * 2} distance={2.5} />
    </group>
  )
}

export function Creature({ kind, ...props }: CreatureProps & { kind: EntityKind }) {
  if (kind === 'long') return <LongOne {...props} />
  if (kind === 'crawler') return <Crawler {...props} />
  return <Smile {...props} />
}
