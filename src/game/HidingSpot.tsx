import type { BoxRegion } from './triggers'

/** Purely visual marker — whether the player counts as hidden is decided
 * by useTriggersLoop's bounding-box check against triggers.ts. */
export function HidingSpot({ spot }: { spot: BoxRegion }) {
  const size: [number, number, number] = [spot.half[0] * 2, spot.half[1] * 2, spot.half[2] * 2]
  return (
    <mesh position={spot.center}>
      <boxGeometry args={size} />
      <meshStandardMaterial color="#0a0a12" transparent opacity={0.15} />
    </mesh>
  )
}
