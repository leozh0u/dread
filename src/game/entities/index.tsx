import { Entity } from './Entity'
import { PATH_TOTAL_LENGTH } from '../maze'
import { inspect } from './registry'
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * Three creatures, spaced a third of the patrol loop apart so you meet
 * them at different points and never quite know which one is coming.
 * They differ in silhouette, speed, gait and footstep sound — see
 * creatures.tsx for the designs and Entity.tsx for the shared AI.
 */
const ROSTER = [
  { kind: 'long' as const, startS: PATH_TOTAL_LENGTH * 0.12 },
  { kind: 'crawler' as const, startS: PATH_TOTAL_LENGTH * 0.45 },
  { kind: 'smile' as const, startS: PATH_TOTAL_LENGTH * 0.75 },
]

/**
 * Inspect mode (M) staging.
 *
 * This was written when the creatures were UNLIT flat-black silhouettes:
 * a light pointed at them did nothing, so the tool supplied a bright
 * backdrop and a hard flood to read their outlines against.
 *
 * They take light now, and that staging became actively misleading — an
 * intensity-30 flood against an unlit near-white wall blows every surface
 * out to pale cream, which is nothing like the one dim torch the game is
 * actually lit by. Judging their colour and their detail under it meant
 * judging a creature no player will ever see, and it is exactly how a
 * skull that glowed in the dark survived three rounds of review.
 *
 * So the flood is now a dim fill and the backdrop is a real wall tone:
 * enough to place them in space, while the PLAYER'S OWN FLASHLIGHT does
 * the actual lighting. What you see pressing M is what you see in the
 * corridor.
 */
function InspectStage() {
  const backdrop = useRef<THREE.Mesh>(null!)
  const light = useRef<THREE.PointLight>(null!)

  useFrame(({ camera }) => {
    const on = inspect.on
    if (backdrop.current) backdrop.current.visible = on
    if (light.current) light.current.intensity = on ? 4 : 0
    if (!on) return

    const dir = new THREE.Vector3()
    camera.getWorldDirection(dir)
    dir.y = 0
    dir.normalize()

    // Backdrop sits behind the line-up, facing the player
    if (backdrop.current) {
      backdrop.current.position.set(
        camera.position.x + dir.x * 9,
        1.2,
        camera.position.z + dir.z * 9,
      )
      backdrop.current.lookAt(camera.position.x, 1.2, camera.position.z)
    }
    // Light between player and creatures, aimed at the backdrop so the
    // silhouettes read hard against it
    if (light.current) {
      light.current.position.set(
        camera.position.x + dir.x * 7.5,
        2.6,
        camera.position.z + dir.z * 7.5,
      )
    }
  })

  return (
    <>
      <mesh ref={backdrop} visible={false}>
        <planeGeometry args={[26, 9]} />
        <meshStandardMaterial color="#2e2a22" roughness={1} side={2} />
      </mesh>
      <pointLight ref={light} color="#ffffff" intensity={0} distance={22} />
    </>
  )
}

export function Entities() {
  return (
    <>
      {ROSTER.map((e, i) => (
        <Entity key={e.kind} kind={e.kind} index={i} startS={e.startS} />
      ))}
      <InspectStage />
    </>
  )
}
