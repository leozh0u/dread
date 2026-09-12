import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Slab, Limb, Glow, Grin, VOID } from './shapes'

export type EntityKind = 'long' | 'crawler' | 'smile'

/**
 * Live per-frame state, passed as a mutable object rather than props.
 *
 * This matters: these values change every frame, and passing them as React
 * props would either freeze them (refs don't re-render) or re-render three
 * creatures at 60fps (state does). So Entity.tsx mutates this object in its
 * frame loop and each creature reads it in its own frame loop. No renders,
 * always current.
 */
export interface EntityState {
  closeness: number // 0 far .. 1 on top of you
  hunting: boolean
  attacking: boolean
}

export interface CreatureProps {
  state: React.MutableRefObject<EntityState>
}

/**
 * All three are built with the ORIGIN AT THEIR FEET (local y=0 is the
 * floor they stand on). Entity.tsx then places that origin on the floor
 * plane. Building them around hip-height origins is how you end up with
 * creatures buried to the knee.
 */

/**
 * THE LONG ONE — Slender-derived. Nearly ceiling height, impossibly thin,
 * blank pale head with no features at all. It does not walk: it glides,
 * upright and still, which is exactly why it's worse than something that
 * runs. Four tendrils drift from its shoulders.
 */
export function LongOne({ state }: CreatureProps) {
  const tendrils = useRef<THREE.Group>(null!)
  const head = useRef<THREE.Group>(null!)
  const headMat = useRef<THREE.MeshBasicMaterial>(null!)

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const { closeness, hunting } = state.current

    if (tendrils.current) {
      tendrils.current.children.forEach((c, i) => {
        // Slow, underwater drift — never in sync with each other
        c.rotation.z = Math.sin(t * (0.6 + i * 0.17) + i) * 0.35
        c.rotation.x = Math.cos(t * (0.5 + i * 0.13) + i * 2) * 0.28
      })
    }
    // The head barely moves. Total stillness on top of a body that's
    // covering ground is the entire trick with this one.
    if (head.current) head.current.rotation.y = Math.sin(t * 0.3) * 0.12
    if (headMat.current) {
      const target = hunting ? 1 : 0.72
      headMat.current.color.setScalar(
        THREE.MathUtils.lerp(headMat.current.color.r, target * (0.75 + closeness * 0.25), 0.05),
      )
    }
  })

  return (
    <group>
      {/* legs: two long verticals, no knees. 0 -> 1.35 */}
      <Limb length={1.35} top={0.07} bottom={0.035} position={[-0.09, 0.675, 0]} />
      <Limb length={1.35} top={0.07} bottom={0.035} position={[0.09, 0.675, 0]} />
      {/* torso: 1.35 -> 2.45 */}
      <Slab args={[0.34, 1.1, 0.22]} position={[0, 1.9, 0]} />
      {/* arms hanging far past where hands should stop */}
      <Limb length={1.45} top={0.05} bottom={0.022} position={[-0.21, 1.62, 0]} rotation={[0, 0, 0.05]} />
      <Limb length={1.45} top={0.05} bottom={0.022} position={[0.21, 1.62, 0]} rotation={[0, 0, -0.05]} />

      {/* blank pale head — no eyes, no mouth. Featurelessness is the point */}
      <group ref={head} position={[0, 2.62, 0]}>
        <mesh scale={[0.16, 0.23, 0.16]}>
          <sphereGeometry args={[1, 12, 10]} />
          <meshBasicMaterial ref={headMat} color="#b9b4a8" toneMapped={false} />
        </mesh>
      </group>

      {/* tendrils from the shoulders */}
      <group ref={tendrils} position={[0, 2.35, -0.1]}>
        {[-0.5, -0.25, 0.25, 0.5].map((a, i) => (
          <group key={i}>
            <Limb
              length={1.4 + i * 0.12}
              top={0.028}
              bottom={0.007}
              position={[a * 1.3, 0.35, -0.2]}
              rotation={[0, 0, a * 1.5]}
            />
          </group>
        ))}
      </group>
    </group>
  )
}

/**
 * THE CRAWLER — SCP-096-derived. Low to the ground, oversized bald
 * cranium, a grin far too wide for the skull, fingers longer than its
 * forearms, limbs folded above its back like a spider. The fast one.
 */
export function Crawler({ state }: CreatureProps) {
  const legs = useRef<THREE.Group>(null!)
  const skull = useRef<THREE.Group>(null!)
  const jaw = useRef<THREE.Group>(null!)

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const { closeness, hunting, attacking } = state.current
    const rate = hunting ? 10 : 4.5

    if (legs.current) {
      legs.current.children.forEach((c, i) => {
        // Opposing pairs at uneven amplitude — a scuttle, not a march
        const phase = i * 1.9
        c.rotation.x = Math.sin(t * rate + phase) * (0.32 + (i % 2) * 0.18)
        c.rotation.z = Math.cos(t * rate * 0.7 + phase) * 0.14
      })
    }
    if (skull.current) {
      skull.current.rotation.z = Math.sin(t * 2.3) * 0.09
      skull.current.rotation.x = -0.2 + Math.sin(t * 1.6) * 0.07
    }
    // Jaw hangs wider the closer it gets; gapes fully on the attack
    if (jaw.current) {
      const open = 1 + 0.18 + closeness * 0.5 + (attacking ? 0.7 : 0)
      jaw.current.scale.y = THREE.MathUtils.lerp(jaw.current.scale.y, open, 0.15)
    }
  })

  return (
    <group>
      {/* hunched spine, held low */}
      <Slab args={[0.3, 0.26, 0.95]} position={[0, 0.62, 0]} rotation={[0.12, 0, 0]} />

      {/* four spider-folded limbs — knee above the back, foot on the floor */}
      <group ref={legs}>
        {[
          [-0.26, 0.34],
          [0.26, 0.34],
          [-0.26, -0.34],
          [0.26, -0.34],
        ].map(([x, z], i) => (
          <group key={i} position={[x, 0.62, z]}>
            {/* upper segment rises above the back */}
            <Limb
              length={0.6}
              top={0.05}
              bottom={0.035}
              position={[x * 0.55, 0.22, 0]}
              rotation={[0, 0, x > 0 ? -0.7 : 0.7]}
            />
            {/* lower segment drops to the floor */}
            <Limb
              length={0.78}
              top={0.035}
              bottom={0.012}
              position={[x * 1.25, -0.28, 0]}
              rotation={[0, 0, x > 0 ? 0.22 : -0.22]}
            />
            {/* fingers, splayed flat on the ground */}
            {[-0.05, 0, 0.05].map((fx, j) => (
              <Limb
                key={j}
                length={0.38}
                top={0.012}
                bottom={0.003}
                position={[x * 1.4 + fx, -0.6, 0.14 + j * 0.03]}
                rotation={[1.35, 0, fx * 3]}
              />
            ))}
          </group>
        ))}
      </group>

      {/* oversized bald cranium thrust forward on a long neck */}
      <group ref={skull} position={[0, 0.88, 0.6]}>
        <mesh scale={[0.26, 0.29, 0.27]}>
          <sphereGeometry args={[1, 14, 12]} />
          <meshBasicMaterial color="#cfc9ba" toneMapped={false} />
        </mesh>
        {/* hollow sockets punched into the pale skull */}
        <mesh position={[-0.1, 0.04, 0.21]} scale={[0.075, 0.1, 0.05]}>
          <sphereGeometry args={[1, 8, 8]} />
          <meshBasicMaterial color={VOID} />
        </mesh>
        <mesh position={[0.1, 0.04, 0.21]} scale={[0.075, 0.1, 0.05]}>
          <sphereGeometry args={[1, 8, 8]} />
          <meshBasicMaterial color={VOID} />
        </mesh>
        {/* the grin, wider than the skull should allow */}
        <group ref={jaw} position={[0, -0.13, 0.2]}>
          <mesh position={[0, -0.04, 0]} scale={[0.23, 0.1, 0.06]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial color={VOID} />
          </mesh>
          <Grin position={[0, -0.02, 0.05]} width={0.42} arc={0.2} teeth={11} scale={0.8} color="#e0d9c6" />
        </group>
      </group>
    </group>
  )
}

/**
 * THE SMILE — the Roblox/Doors-style corridor filler. Not a body: a mass
 * that occupies the hallway, with nothing visible on it but two eyes and
 * a grin. Six spindly arms brace against the walls. It doesn't step, it
 * slides, and the arms twitch while it does.
 */
export function Smile({ state }: CreatureProps) {
  const arms = useRef<THREE.Group>(null!)
  const face = useRef<THREE.Group>(null!)

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const { attacking } = state.current

    if (arms.current) {
      arms.current.children.forEach((c, i) => {
        // Irregular twitching rather than a cycle — two detuned sines
        // multiplied, so it stalls and jerks instead of swinging.
        const s = Math.sin(t * (2.1 + i * 0.6) + i * 3)
        const s2 = Math.sin(t * (0.7 + i * 0.2))
        c.rotation.z = s * s2 * 0.35
        c.rotation.y = Math.cos(t * (1.3 + i * 0.3) + i) * 0.22
      })
    }
    if (face.current) {
      face.current.position.y = 1.95 + Math.sin(t * 0.9) * 0.05
      const target = attacking ? 1.35 : 1
      face.current.scale.setScalar(THREE.MathUtils.lerp(face.current.scale.x, target, 0.15))
    }
  })

  return (
    <group>
      {/* the mass — wide enough to fill a corridor, no discernible form */}
      <Slab args={[1.45, 2.2, 0.65]} position={[0, 1.15, 0]} />
      <Slab args={[1.0, 0.7, 0.55]} position={[0, 2.5, 0]} />
      <Slab args={[0.68, 0.85, 0.5]} position={[-0.52, 0.5, 0.1]} rotation={[0, 0, 0.3]} />
      <Slab args={[0.68, 0.85, 0.5]} position={[0.52, 0.5, 0.1]} rotation={[0, 0, -0.3]} />

      {/* six long arms braced outward against the walls */}
      <group ref={arms} position={[0, 2.1, 0]}>
        {[
          [-1, 0.5, -0.9],
          [1, 0.5, 0.9],
          [-1, 0.0, -1.2],
          [1, 0.0, 1.2],
          [-1, -0.55, -0.7],
          [1, -0.55, 0.7],
        ].map(([side, y, rot], i) => (
          <group key={i} position={[side * 0.55, y, 0]}>
            <Limb length={1.6} top={0.055} bottom={0.015} position={[side * 0.7, 0.1, 0]} rotation={[0, 0, rot]} />
            <Limb length={1.0} top={0.028} bottom={0.008} position={[side * 1.4, -0.45, 0.1]} rotation={[0.3, 0, rot * 0.4]} />
          </group>
        ))}
      </group>

      {/* the only features: two eyes and a wide grin */}
      <group ref={face} position={[0, 1.95, 0.34]}>
        <Glow position={[-0.17, 0.12, 0]} scale={[0.05, 0.06, 0.03]} />
        <Glow position={[0.15, 0.16, 0]} scale={[0.042, 0.048, 0.03]} />
        <Grin position={[0, -0.06, 0]} width={0.6} arc={0.38} teeth={13} scale={1.1} />
      </group>
    </group>
  )
}

export function Creature({ kind, state }: CreatureProps & { kind: EntityKind }) {
  if (kind === 'long') return <LongOne state={state} />
  if (kind === 'crawler') return <Crawler state={state} />
  return <Smile state={state} />
}
