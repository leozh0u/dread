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

/** Only on in inspect mode (M) — lights the line-up so the designs can be
 * judged, without which they'd be black cutouts in a dim corridor. */
function InspectLight() {
  const light = useRef<THREE.PointLight>(null!)
  useFrame(({ camera }) => {
    if (!light.current) return
    light.current.intensity = inspect.on ? 40 : 0
    if (inspect.on) {
      const dir = new THREE.Vector3()
      camera.getWorldDirection(dir)
      light.current.position.set(
        camera.position.x + dir.x * 2,
        camera.position.y + 1,
        camera.position.z + dir.z * 2,
      )
    }
  })
  return <pointLight ref={light} color="#ffffff" intensity={0} distance={14} />
}

export function Entities() {
  return (
    <>
      {ROSTER.map((e, i) => (
        <Entity key={e.kind} kind={e.kind} index={i} startS={e.startS} />
      ))}
      <InspectLight />
    </>
  )
}
