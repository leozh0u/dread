import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Bone, Plate, Joint, Chain, Glow, Grin, Ridges, materials } from './shapes'
import { advanceGait, legSwing, kneeBend, bodyBob, bodySway, shoulderTwist, hipTwist } from './gait'

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
  /** Actual metres/second this frame. Gait is driven by this rather than
   * by a hunting flag, so a creature that is standing still has still
   * legs — the previous version animated on a fixed rate regardless of
   * movement, and the tall one had no leg animation at all, which is why
   * they read as gliding rather than walking. */
  speed: number
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
  const legL = useRef<THREE.Group>(null!)
  const legR = useRef<THREE.Group>(null!)
  const shinL = useRef<THREE.Group>(null!)
  const shinR = useRef<THREE.Group>(null!)
  const hips = useRef<THREE.Group>(null!)
  const torso = useRef<THREE.Group>(null!)
  const gait = useRef(0)
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
    const { closeness, hunting, speed } = state.current

    // A real walk cycle (gait.ts): stance and swing rather than a sine, so
    // a foot plants and the body passes over it. Long legs, long stride.
    gait.current = advanceGait(gait.current, speed, 0.016, 2.6)
    const g = gait.current
    // Amplitude scales in from standing, so it doesn't march on the spot.
    const amp = Math.min(1, speed / 2.2)

    if (legL.current) legL.current.rotation.x = legSwing(g, 0, 0.85 * amp)
    if (legR.current) legR.current.rotation.x = legSwing(g, 0.5, 0.85 * amp)
    // Knees fold during the swing so the foot clears the floor instead of
    // scything through it — the thing that most gives away a fake walk.
    if (shinL.current) shinL.current.rotation.x = kneeBend(g, 0) * 0.9 * amp
    if (shinR.current) shinR.current.rotation.x = kneeBend(g, 0.5) * 0.9 * amp

    if (hips.current) {
      hips.current.position.y = bodyBob(g, 0.1 * amp)
      hips.current.position.x = bodySway(g, 0.05 * amp)
      hips.current.rotation.y = hipTwist(g, 0.16 * amp)
      // Leans into its own travel — weight ahead of the feet.
      hips.current.rotation.x = -0.04 * amp
    }
    // Shoulders counter-rotate against the hips, which is what stops a
    // walking figure looking like one rigid piece being slid along.
    if (torso.current) torso.current.rotation.y = shoulderTwist(g, 0.2 * amp)

    if (tendrils.current) {
      tendrils.current.children.forEach((c, i) => {
        // Slow underwater drift, each on its own period so they never sync
        c.rotation.z = Math.sin(t * (0.42 + i * 0.13) + i) * 0.3
        c.rotation.x = Math.cos(t * (0.36 + i * 0.09) + i * 2) * 0.22
        c.rotation.y = Math.sin(t * (0.28 + i * 0.07)) * 0.18
      })
    }
    if (arms.current) {
      // Dead weight rather than a walker's arm swing — it hangs and is
      // carried, lagging a quarter-cycle behind the shoulders that move it.
      arms.current.rotation.x = Math.sin(t * 0.8) * 0.07 + legSwing(g, 0.5, 0.18 * amp)
      arms.current.rotation.z = Math.sin(t * 0.55) * 0.04
    }
    if (head.current) {
      head.current.rotation.y = Math.sin(t * 0.3) * 0.1 - shoulderTwist(g, 0.2 * amp)
      // Cancels the body's bob: the head stays dead level while everything
      // below it rises and falls, which is the specific wrongness this
      // creature is built around.
      head.current.position.y = -bodyBob(g, 0.1 * amp) * 0.85
    }
    if (headMat.current) {
      const lit = (hunting ? 1 : 0.75) * (0.75 + closeness * 0.25)
      headMat.current.emissiveIntensity = 0.25 + lit * 0.55
    }
  })

  return (
    <group>
      {/* Legs, now jointed. Thigh pivots at the hip, shin pivots at the
          knee inside it, so the knee can fold during the swing phase and
          the foot clears the ground. A single rigid limb rotating from the
          hip is what made this read as a mannequin being dragged. */}
      <group ref={legL} position={[-0.1, 1.24, 0]}>
        <Bone from={[0, 0, 0]} to={[-0.03, -0.62, 0.02]} top={0.078} bottom={0.06} />
        <Joint at={[-0.03, -0.62, 0.02]} r={0.07} />
        <group ref={shinL} position={[-0.03, -0.62, 0.02]}>
          <Bone from={[0, 0, 0]} to={[0.02, -0.62, -0.02]} top={0.06} bottom={0.042} />
          {/* Foot — a long flat splay. Gives the silhouette something to
              plant on, which is most of why a stance phase reads at all. */}
          <Plate from={[0.02, -0.62, -0.02]} to={[0.02, -0.64, 0.19]} width={0.11} depth={0.035} />
        </group>
      </group>
      <group ref={legR} position={[0.1, 1.24, 0]}>
        <Bone from={[0, 0, 0]} to={[0.03, -0.62, 0.02]} top={0.078} bottom={0.06} />
        <Joint at={[0.03, -0.62, 0.02]} r={0.07} />
        <group ref={shinR} position={[0.03, -0.62, 0.02]}>
          <Bone from={[0, 0, 0]} to={[-0.02, -0.62, -0.02]} top={0.06} bottom={0.042} />
          <Plate from={[-0.02, -0.62, -0.02]} to={[-0.02, -0.64, 0.19]} width={0.11} depth={0.035} />
        </group>
      </group>

      {/* Everything above the legs rides the hips, so the bob, the weight
          shift and the hip twist carry through the whole body instead of
          the torso floating independently of its own legs. */}
      <group ref={hips}>
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

      {/* Torso counter-rotates against the hips. */}
      <group ref={torso} position={[0, 2.4, 0]}>
      <group position={[0, -2.4, 0]}>
      {/* Growths down the spine — the torso was a clean stack of boxes,
          which is the largest unbroken area on this creature. */}
      <Ridges from={[0.06, 1.35, -0.09]} to={[0.02, 2.36, -0.08]} count={9} size={0.045} />
      <Ridges from={[-0.05, 1.5, -0.08]} to={[-0.03, 2.2, -0.07]} count={5} size={0.032} />

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
        {/* Nodules down the forearms, so the long hanging arms have
            something for the torch to break on. */}
        <Ridges from={[-0.36, 1.7, 0.04]} to={[-0.36, 0.7, 0.05]} count={6} size={0.028} />
        <Ridges from={[0.35, 1.66, 0.04]} to={[0.35, 0.62, 0.05]} count={6} size={0.028} />

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
      </group>
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
  const gait = useRef(0)
  const body = useRef<THREE.Group>(null!)
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
    const { closeness, hunting, attacking, speed } = state.current

    // A quadruped trot: DIAGONAL pairs move together — front-left with
    // rear-right, front-right with rear-left. Four limbs each waving on
    // their own offset (what this did before) is how you get something
    // that looks like it's treading water; diagonal pairing is what makes
    // an animal look like it's carrying its own weight.
    // Short stride, so it takes many quick steps — it should skitter.
    gait.current = advanceGait(gait.current, speed + 0.35, 0.016, 0.75)
    const g = gait.current
    const amp = 0.4 + Math.min(1, speed / 4) * 0.55
    // legRoots order: FL, FR, RL, RR -> diagonals share a phase.
    const PAIR = [0, 0.5, 0.5, 0]
    if (legs.current) {
      legs.current.children.forEach((c, i) => {
        const off = PAIR[i] ?? 0
        c.rotation.x = legSwing(g, off, amp)
        // Legs splay outward as they lift, so the fold reads from the side.
        c.rotation.z = (i % 2 === 0 ? -1 : 1) * kneeBend(g, off) * 0.22
      })
    }
    if (body.current) {
      // Low, scuttling bob at twice the leg frequency, and a roll toward
      // whichever diagonal is bearing weight.
      body.current.position.y = bodyBob(g, 0.055 * Math.min(1, speed / 3))
      body.current.rotation.z = bodySway(g, 0.07 * Math.min(1, speed / 3))
      body.current.rotation.y = hipTwist(g, 0.09 * Math.min(1, speed / 3))
    }
    if (skull.current) {
      skull.current.rotation.z = Math.sin(t * 2.1) * 0.1
      // Head drops and levels when it's hunting — a stalking posture,
      // rather than the idle sway it has the rest of the time.
      const hunt = hunting ? 1 : 0
      skull.current.rotation.x =
        -0.18 + Math.sin(t * 1.5) * 0.08 * (1 - hunt * 0.7) + hunt * 0.3
    }
    if (jaw.current) {
      const open = 1 + 0.15 + closeness * 0.45 + (attacking ? 0.8 : 0)
      jaw.current.scale.y = THREE.MathUtils.lerp(jaw.current.scale.y, open, 0.15)
    }
  })

  return (
    <group>
      {/* The body rides above the legs: it bobs, rolls and twists while
          the leg roots stay put, so the creature carries its own weight
          rather than the whole thing sliding up and down together. */}
      <group ref={body}>
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

      {/* Growths along the spine, between the ribs. */}
      <Ridges from={[0, 0.56, -0.4]} to={[0, 0.66, 0.48]} count={8} size={0.038} />

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

      </group>

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
  const mass = useRef<THREE.Group>(null!)
  const gait = useRef(0)

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
    const { attacking, closeness, speed } = state.current

    // This one has no legs — it's a mass that hauls itself along — so a
    // step cycle would be wrong for it. Instead it LURCHES: a hard heave
    // forward and up, then a long settle under its own weight, once per
    // cycle. Long stride, so the heaves are slow and far apart and each
    // one lands with the recorded drag sound.
    gait.current = advanceGait(gait.current, speed, 0.016, 1.9)
    const g = gait.current
    const heaveAmp = Math.min(1, speed / 2.9)
    if (mass.current) {
      // Sharp rise over the first fifth of the cycle, then a slow sag —
      // effort, then weight winning.
      const rise = g < 0.2 ? g / 0.2 : 1 - (g - 0.2) / 0.8
      mass.current.position.y = rise * 0.11 * heaveAmp
      // Pitches forward as it heaves and rocks back as it settles.
      mass.current.rotation.x = -rise * 0.07 * heaveAmp
      // Rolls onto alternate sides, so consecutive heaves aren't identical.
      mass.current.rotation.z =
        Math.sin(g * Math.PI * 2) * 0.05 * heaveAmp + Math.sin(t * 0.5) * 0.012
    }

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
    // Strands hang and sway at rest, but trail backwards as it moves —
    // dead weight being dragged, which is the whole read on this one.
    const drag = Math.min(1, state.current.speed / 2.9)
    if (strands.current) {
      strands.current.children.forEach((c, i) => {
        c.rotation.x = Math.sin(t * (0.8 + i * 0.2) + i) * 0.22 - drag * 0.5
        c.rotation.z = Math.cos(t * (0.6 + i * 0.15)) * (0.16 + drag * 0.1)
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
      {/* The whole mass heaves as one — see the lurch in useFrame. */}
      <group ref={mass}>
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
        {/* Growths in the seams between slabs. The slabs read as a stack
            of boxes without something bridging them. */}
        <Ridges from={[-0.3, 0.5, 0.28]} to={[0.25, 2.3, 0.24]} count={10} size={0.055} />
        <Ridges from={[0.3, 0.8, -0.26]} to={[-0.2, 2.1, -0.22]} count={7} size={0.045} />
      </group>

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
