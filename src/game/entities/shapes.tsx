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

export const FLESH = '#100e0c'
export const FLESH_DARK = '#070605'
export const BONE = '#b9b3a4'
export const BONE_DIM = '#6f6a5f'

/** Shared materials — one instance each rather than one per mesh, which
 * matters when three creatures have ~80 parts between them. */
export const materials = {
  flesh: new THREE.MeshStandardMaterial({ color: FLESH, roughness: 0.92, metalness: 0.04 }),
  fleshDark: new THREE.MeshStandardMaterial({ color: FLESH_DARK, roughness: 0.98 }),
  bone: new THREE.MeshStandardMaterial({ color: BONE, roughness: 0.75 }),
  boneDim: new THREE.MeshStandardMaterial({ color: BONE_DIM, roughness: 0.85 }),
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
  sides = 6,
}: {
  from: Vec3
  to: Vec3
  top?: number
  bottom?: number
  material?: keyof typeof materials
  sides?: number
}) {
  const { mid, length, quaternion } = useMemo(() => span(from, to), [from, to])
  return (
    <mesh position={mid} quaternion={quaternion} material={materials[material]}>
      <cylinderGeometry args={[top, bottom, length, sides]} />
    </mesh>
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
    <mesh position={mid} quaternion={quaternion} material={materials[material]}>
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
    <mesh position={at} material={materials[material]}>
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
export function Glow({
  position,
  scale,
  color = '#ffffff',
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

/** A curved row of teeth. Irregular heights and gaps — a perfectly even
 * row reads as a cartoon; an uneven one reads as a mouth. */
export function Grin({
  position,
  width = 0.5,
  arc = 0.34,
  teeth = 11,
  scale = 1,
  color = '#f0ece0',
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
      out.push({
        x: (t - 0.5) * width,
        y: -arc * (1 - (2 * t - 1) ** 2) * 0.5,
        h: (0.05 + 0.05 * (1 - Math.abs(2 * t - 1))) * scale * (0.6 + jitter * 0.8),
        w: (width / teeth) * (0.45 + jitter * 0.3),
        rot: (2 * t - 1) * 0.55 + (jitter - 0.5) * 0.25,
      })
    }
    return out
  }, [width, arc, teeth, scale])

  return (
    <group position={position}>
      {items.map((tooth, i) => (
        <mesh key={i} position={[tooth.x, tooth.y, 0]} rotation={[0, 0, tooth.rot]}>
          <boxGeometry args={[tooth.w, tooth.h, 0.025]} />
          <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}
