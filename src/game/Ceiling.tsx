import { useMemo } from 'react'
import { CEILING_BOTTOM } from './geometry'

/**
 * Structure overhead.
 *
 * The ceiling was a single flat slab across the whole level — 52 by 106
 * units of nothing. Anywhere the player looks up, and every corridor
 * vanishing point, ended in blank colour, which flattens a space as badly
 * as bare walls do: with no repeating structure above you there's nothing
 * to judge distance or motion against, so a long corridor reads as a
 * painted backdrop rather than as depth you're moving through.
 *
 * Beams at a regular spacing fix that specifically. They're the strongest
 * depth cue available in a corridor — a receding series of identical
 * objects — and they cost almost nothing, because the player only ever
 * sees the handful directly overhead.
 *
 * Everything here is decorative and has no collider: it sits above head
 * height and nothing should ever bump into it.
 */

const BEAM_TINT = '#2f2b1e'
const VENT_TINT = '#3c3a33'
const CABLE_TINT = '#1b1a16'

/** Beams every this many units along the level's long axis. Close enough
 * to read as rhythm when you walk under them, far enough apart not to
 * become a tunnel of stripes. */
const BEAM_SPACING = 5.5

const MIN_Z = -72
const MAX_Z = 33
const HALF_W = 26
const CENTRE_X = 2

export function Ceiling() {
  const beams = useMemo(() => {
    const out: number[] = []
    for (let z = MIN_Z; z <= MAX_Z; z += BEAM_SPACING) out.push(z)
    return out
  }, [])

  /**
   * Vents and hanging cables, placed by a deterministic hash of their own
   * index so the level looks the same every run — and sparse, because the
   * point is to break the repetition of the beams, not to replace one
   * uniform surface with another.
   */
  const fittings = useMemo(() => {
    const out: { x: number; z: number; kind: 'vent' | 'cable'; len: number }[] = []
    for (let i = 0; i < 26; i++) {
      const n = (k: number) => ((Math.sin((i + 1) * 12.9898 + k * 78.233) * 43758.5453) % 1 + 1) % 1
      out.push({
        x: CENTRE_X + (n(1) - 0.5) * 40,
        z: MIN_Z + n(2) * (MAX_Z - MIN_Z),
        kind: n(3) > 0.45 ? 'cable' : 'vent',
        len: 0.3 + n(4) * 0.7,
      })
    }
    return out
  }, [])

  return (
    <group>
      {beams.map((z, i) => (
        <mesh key={`b${i}`} position={[CENTRE_X, CEILING_BOTTOM - 0.14, z]}>
          <boxGeometry args={[HALF_W * 2, 0.22, 0.3]} />
          <meshStandardMaterial color={BEAM_TINT} roughness={0.95} />
        </mesh>
      ))}

      {fittings.map((f, i) =>
        f.kind === 'vent' ? (
          <group key={`f${i}`} position={[f.x, CEILING_BOTTOM - 0.13, f.z]}>
            <mesh>
              <boxGeometry args={[0.8, 0.12, 0.55]} />
              <meshStandardMaterial color={VENT_TINT} roughness={0.55} metalness={0.45} />
            </mesh>
            {/* Louvres — the thing that makes a vent read as a vent rather
                than as a plate stuck to the ceiling. */}
            {[-0.22, -0.07, 0.08, 0.23].map((o, j) => (
              <mesh key={j} position={[0, -0.08, o]} rotation={[0.5, 0, 0]}>
                <boxGeometry args={[0.72, 0.05, 0.1]} />
                <meshStandardMaterial color="#26241f" roughness={0.8} />
              </mesh>
            ))}
          </group>
        ) : (
          // A cable hanging out of the ceiling. Gives the torch a thin
          // vertical to catch, and something to move past at head height.
          <mesh
            key={`f${i}`}
            position={[f.x, CEILING_BOTTOM - 0.1 - f.len / 2, f.z]}
          >
            <cylinderGeometry args={[0.018, 0.018, f.len, 5]} />
            <meshStandardMaterial color={CABLE_TINT} roughness={1} />
          </mesh>
        ),
      )}
    </group>
  )
}
