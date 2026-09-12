import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { JUNCTIONS, EDGES, findJunction } from './maze'

export const CEILING_H = 3.2 // low, oppressive, office-ceiling height

/**
 * The signature Backrooms element: rows of failing fluorescent tubes in a
 * low ceiling. These are now the level's primary light source rather than
 * the flashlight — which is what turns the space from "a black void with a
 * torch" into "a lit room that is wrong."
 *
 * Performance note, and the reason this is structured oddly: there are
 * ~35 fixtures, and 35 real point lights would either tank the frame rate
 * or blow the shader's uniform budget outright. So every fixture is an
 * emissive mesh (free — it glows, it flickers, it costs nothing), and a
 * fixed pool of LIGHT_POOL actual point lights is re-parented each frame
 * to whichever fixtures are nearest the player. Constant light count, no
 * shader recompiles, and the player always has real illumination from the
 * tubes they can actually see.
 */
type FixtureState = 'steady' | 'flicker' | 'dead'

interface Fixture {
  position: [number, number, number]
  rotY: number
  state: FixtureState
  seed: number
}

const LIGHT_POOL = 4
const SPACING = 7

function buildFixtures(): Fixture[] {
  const out: Omit<Fixture, 'state' | 'seed'>[] = []

  for (const edge of EDGES) {
    const a = findJunction(edge.a)
    const b = findJunction(edge.b)
    const vertical = a.x === b.x
    const len = vertical ? Math.abs(b.z - a.z) : Math.abs(b.x - a.x)
    const count = Math.max(1, Math.round(len / SPACING))
    for (let i = 1; i <= count; i++) {
      const t = i / (count + 1)
      out.push({
        position: [a.x + (b.x - a.x) * t, CEILING_H - 0.12, a.z + (b.z - a.z) * t],
        rotY: vertical ? 0 : Math.PI / 2,
      })
    }
  }
  for (const j of JUNCTIONS) {
    out.push({ position: [j.x, CEILING_H - 0.12, j.z], rotY: 0 })
  }

  // Broken ones assigned deterministically — stable between runs, no
  // layout roulette. The dead ones matter as much as the lit ones: an
  // unbroken row of working lights reads as maintained, and maintained
  // isn't frightening.
  return out.map((f, i) => ({
    ...f,
    state: (i % 7 === 3 ? 'dead' : i % 4 === 1 ? 'flicker' : 'steady') as FixtureState,
    seed: i * 1.7,
  }))
}

/** Current 0..1 brightness of a fixture at time t. */
function levelOf(f: Fixture, t: number) {
  if (f.state === 'dead') return 0
  if (f.state === 'steady') return 1
  // Arrhythmic: two detuned sines, occasionally dropping out entirely.
  // A clean pulse reads as decorative rather than broken.
  const a = Math.sin(t * 13.7 + f.seed)
  const b = Math.sin(t * 3.1 + f.seed * 2)
  return a * b > -0.15 ? 0.75 + a * 0.25 : 0.06
}

export function Fluorescents() {
  const fixtures = useMemo(buildFixtures, [])
  const tubeMats = useRef<(THREE.MeshStandardMaterial | null)[]>([])
  const poolLights = useRef<(THREE.PointLight | null)[]>([])

  useFrame(({ clock, camera }) => {
    const t = clock.elapsedTime

    // Flicker every tube's emissive (cheap — material uniform only)
    for (let i = 0; i < fixtures.length; i++) {
      const mat = tubeMats.current[i]
      if (mat) mat.emissiveIntensity = 2.2 * levelOf(fixtures[i], t)
    }

    // Re-point the light pool at the nearest fixtures
    const ranked = fixtures
      .map((f, i) => ({
        i,
        d:
          (f.position[0] - camera.position.x) ** 2 +
          (f.position[2] - camera.position.z) ** 2,
      }))
      .sort((a, b) => a.d - b.d)
      .slice(0, LIGHT_POOL)

    for (let slot = 0; slot < LIGHT_POOL; slot++) {
      const light = poolLights.current[slot]
      if (!light) continue
      const pick = ranked[slot]
      if (!pick) {
        light.intensity = 0
        continue
      }
      const f = fixtures[pick.i]
      light.position.set(f.position[0], f.position[1] - 0.25, f.position[2])
      light.intensity = 10 * levelOf(f, t)
    }
  })

  return (
    <>
      {fixtures.map((f, i) => {
        const dead = f.state === 'dead'
        return (
          <group key={i} position={f.position} rotation={[0, f.rotY, 0]}>
            {/* housing */}
            <mesh position={[0, 0.07, 0]}>
              <boxGeometry args={[0.3, 0.08, 1.9]} />
              <meshStandardMaterial color="#2a2a24" roughness={0.8} />
            </mesh>
            {/* tube */}
            <mesh>
              <boxGeometry args={[0.16, 0.06, 1.75]} />
              <meshStandardMaterial
                ref={(m) => {
                  tubeMats.current[i] = m
                }}
                color={dead ? '#2e2e28' : '#fff6cc'}
                emissive={dead ? '#000000' : '#ffeeaa'}
                emissiveIntensity={dead ? 0 : 2.2}
                toneMapped={false}
              />
            </mesh>
          </group>
        )
      })}

      {Array.from({ length: LIGHT_POOL }).map((_, slot) => (
        <pointLight
          key={`pool${slot}`}
          ref={(l) => {
            poolLights.current[slot] = l
          }}
          color="#e8dfa0"
          intensity={0}
          distance={13}
          decay={1.5}
        />
      ))}
    </>
  )
}
