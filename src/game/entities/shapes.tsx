import { useMemo } from 'react'
import * as THREE from 'three'

/**
 * Shared construction kit for the three creatures.
 *
 * Two decisions here, both corrections of earlier mistakes:
 *
 * 1. **Bones span two explicit endpoints.** Limbs used to be cylinders
 *    placed by hand-guessed offsets and rotations, which is exactly how
 *    you end up with arms hovering beside a torso and a skull floating
 *    above a body. A Bone takes `from` and `to` in the same local space
 *    and computes its own position, orientation and length, so if two
 *    parts share a point they are structurally connected and cannot
 *    drift apart.
 *
 * 2. **Materials are shaded, not flat.** These were meshBasicMaterial —
 *    unlit — which renders a box as a solid 2D rectangle with no form at
 *    all. That's what made them read as cardboard cutouts. They're dark
 *    enough to still silhouette hard against a lit wall, but they now
 *    take light, so edges, volume and depth are visible.
 */

/**
 * VALUE RANGE IS WHY THEY LOOKED BLAND.
 *
 * These were #100e0c — RGB(16,14,12), which is essentially black. A
 * near-black surface has almost no range for light to shade across, so
 * every form on it collapses to one flat value and reads as a silhouette
 * with no interior. No amount of added geometry can show on a surface
 * that dark; the detail was invisible rather than missing, which is why
 * "add more detail" kept not working.
 *
 * They're lifted to a dark greyish-brown instead: still grim, still
 * silhouettes hard against a lit wall, but now with enough range that the
 * flashlight produces a gradient across a limb and the shapes read as
 * volumes. Roughness varies per material too — uniform roughness is the
 * other half of why a surface looks like plastic.
 */
export const FLESH = '#3a332b'
export const FLESH_DARK = '#241f19'
export const SINEW = '#4a4036'
export const BONE = '#c8c2b2'
export const BONE_DIM = '#847d70'
/** Weathered, stained bone. The creatures' skulls were near-white, which
 * in a pitch-dark corridor is the brightest thing on screen and reads as
 * moulded plastic. Bone that has been somewhere damp for a long time is
 * closer to this. */
export const BONE_FOUL = '#6d6659'

/** Shared materials — one instance each rather than one per mesh, which
 * matters when three creatures have ~80 parts between them. */
export const materials = {
  flesh: new THREE.MeshStandardMaterial({ color: FLESH, roughness: 0.78, metalness: 0.05 }),
  fleshDark: new THREE.MeshStandardMaterial({ color: FLESH_DARK, roughness: 0.95 }),
  // Slightly glossier and lighter — used for exposed tendon and the
  // ridges along a limb, so those catch the torch when the flesh doesn't.
  sinew: new THREE.MeshStandardMaterial({ color: SINEW, roughness: 0.45, metalness: 0.1 }),
  bone: new THREE.MeshStandardMaterial({ color: BONE, roughness: 0.6 }),
  boneDim: new THREE.MeshStandardMaterial({ color: BONE_DIM, roughness: 0.8 }),
  boneFoul: new THREE.MeshStandardMaterial({ color: BONE_FOUL, roughness: 0.85 }),
  /** Teeth. Low roughness so the torch puts a wet highlight along the row
   * instead of lighting them evenly — that highlight is the only thing
   * that should make a mouth visible in the dark. */
  // Teeth. Dark and matte enough not to become the brightest object in
  // the frame: at roughness 0.3 the torch, which points straight down the
  // creature's face, put a specular highlight across the whole row and
  // turned it into a lit keyboard.
  tooth: new THREE.MeshStandardMaterial({ color: '#736a58', roughness: 0.62, metalness: 0.03 }),
}

/**
 * A cranium that is not a ball.
 *
 * Every head in this game was a scaled `icosahedronGeometry` — a regular
 * solid, near-uniformly scaled, in a pale colour. That is a smooth
 * symmetrical ovoid, and a smooth symmetrical pale ovoid with two round
 * sockets in it is a cartoon: it was the single biggest reason the
 * creatures read as goofy rather than frightening, and no amount of
 * detail added to their bodies could compete with it.
 *
 * This displaces every vertex by a few smooth sine lobes driven by the
 * vertex's own position, so the result is lumpen and asymmetric but
 * perfectly deterministic — the same seed gives the same skull every run.
 *
 * Driving the displacement from POSITION rather than from vertex index is
 * the part that matters. Icosahedron geometry is non-indexed, so each
 * face carries its own copy of its corners; displacing by index would
 * move those copies apart and tear the mesh into floating triangles.
 * Position-driven noise moves every copy of a corner identically, so the
 * surface stays closed. Recomputing normals afterwards keeps the flat
 * faceting, which is what makes it read as bone rather than as a blob.
 */
const skullCache = new Map<string, THREE.BufferGeometry>()

export function crushedSkull(seed: number, detail = 2): THREE.BufferGeometry {
  const key = `${seed}:${detail}`
  const hit = skullCache.get(key)
  if (hit) return hit

  const geo = new THREE.IcosahedronGeometry(1, detail)
  const pos = geo.attributes.position as THREE.BufferAttribute
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const d =
      1 +
      0.13 * Math.sin(3.1 * v.x + seed) +
      0.11 * Math.cos(2.7 * v.y + 1.3 * seed) +
      0.09 * Math.sin(2.2 * v.z + 2.1 * seed) +
      0.06 * Math.sin(4.5 * (v.x + v.z) + seed * 0.7) +
      // A single low lobe that pulls one side in further than the other,
      // so the skull is visibly lopsided rather than merely bumpy.
      0.08 * Math.sin(1.3 * v.x - 0.9 * v.y + seed * 1.7)
    pos.setXYZ(i, v.x * d, v.y * d, v.z * d)
  }
  geo.computeVertexNormals()
  skullCache.set(key, geo)
  return geo
}

type Vec3 = [number, number, number]

/** Orientation + length for a Y-aligned primitive spanning from -> to. */
function span(from: Vec3, to: Vec3) {
  const a = new THREE.Vector3(...from)
  const b = new THREE.Vector3(...to)
  const dir = b.clone().sub(a)
  const length = dir.length()
  const mid = a.clone().add(b).multiplyScalar(0.5)
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    dir.clone().normalize(),
  )
  return { mid, length, quaternion }
}

/**
 * A tapered limb segment running between two points. Because both ends
 * are given explicitly, chained bones that share a point are guaranteed
 * to meet.
 */
export function Bone({
  from,
  to,
  top = 0.05,
  bottom = 0.03,
  material = 'flesh',
  sides = 9,
}: {
  from: Vec3
  to: Vec3
  top?: number
  bottom?: number
  material?: keyof typeof materials
  sides?: number
}) {
  const { mid, length, quaternion } = useMemo(() => span(from, to), [from, to])

  /**
   * A lathed profile rather than a plain cylinder.
   *
   * A smooth taper is a tube, and tubes read as scaffolding. Real limbs
   * swell and narrow — muscle bellies, joint knuckles, the pinch between
   * them — and that variation along the length is most of what makes a
   * shape look grown instead of extruded.
   *
   * Done with a lathe so it stays ONE mesh and one draw call. Building it
   * out of several stacked cylinders would look the same and cost three
   * times as much, with ~80 parts across three creatures.
   *
   * The bulge count and phase come from the bone's own dimensions, so
   * every limb in the game gets a slightly different profile for free and
   * no two segments are identical.
   */
  const geometry = useMemo(() => {
    const STEPS = 9
    const bulges = 2 + ((Math.abs(length * 7) | 0) % 2)
    const phase = (Math.abs(top * 97) % 1) * Math.PI
    const pts: THREE.Vector2[] = []
    for (let i = 0; i <= STEPS; i++) {
      const t = i / STEPS
      const base = top + (bottom - top) * t
      // Swell and pinch along the length, plus a slight asymmetry so the
      // two ends don't mirror each other.
      const swell = 1 + 0.16 * Math.sin(t * Math.PI * bulges + phase) + 0.05 * Math.sin(t * 7.3)
      pts.push(new THREE.Vector2(Math.max(0.004, base * swell), length * (t - 0.5)))
    }
    const g = new THREE.LatheGeometry(pts, sides)
    g.computeVertexNormals()
    return g
  }, [top, bottom, length, sides])

  return (
    <mesh
      position={mid}
      quaternion={quaternion}
      material={materials[material]}
      geometry={geometry}
      castShadow
    />
  )
}

/** A slab spanning two points — for spines, plates, ribs. */
export function Plate({
  from,
  to,
  width = 0.1,
  depth = 0.06,
  material = 'flesh',
}: {
  from: Vec3
  to: Vec3
  width?: number
  depth?: number
  material?: keyof typeof materials
}) {
  const { mid, length, quaternion } = useMemo(() => span(from, to), [from, to])
  return (
    <mesh position={mid} quaternion={quaternion} material={materials[material]} castShadow>
      <boxGeometry args={[width, length, depth]} />
    </mesh>
  )
}

/** A joint bulb. Sits at a shared endpoint and visually welds the two
 * bones meeting there — the difference between a limb and two sticks. */
export function Joint({
  at,
  r = 0.055,
  material = 'flesh',
}: {
  at: Vec3
  r?: number
  material?: keyof typeof materials
}) {
  return (
    <mesh position={at} material={materials[material]} castShadow>
      <icosahedronGeometry args={[r, 0]} />
    </mesh>
  )
}

/**
 * A chain of bones through a list of points, with a joint at every
 * interior vertex. Tapers along its length. This is what gives limbs
 * articulation and detail instead of reading as one straight stick.
 */
export function Chain({
  points,
  top = 0.05,
  bottom = 0.015,
  material = 'flesh',
  joints = true,
}: {
  points: Vec3[]
  top?: number
  bottom?: number
  material?: keyof typeof materials
  joints?: boolean
}) {
  return (
    <>
      {points.slice(1).map((p, i) => {
        const t0 = i / (points.length - 1)
        const t1 = (i + 1) / (points.length - 1)
        return (
          <Bone
            key={i}
            from={points[i]}
            to={p}
            top={top + (bottom - top) * t0}
            bottom={top + (bottom - top) * t1}
            material={material}
          />
        )
      })}
      {joints &&
        points.slice(1, -1).map((p, i) => {
          const t = (i + 1) / (points.length - 1)
          return <Joint key={i} at={p} r={(top + (bottom - top) * t) * 1.5} material={material} />
        })}
    </>
  )
}

/** Glowing face feature — the only bright thing on any of these. */
/**
 * Eyeshine. Unlit on purpose — this is the one thing on a creature that
 * should be visible before your torch finds it, the way an animal's eyes
 * catch light at the edge of a campfire.
 *
 * It was pure `#ffffff` with tone mapping off, which meant two perfectly
 * white spheres rendered at full brightness no matter how dark the room
 * was. Against a near-black body that is a pair of cartoon eyes, and it
 * was most of why this creature read as a smiley face in the dark.
 *
 * A dim, dirty amber sits just above the ambient floor: far enough above
 * black to catch your attention down a corridor, nowhere near bright
 * enough to light the face it belongs to.
 */
export function Glow({
  position,
  scale,
  color = '#4a2410',
}: {
  position: Vec3
  scale?: Vec3 | number
  color?: string
}) {
  return (
    <mesh position={position} scale={scale}>
      <sphereGeometry args={[1, 12, 10]} />
      <meshBasicMaterial color={color} toneMapped={false} />
    </mesh>
  )
}

/**
 * A curved row of teeth. Irregular heights and gaps — a perfectly even
 * row reads as a cartoon; an uneven one reads as a mouth.
 *
 * THE TEETH USED TO BE THE BRIGHTEST OBJECT IN THE GAME. They were
 * `meshBasicMaterial` at `#f0ece0` with `toneMapped={false}`, which is an
 * instruction to draw them at full white regardless of lighting. In a
 * corridor lit by one torch that made a row of glowing white teeth
 * floating in the dark — a jack-o'-lantern, not a mouth — and it drowned
 * out every bit of body detail on the creature wearing it.
 *
 * They are lit surfaces now, in stained ivory, glossy enough that the
 * torch draws a highlight along the row. You see the mouth when you look
 * at it, which is the entire point: the creature should be revealed by
 * your own light, not announce itself.
 */
export function Grin({
  position,
  width = 0.5,
  arc = 0.34,
  teeth = 11,
  scale = 1,
  color,
}: {
  position: Vec3
  width?: number
  arc?: number
  teeth?: number
  scale?: number
  color?: string
}) {
  const items = useMemo(() => {
    const out: { x: number; y: number; h: number; w: number; rot: number }[] = []
    for (let i = 0; i < teeth; i++) {
      const t = i / (teeth - 1)
      // deterministic jitter so teeth are uneven but stable
      const j = Math.sin(i * 12.9898) * 43758.5453
      const jitter = j - Math.floor(j)
      const j2 = Math.sin(i * 4.271 + 1.7) * 24634.6345
      const jitter2 = j2 - Math.floor(j2)
      // GAPS. A complete row of teeth is a grin; a row with pieces
      // missing is damage. Roughly one in five is dropped, chosen by the
      // same deterministic hash as everything else so a given creature
      // has the same missing teeth every run.
      if (jitter2 < 0.2) continue
      out.push({
        x: (t - 0.5) * width,
        y: -arc * (1 - (2 * t - 1) ** 2) * 0.5,
        h: (0.05 + 0.05 * (1 - Math.abs(2 * t - 1))) * scale * (0.45 + jitter * 1.15),
        w: (width / teeth) * (0.4 + jitter * 0.35),
        rot: (2 * t - 1) * 0.55 + (jitter - 0.5) * 0.6,
      })
    }
    return out
  }, [width, arc, teeth, scale])

  return (
    <group position={position}>
      {items.map((tooth, i) => (
        <mesh
          key={i}
          position={[tooth.x, tooth.y, 0]}
          rotation={[0, 0, tooth.rot]}
          material={color ? undefined : materials.tooth}
        >
          {/* Tapered to a point rather than a flat-topped bar. A row of
              rectangles is a keyboard no matter how uneven it is; the
              taper is what makes the same row read as teeth. */}
          <coneGeometry args={[tooth.w * 0.5, tooth.h, 5]} />
          {color ? <meshStandardMaterial color={color} roughness={0.3} /> : null}
        </mesh>
      ))}
    </group>
  )
}

/**
 * Small hard growths scattered along a line between two points.
 *
 * Large smooth areas are what make a creature read as a mannequin: real
 * bodies have scale-level features that break a surface up, and without
 * them a limb is just a shape. These are deliberately irregular in size
 * and angle and deterministic from their own index, so a spine or a
 * forearm gets a run of them that never repeats and never needs
 * hand-placing.
 *
 * Uses the glossier `sinew` material by default, so they catch the
 * flashlight a beat before the flesh around them does — the highlight is
 * what actually communicates that a surface has texture.
 */
export function Ridges({
  from,
  to,
  count = 6,
  size = 0.035,
  material = 'sinew',
  spread = 0.5,
}: {
  from: Vec3
  to: Vec3
  count?: number
  size?: number
  material?: keyof typeof materials
  spread?: number
}) {
  const items = useMemo(() => {
    const a = new THREE.Vector3(...from)
    const b = new THREE.Vector3(...to)
    const out: { p: Vec3; s: Vec3; r: Vec3 }[] = []
    for (let i = 0; i < count; i++) {
      // Deterministic pseudo-noise: no Math.random, so a creature looks
      // the same every frame and every run.
      const n = (k: number) => ((Math.sin((i + 1) * 12.9898 + k * 78.233) * 43758.5453) % 1 + 1) % 1
      const t = (i + 0.5) / count
      const p = a.clone().lerp(b, t)
      const jitter = size * spread
      out.push({
        p: [p.x + (n(1) - 0.5) * jitter, p.y + (n(2) - 0.5) * jitter, p.z + (n(3) - 0.5) * jitter],
        s: [size * (0.55 + n(4)), size * (0.7 + n(5) * 1.4), size * (0.55 + n(6))],
        r: [n(7) * Math.PI, n(8) * Math.PI, n(9) * Math.PI],
      })
    }
    return out
  }, [from, to, count, size, spread])

  return (
    <group>
      {items.map((it, i) => (
        <mesh
          key={i}
          position={it.p}
          scale={it.s}
          rotation={it.r}
          material={materials[material]}
          castShadow
        >
          <octahedronGeometry args={[1, 0]} />
        </mesh>
      ))}
    </group>
  )
}
