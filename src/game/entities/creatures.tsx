import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Bone, Plate, Joint, Chain, Glow, Grin, materials } from './shapes'

export type EntityKind = 'long' | 'crawler' | 'smile'

/**
 * Live per-frame state, passed as a mutable object rather than props.
 * These change every frame: as props they'd freeze (refs don't
 * re-render), as state they'd re-render three creatures at 60fps.
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
 * All three are built ORIGIN AT FEET (local y=0 is the floor), and every
 * limb is a Chain/Bone spanning explicit endpoints so nothing can float
 * free of the body. See shapes.tsx for why that matters — the previous
 * versions placed limbs by guessed offsets and visibly came apart.
 */

type Vec3 = [number, number, number]

/* ------------------------------------------------------------------ */
/* THE LONG ONE                                                        */
/* Slender-derived. Ceiling height, impossibly narrow, blank pale head. */
/* It glides — the head stays dead still above a body that's covering   */
/* ground, which is far worse than something that runs.                */
/* ------------------------------------------------------------------ */
export function LongOne({ state }: CreatureProps) {
  const tendrils = useRef<THREE.Group>(null!)
  const head = useRef<THREE.Group>(null!)
  const headMat = useRef<THREE.MeshStandardMaterial>(null!)
  const arms = useRef<THREE.Group>(null!)

  // Four tendrils, each a chain that curls — precomputed control points
  const tendrilPaths = useMemo<Vec3[][]>(() => {
    return [-0.62, -0.22, 0.22, 0.62].map((a, i) => {
      const dir = a < 0 ? -1 : 1
      const reach = 1.05 + (i % 2) * 0.35
      return [
        [a * 0.22, 0, 0],
        [a * 0.55, 0.28 + i * 0.05, -0.25],
        [a * 0.95, 0.42, -0.6 - i * 0.1],
        [dir * reach, 0.2 - i * 0.08, -0.95 - i * 0.12],
        [dir * (reach + 0.35), -0.35 - i * 0.1, -1.0 - i * 0.15],
      ] as Vec3[]
    })
  }, [])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const { closeness, hunting } = state.current

    if (tendrils.current) {
      tendrils.current.children.forEach((c, i) => {
        // Slow underwater drift, each on its own period so they never sync
        c.rotation.z = Math.sin(t * (0.42 + i * 0.13) + i) * 0.3
        c.rotation.x = Math.cos(t * (0.36 + i * 0.09) + i * 2) * 0.22
        c.rotation.y = Math.sin(t * (0.28 + i * 0.07)) * 0.18
      })
    }
    if (arms.current) {
      // Arms sway a fraction behind the body — dead weight, not walking
      arms.current.rotation.x = Math.sin(t * 0.8) * 0.07
      arms.current.rotation.z = Math.sin(t * 0.55) * 0.04
    }
    if (head.current) head.current.rotation.y = Math.sin(t * 0.3) * 0.1
    if (headMat.current) {
      const lit = (hunting ? 1 : 0.75) * (0.75 + closeness * 0.25)
      headMat.current.emissiveIntensity = 0.25 + lit * 0.55
    }
  })

  return (
    <group>
      {/* Legs — long, jointless, slightly knock-kneed */}
      <Chain points={[[-0.1, 0, 0], [-0.13, 0.62, 0.02], [-0.08, 1.24, 0]]} top={0.075} bottom={0.05} />
      <Chain points={[[0.1, 0, 0], [0.13, 0.62, 0.02], [0.08, 1.24, 0]]} top={0.075} bottom={0.05} />

      {/* Coat flare — a suggestion of a suit jacket, ragged at the hem */}
      {[-0.2, -0.07, 0.07, 0.2].map((x, i) => (
        <Plate
          key={i}
          from={[x, 1.3, 0]}
          to={[x * 1.6, 0.72 - (i % 2) * 0.14, 0.02]}
          width={0.13}
          depth={0.05}
          material="fleshDark"
        />
      ))}

      {/* Spine — stacked vertebrae give the torso texture instead of
          being one smooth slab */}
      {Array.from({ length: 7 }).map((_, i) => {
        const y = 1.3 + i * 0.17
        const w = 0.3 - i * 0.012
        return (
          <mesh key={i} position={[0, y, 0]} rotation={[0, i * 0.06, 0]} material={materials.flesh}>
            <boxGeometry args={[w, 0.15, 0.19 - i * 0.008]} />
          </mesh>
        )
      })}

      {/* Shoulder yoke — wide, thin, unnaturally square */}
      <Plate from={[-0.33, 2.4, 0]} to={[0.33, 2.4, 0]} width={0.16} depth={0.17} />
      <Joint at={[-0.33, 2.4, 0]} r={0.075} />
      <Joint at={[0.33, 2.4, 0]} r={0.075} />

      {/* Arms — three segments, hanging far past any plausible hand */}
      <group ref={arms}>
        <Chain
          points={[[-0.33, 2.4, 0], [-0.38, 1.75, 0.04], [-0.34, 1.05, 0.02], [-0.36, 0.62, 0.05]]}
          top={0.06}
          bottom={0.028}
        />
        <Chain
          points={[[0.33, 2.4, 0], [0.37, 1.72, 0.04], [0.33, 1.0, 0.02], [0.35, 0.55, 0.05]]}
          top={0.06}
          bottom={0.028}
        />
        {/* Fingers — four per hand, far too long */}
        {[-1, 1].map((side) =>
          [-0.05, -0.017, 0.017, 0.05].map((off, j) => (
            <Bone
              key={`${side}-${j}`}
              from={[side * 0.355 + off, side < 0 ? 0.62 : 0.55, 0.05]}
              to={[side * 0.355 + off * 2.4, (side < 0 ? 0.62 : 0.55) - 0.34 - j * 0.02, 0.09]}
              top={0.014}
              bottom={0.004}
            />
          )),
        )}
      </group>

      {/* Neck — actually connects the head to the shoulders */}
      <Bone from={[0, 2.4, 0]} to={[0, 2.66, 0.01]} top={0.07} bottom={0.085} />

      {/* Head — elongated, faceted, no features at all. The blankness is
          the point; anything resembling a face is less frightening. */}
      <group ref={head} position={[0, 2.82, 0]}>
        <mesh scale={[0.145, 0.21, 0.155]}>
          <icosahedronGeometry args={[1, 1]} />
          <meshStandardMaterial
            ref={headMat}
            color="#a8a294"
            emissive="#cdc7b6"
            emissiveIntensity={0.4}
            roughness={0.65}
          />
        </mesh>
        {/* Two shallow hollows where eyes should be — not glowing, just
            absent. Sockets read worse than eyes. */}
        <mesh position={[-0.062, 0.02, 0.125]} scale={[0.04, 0.055, 0.03]} material={materials.fleshDark}>
          <sphereGeometry args={[1, 8, 8]} />
        </mesh>
        <mesh position={[0.062, 0.02, 0.125]} scale={[0.04, 0.055, 0.03]} material={materials.fleshDark}>
          <sphereGeometry args={[1, 8, 8]} />
        </mesh>
      </group>

      {/* Tendrils from behind the shoulders */}
      <group ref={tendrils} position={[0, 2.3, -0.08]}>
        {tendrilPaths.map((pts, i) => (
          <group key={i}>
            <Chain points={pts} top={0.042} bottom={0.008} material="fleshDark" />
          </group>
        ))}
      </group>
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* THE CRAWLER                                                         */
/* SCP-096-derived. Oversized bald cranium, grin wider than the skull,  */
/* fingers longer than its forearms, limbs folded above its own back.   */
/* ------------------------------------------------------------------ */
export function Crawler({ state }: CreatureProps) {
  const legs = useRef<THREE.Group>(null!)
  const skull = useRef<THREE.Group>(null!)
  const jaw = useRef<THREE.Group>(null!)

  const legRoots = useMemo(
    () =>
      [
        [-0.22, 0.42],
        [0.22, 0.42],
        [-0.24, -0.3],
        [0.24, -0.3],
      ] as [number, number][],
    [],
  )

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const { closeness, hunting, attacking } = state.current
    const rate = hunting ? 9.5 : 4.2

    if (legs.current) {
      legs.current.children.forEach((c, i) => {
        const phase = i * 1.9
        c.rotation.x = Math.sin(t * rate + phase) * (0.3 + (i % 2) * 0.16)
        c.rotation.z = Math.cos(t * rate * 0.7 + phase) * 0.13
      })
    }
    if (skull.current) {
      skull.current.rotation.z = Math.sin(t * 2.1) * 0.1
      skull.current.rotation.x = -0.18 + Math.sin(t * 1.5) * 0.08
    }
    if (jaw.current) {
      const open = 1 + 0.15 + closeness * 0.45 + (attacking ? 0.8 : 0)
      jaw.current.scale.y = THREE.MathUtils.lerp(jaw.current.scale.y, open, 0.15)
    }
  })

  return (
    <group>
      {/* Spine: pelvis -> ribcage -> neck, as real segments */}
      <Chain
        points={[[0, 0.5, -0.45], [0, 0.56, -0.12], [0, 0.6, 0.25], [0, 0.68, 0.52]]}
        top={0.075}
        bottom={0.05}
      />
      {/* Pelvis and shoulder blades */}
      <mesh position={[0, 0.5, -0.45]} material={materials.flesh}>
        <boxGeometry args={[0.3, 0.16, 0.2]} />
      </mesh>
      <mesh position={[0, 0.61, 0.3]} rotation={[0.1, 0, 0]} material={materials.flesh}>
        <boxGeometry args={[0.34, 0.14, 0.26]} />
      </mesh>

      {/* Ribs — five arcs a side, the main source of surface detail */}
      {[0, 1, 2, 3, 4].map((i) => {
        const z = 0.34 - i * 0.15
        const drop = 0.1 + i * 0.012
        const w = 0.24 - Math.abs(i - 2) * 0.03
        return [-1, 1].map((side) => (
          <Chain
            key={`${i}-${side}`}
            points={[
              [0, 0.58, z],
              [side * w, 0.5 - drop * 0.4, z + 0.02],
              [side * w * 0.82, 0.4 - drop, z],
            ]}
            top={0.028}
            bottom={0.016}
            material="fleshDark"
            joints={false}
          />
        ))
      })}

      {/* Four spider-folded limbs — knee above the back, foot on the
          floor, fingers splayed flat. Chained so they're one limb. */}
      <group ref={legs}>
        {legRoots.map(([x, z], i) => {
          const side = x > 0 ? 1 : -1
          const root: Vec3 = [x, 0.55, z]
          const knee: Vec3 = [x * 1.9, 1.12, z + side * 0.02]
          const ankle: Vec3 = [x * 2.5, 0.28, z + 0.12]
          const foot: Vec3 = [x * 2.35, 0, z + 0.24]
          return (
            <group key={i} position={root}>
              <Chain
                points={[
                  [0, 0, 0],
                  [knee[0] - root[0], knee[1] - root[1], knee[2] - root[2]],
                  [ankle[0] - root[0], ankle[1] - root[1], ankle[2] - root[2]],
                  [foot[0] - root[0], foot[1] - root[1], foot[2] - root[2]],
                ]}
                top={0.062}
                bottom={0.022}
              />
              {/* Fingers — longer than the forearm, flat on the ground */}
              {[-0.07, -0.024, 0.024, 0.07].map((off, j) => (
                <Bone
                  key={j}
                  from={[foot[0] - root[0], foot[1] - root[1], foot[2] - root[2]]}
                  to={[
                    foot[0] - root[0] + off * 2.2,
                    -root[1] + 0.012,
                    foot[2] - root[2] + 0.42 - Math.abs(off) * 1.2,
                  ]}
                  top={0.017}
                  bottom={0.004}
                  material="fleshDark"
                />
              ))}
            </group>
          )
        })}
      </group>

      {/* Neck into an oversized cranium */}
      <Bone from={[0, 0.68, 0.52]} to={[0, 0.86, 0.66]} top={0.05} bottom={0.07} />
      <group ref={skull} position={[0, 0.95, 0.72]}>
        <mesh scale={[0.23, 0.25, 0.24]}>
          <icosahedronGeometry args={[1, 1]} />
          <meshStandardMaterial color="#c6c0b0" roughness={0.7} emissive="#5a564c" emissiveIntensity={0.25} />
        </mesh>
        {/* Deep sockets — dark holes, not eyes */}
        <mesh position={[-0.095, 0.035, 0.185]} scale={[0.062, 0.075, 0.06]} material={materials.fleshDark}>
          <sphereGeometry args={[1, 10, 10]} />
        </mesh>
        <mesh position={[0.095, 0.035, 0.185]} scale={[0.062, 0.075, 0.06]} material={materials.fleshDark}>
          <sphereGeometry args={[1, 10, 10]} />
        </mesh>
        {/* Brow ridge over them */}
        <mesh position={[0, 0.11, 0.17]} rotation={[0.3, 0, 0]} material={materials.boneDim}>
          <boxGeometry args={[0.27, 0.05, 0.09]} />
        </mesh>
        {/* Jaw, hinged, wider than the skull should allow */}
        <group ref={jaw} position={[0, -0.12, 0.16]}>
          <mesh position={[0, -0.05, 0.02]} material={materials.fleshDark}>
            <boxGeometry args={[0.22, 0.11, 0.14]} />
          </mesh>
          <Grin position={[0, -0.02, 0.09]} width={0.34} arc={0.16} teeth={12} scale={0.75} />
        </group>
      </group>
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* THE SMILE                                                           */
/* The Doors-style corridor filler. Not a body: a mass, with nothing on */
/* it but two eyes and a grin, bracing itself on six arms.             */
/* ------------------------------------------------------------------ */
export function Smile({ state }: CreatureProps) {
  const arms = useRef<THREE.Group>(null!)
  const face = useRef<THREE.Group>(null!)
  const strands = useRef<THREE.Group>(null!)

  // Ragged mass: many overlapping slabs rather than one box, so the
  // silhouette has a broken edge instead of four clean corners.
  const chunks = useMemo(() => {
    const out: { pos: Vec3; size: Vec3; rot: number }[] = []
    for (let i = 0; i < 11; i++) {
      const j = Math.sin(i * 78.233) * 43758.5453
      const r = j - Math.floor(j)
      const j2 = Math.sin(i * 12.9898) * 43758.5453
      const r2 = j2 - Math.floor(j2)
      out.push({
        pos: [(r - 0.5) * 0.85, 0.35 + i * 0.21, (r2 - 0.5) * 0.35],
        size: [1.0 + r * 0.55, 0.4 + r2 * 0.3, 0.5 + r * 0.25],
        rot: (r - 0.5) * 0.3,
      })
    }
    return out
  }, [])

  const armSpecs = useMemo(
    () =>
      [
        [-1, 2.25, 0.35],
        [1, 2.3, -0.3],
        [-1, 1.75, -0.25],
        [1, 1.7, 0.3],
        [-1, 1.15, 0.15],
        [1, 1.1, -0.2],
      ] as [number, number, number][],
    [],
  )

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const { attacking, closeness } = state.current

    if (arms.current) {
      arms.current.children.forEach((c, i) => {
        // Stalling, jerking twitches — two detuned sines multiplied, so
        // it hangs still then snaps rather than swinging evenly
        const s = Math.sin(t * (1.9 + i * 0.55) + i * 3)
        const s2 = Math.sin(t * (0.6 + i * 0.17))
        c.rotation.z = s * s2 * 0.3
        c.rotation.y = Math.cos(t * (1.1 + i * 0.26) + i) * 0.2
      })
    }
    if (strands.current) {
      strands.current.children.forEach((c, i) => {
        c.rotation.x = Math.sin(t * (0.8 + i * 0.2) + i) * 0.22
        c.rotation.z = Math.cos(t * (0.6 + i * 0.15)) * 0.16
      })
    }
    if (face.current) {
      face.current.position.y = 2.35 + Math.sin(t * 0.85) * 0.045
      const target = attacking ? 1.3 : 1 + closeness * 0.08
      face.current.scale.setScalar(THREE.MathUtils.lerp(face.current.scale.x, target, 0.14))
    }
  })

  return (
    <group>
      {/* The mass */}
      {chunks.map((c, i) => (
        <mesh
          key={i}
          position={c.pos}
          rotation={[0, c.rot, c.rot * 0.4]}
          material={i % 3 === 0 ? materials.fleshDark : materials.flesh}
          castShadow
        >
          <boxGeometry args={c.size} />
        </mesh>
      ))}

      {/* Shoulder ridge the arms visibly attach to — without this they
          read as sticks floating beside the body */}
      <Plate from={[-0.62, 2.3, 0]} to={[0.62, 2.3, 0]} width={0.3} depth={0.42} />
      <Plate from={[-0.55, 1.55, 0]} to={[0.55, 1.55, 0]} width={0.26} depth={0.38} />

      {/* Six arms, each a chain from the ridge out to a braced hand */}
      <group ref={arms}>
        {armSpecs.map(([side, y, lean], i) => {
          const root: Vec3 = [side * 0.5, y, 0]
          return (
            <group key={i} position={root}>
              <Chain
                points={[
                  [0, 0, 0],
                  [side * 0.75, 0.3 + lean * 0.2, side * 0.1],
                  [side * 1.55, 0.05 + lean * 0.3, side * 0.25],
                  [side * 2.1, -0.55 + lean * 0.2, side * 0.3],
                ]}
                top={0.075}
                bottom={0.02}
              />
              {/* splayed fingers gripping the wall */}
              {[-0.06, 0, 0.06].map((off, j) => (
                <Bone
                  key={j}
                  from={[side * 2.1, -0.55 + lean * 0.2, side * 0.3]}
                  to={[side * 2.3 + off * 0.4, -0.95 + lean * 0.2 - j * 0.04, side * 0.35 + off]}
                  top={0.018}
                  bottom={0.005}
                  material="fleshDark"
                />
              ))}
            </group>
          )
        })}
      </group>

      {/* Strands hanging off the underside — breaks the flat bottom edge */}
      <group ref={strands}>
        {[-0.4, -0.15, 0.12, 0.38].map((x, i) => (
          <group key={i} position={[x, 0.5, 0.1 + (i % 2) * 0.1]}>
            <Chain
              points={[
                [0, 0, 0],
                [x * 0.15, -0.25, 0.04],
                [x * 0.25, -0.48 - (i % 2) * 0.1, 0.02],
              ]}
              top={0.022}
              bottom={0.006}
              material="fleshDark"
              joints={false}
            />
          </group>
        ))}
      </group>

      {/* The only features */}
      <group ref={face} position={[0, 2.35, 0.36]}>
        <Glow position={[-0.19, 0.13, 0]} scale={[0.055, 0.065, 0.032]} />
        <Glow position={[0.16, 0.17, 0]} scale={[0.046, 0.052, 0.032]} />
        <Grin position={[0, -0.07, 0]} width={0.66} arc={0.4} teeth={15} scale={1.15} />
      </group>
    </group>
  )
}

export function Creature({ kind, state }: CreatureProps & { kind: EntityKind }) {
  if (kind === 'long') return <LongOne state={state} />
  if (kind === 'crawler') return <Crawler state={state} />
  return <Smile state={state} />
}
