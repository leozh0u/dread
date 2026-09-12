import type { BoxRegion } from './triggers'

/** Whether the player counts as hidden is decided by useTriggersLoop's
 * bounding-box check against triggers.ts — this is purely the dressing
 * that sells "there is something here to get behind," one distinct prop
 * per spot instead of four identical translucent boxes. */
export function HidingSpot({ spot }: { spot: BoxRegion }) {
  const [cx, cy, cz] = spot.center
  const [hx, hy, hz] = spot.half

  switch (spot.kind) {
    case 'closet':
      return (
        <group position={[cx, 0, cz]}>
          <mesh position={[0, hy, 0]}>
            <boxGeometry args={[hx * 2, hy * 2, hz * 2]} />
            <meshStandardMaterial color="#241c14" roughness={0.9} />
          </mesh>
          {/* door seam */}
          <mesh position={[0, hy, hz + 0.01]}>
            <boxGeometry args={[0.03, hy * 2, 0.02]} />
            <meshStandardMaterial color="#0a0805" />
          </mesh>
          <mesh position={[0.15, hy * 0.9, hz + 0.02]}>
            <sphereGeometry args={[0.03, 6, 6]} />
            <meshStandardMaterial color="#8a7a4a" metalness={0.6} roughness={0.4} />
          </mesh>
        </group>
      )

    case 'curtain':
      return (
        <group position={[cx, 0, cz]}>
          {Array.from({ length: 7 }).map((_, i) => {
            const x = (i / 6 - 0.5) * hx * 2
            return (
              <mesh key={i} position={[x, hy, 0]} rotation={[0, 0, Math.sin(i) * 0.05]}>
                <cylinderGeometry args={[0.05, 0.08, hy * 2, 6, 1, true]} />
                <meshStandardMaterial color="#3a1418" roughness={1} side={2} />
              </mesh>
            )
          })}
          <mesh position={[0, hy * 2 + 0.05, 0]}>
            <boxGeometry args={[hx * 2 + 0.1, 0.05, 0.05]} />
            <meshStandardMaterial color="#1a1a1a" metalness={0.5} />
          </mesh>
        </group>
      )

    case 'crate':
      return (
        <group position={[cx, 0, cz]}>
          <mesh position={[0, hy * 0.6, 0]} rotation={[0, 0.15, 0]}>
            <boxGeometry args={[hx * 1.7, hy * 1.2, hz * 1.7]} />
            <meshStandardMaterial color="#2a2016" roughness={0.95} />
          </mesh>
          <mesh position={[0.25, hy * 1.5, -0.15]} rotation={[0, -0.3, 0.08]}>
            <boxGeometry args={[hx * 1.2, hy * 0.9, hz * 1.2]} />
            <meshStandardMaterial color="#241c12" roughness={0.95} />
          </mesh>
          <mesh position={[-0.2, hy * 0.5, 0.3]} rotation={[0, 0.4, 0]}>
            <boxGeometry args={[hx, hy, hz]} />
            <meshStandardMaterial color="#302518" roughness={0.95} />
          </mesh>
        </group>
      )

    case 'table':
      return (
        <group position={[cx, 0, cz]}>
          <mesh position={[0, cy + hy, 0]}>
            <boxGeometry args={[hx * 2, 0.08, hz * 2]} />
            <meshStandardMaterial color="#1c140c" roughness={0.8} />
          </mesh>
          {[
            [hx - 0.1, cz],
            [-hx + 0.1, cz],
          ].map(([lx], i) =>
            [hz - 0.1, -hz + 0.1].map((lz, j) => (
              <mesh key={`${i}-${j}`} position={[lx, (cy + hy) / 2, lz]}>
                <cylinderGeometry args={[0.05, 0.05, cy + hy, 6]} />
                <meshStandardMaterial color="#150f08" roughness={0.9} />
              </mesh>
            )),
          )}
        </group>
      )

    default:
      return (
        <mesh position={spot.center}>
          <boxGeometry args={[hx * 2, hy * 2, hz * 2]} />
          <meshStandardMaterial color="#0a0a12" transparent opacity={0.15} />
        </mesh>
      )
  }
}
