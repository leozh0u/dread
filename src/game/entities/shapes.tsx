import { forwardRef } from 'react'
import * as THREE from 'three'

/**
 * Shared shape language for all three entities, taken from what the
 * reference images actually have in common:
 *
 * 1. **Pure flat black bodies.** Every body part uses meshBasicMaterial,
 *    which ignores lighting entirely and renders as a solid unshaded
 *    shape. This is the single most important decision here. Shaded
 *    geometry gives the eye form cues — roundness, softness, volume —
 *    and primitives shaded that way always read as toys. A flat black
 *    shape has no form cues at all, only an outline, so the brain reads
 *    silhouette and fills in the rest with something worse than anything
 *    we could model. It's also why this only works now that the
 *    corridors are lit: a black cutout needs something to be cut out of.
 *
 * 2. **The face is the only lit thing.** Emissive, tone-mapping disabled
 *    so it blows out — eyes and mouth float on the dark mass.
 *
 * 3. **Limbs far too long and far too thin**, splayed at angles no
 *    skeleton would hold.
 */

export const VOID = '#000000'

export function Void(props: { children?: React.ReactNode }) {
  return <>{props.children}</>
}

/** A flat black box — the workhorse for limbs and masses. */
export const Slab = forwardRef<
  THREE.Mesh,
  {
    args: [number, number, number]
    position?: [number, number, number]
    rotation?: [number, number, number]
    scale?: [number, number, number] | number
  }
>(function Slab({ args, position, rotation, scale }, ref) {
  return (
    <mesh ref={ref} position={position} rotation={rotation} scale={scale}>
      <boxGeometry args={args} />
      <meshBasicMaterial color={VOID} />
    </mesh>
  )
})

/** A flat black tapered limb segment. */
export const Limb = forwardRef<
  THREE.Mesh,
  {
    length: number
    top?: number
    bottom?: number
    position?: [number, number, number]
    rotation?: [number, number, number]
  }
>(function Limb({ length, top = 0.045, bottom = 0.02, position, rotation }, ref) {
  return (
    <mesh ref={ref} position={position} rotation={rotation}>
      <cylinderGeometry args={[top, bottom, length, 5]} />
      <meshBasicMaterial color={VOID} />
    </mesh>
  )
})

/** Glowing face feature — eyes, grins. The only bright thing on any of
 * these creatures. */
export function Glow({
  position,
  scale,
  rotation,
  color = '#ffffff',
  geometry = 'sphere',
}: {
  position: [number, number, number]
  scale?: [number, number, number] | number
  rotation?: [number, number, number]
  color?: string
  geometry?: 'sphere' | 'box'
}) {
  return (
    <mesh position={position} scale={scale} rotation={rotation}>
      {geometry === 'sphere' ? (
        <sphereGeometry args={[1, 10, 8]} />
      ) : (
        <boxGeometry args={[1, 1, 1]} />
      )}
      <meshBasicMaterial color={color} toneMapped={false} />
    </mesh>
  )
}

/** A curved row of teeth forming a grin — the Doors-entity signature and
 * the thing that makes a featureless black mass read as *looking at you*. */
export function Grin({
  position,
  width = 0.5,
  arc = 0.34,
  teeth = 9,
  scale = 1,
  color = '#ffffff',
}: {
  position: [number, number, number]
  width?: number
  arc?: number
  teeth?: number
  scale?: number
  color?: string
}) {
  return (
    <group position={position}>
      {Array.from({ length: teeth }).map((_, i) => {
        const t = i / (teeth - 1) // 0..1 across the mouth
        const x = (t - 0.5) * width
        // parabola: corners of the mouth ride up, centre drops
        const y = -arc * (1 - (2 * t - 1) ** 2) * 0.5
        const h = (0.055 + 0.045 * (1 - Math.abs(2 * t - 1))) * scale
        return (
          <mesh key={i} position={[x, y, 0]} rotation={[0, 0, (2 * t - 1) * 0.5]}>
            <boxGeometry args={[width / teeth / 1.5, h, 0.02]} />
            <meshBasicMaterial color={color} toneMapped={false} />
          </mesh>
        )
      })}
    </group>
  )
}
