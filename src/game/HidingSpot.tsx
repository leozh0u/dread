import { RigidBody, CuboidCollider } from '@react-three/rapier'
import type { BoxRegion } from './triggers'
import { FLOOR_TOP } from './geometry'

/**
 * Whether the player counts as hidden is decided by useTriggersLoop's
 * bounding-box check against triggers.ts — this is the dressing that
 * sells "there is something here to get behind."
 *
 * SOLIDITY, AND WHY IT'S SHAPED LIKE THIS. These props had no colliders
 * at all, so you walked straight through a wardrobe, which instantly
 * reads as an unfinished game. But they also can't simply become solid
 * blocks: the hiding region is the SAME volume as the prop, so a solid
 * closet is a closet nobody can hide in.
 *
 * So each is made solid in the shape it should actually be:
 *   closet  — back, both sides and a roof; the FRONT IS OPEN, so you step
 *             inside it exactly as the fiction says you do
 *   crate   — genuinely solid, and small enough to hide beside rather
 *             than inside
 *   curtain — deliberately left passable. It's fabric. Walking through it
 *             is correct, and being able to slip behind it is the point
 *   table   — solid top with clear space beneath, so you get under it
 *
 * Every collider sits inside a room or alcove, never in a corridor, so
 * none of them can block a route through the maze.
 *
 * All of it is based at FLOOR_TOP rather than y=0. These props were built
 * assuming the floor was at zero; it is at -0.9, so every wardrobe, crate
 * and table hung 0.9 units in the air — the same mistake the walls had,
 * and the colliders inherited it. The trigger volumes in triggers.ts are
 * deliberately left alone: they already span the player's actual standing
 * height, and moving them would change where you count as hidden.
 */
export function HidingSpot({ spot }: { spot: BoxRegion }) {
  const [cx, cy, cz] = spot.center
  const [hx, hy, hz] = spot.half

  switch (spot.kind) {
    case 'closet':
      return (
        <group position={[cx, FLOOR_TOP, cz]}>
          {/* Hollow: back, sides and roof only — the front stays open. */}
          {/* Collider positions are LOCAL to the enclosing group, exactly
              like the meshes below. They were written in world coordinates
              while sitting inside a group already positioned at the prop,
              so every offset was applied twice and the colliders ended up
              roughly twice as far from the origin as the furniture they
              were meant to be part of — the props looked solid and you
              walked straight through them. */}
          <RigidBody type="fixed" colliders={false}>
            <CuboidCollider args={[hx, hy, 0.08]} position={[0, hy, -hz]} />
            <CuboidCollider args={[0.08, hy, hz]} position={[-hx, hy, 0]} />
            <CuboidCollider args={[0.08, hy, hz]} position={[hx, hy, 0]} />
            <CuboidCollider args={[hx, 0.08, hz]} position={[0, hy * 2, 0]} />
          </RigidBody>
          {/* Carcass, drawn as panels so the inside isn't a filled block */}
          <mesh position={[0, hy, -hz]}>
            <boxGeometry args={[hx * 2, hy * 2, 0.08]} />
            <meshStandardMaterial color="#241c14" roughness={0.9} />
          </mesh>
          <mesh position={[-hx, hy, 0]}>
            <boxGeometry args={[0.08, hy * 2, hz * 2]} />
            <meshStandardMaterial color="#1e170f" roughness={0.9} />
          </mesh>
          <mesh position={[hx, hy, 0]}>
            <boxGeometry args={[0.08, hy * 2, hz * 2]} />
            <meshStandardMaterial color="#1e170f" roughness={0.9} />
          </mesh>
          <mesh position={[0, hy * 2, 0]}>
            <boxGeometry args={[hx * 2, 0.08, hz * 2]} />
            <meshStandardMaterial color="#241c14" roughness={0.9} />
          </mesh>
          {/* A door hanging open off one edge, so the gap reads as a way in */}
          <mesh position={[-hx - 0.18, hy, hz * 0.55]} rotation={[0, 0.9, 0]}>
            <boxGeometry args={[hx * 1.6, hy * 1.95, 0.05]} />
            <meshStandardMaterial color="#2b2218" roughness={0.9} />
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
        <group position={[cx, FLOOR_TOP, cz]}>
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
        <group position={[cx, FLOOR_TOP, cz]}>
          <RigidBody type="fixed" colliders={false}>
            <CuboidCollider
              args={[hx * 0.85, hy * 0.6, hz * 0.85]}
              position={[0, hy * 0.6, 0]}
            />
          </RigidBody>
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
        <group position={[cx, FLOOR_TOP, cz]}>
          {/* Top only — the space underneath is the hiding spot. */}
          <RigidBody type="fixed" colliders={false}>
            <CuboidCollider args={[hx, 0.06, hz]} position={[0, cy + hy, 0]} />
          </RigidBody>
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
        <mesh position={[cx, FLOOR_TOP + cy, cz]}>
          <boxGeometry args={[hx * 2, hy * 2, hz * 2]} />
          <meshStandardMaterial color="#0a0a12" transparent opacity={0.15} />
        </mesh>
      )
  }
}
