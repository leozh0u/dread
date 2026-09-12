import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { RigidBody, type RapierRigidBody } from '@react-three/rapier'
import { usePlayerPosition } from './playerPosition'
import * as THREE from 'three'

const SPEED = 4
const keys = { forward: false, back: false, left: false, right: false }

function bindKeys() {
  const down = (e: KeyboardEvent) => setKey(e.code, true)
  const up = (e: KeyboardEvent) => setKey(e.code, false)
  function setKey(code: string, v: boolean) {
    if (code === 'KeyW' || code === 'ArrowUp') keys.forward = v
    if (code === 'KeyS' || code === 'ArrowDown') keys.back = v
    if (code === 'KeyA' || code === 'ArrowLeft') keys.left = v
    if (code === 'KeyD' || code === 'ArrowRight') keys.right = v
  }
  window.addEventListener('keydown', down)
  window.addEventListener('keyup', up)
  return () => {
    window.removeEventListener('keydown', down)
    window.removeEventListener('keyup', up)
  }
}

/**
 * Minimal first-person controller: a capsule RigidBody for collision,
 * moved by WASD relative to camera look direction, camera position synced
 * to the body every frame. Deliberately not a third-person-first library
 * (ecctrl etc.) — those bring their own camera rig that fights a
 * flashlight parented directly to the camera, which is the whole point
 * of this scene.
 */
export function Player({ start = [0, 1, 10] as [number, number, number] }) {
  const body = useRef<RapierRigidBody>(null!)
  const { camera } = useThree()

  useEffect(() => bindKeys(), [])

  // Teleport to spawn whenever restartRun() bumps this counter — a death
  // deep in the calm room shouldn't leave the next run starting there.
  useEffect(() => {
    let lastId = usePlayerPosition.getState().spawnRequestId
    return usePlayerPosition.subscribe((s) => {
      if (s.spawnRequestId === lastId) return
      lastId = s.spawnRequestId
      if (!body.current) return
      body.current.setTranslation({ x: start[0], y: start[1], z: start[2] }, true)
      body.current.setLinvel({ x: 0, y: 0, z: 0 }, true)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useFrame(() => {
    if (!body.current) return
    const dir = new THREE.Vector3()
    camera.getWorldDirection(dir)
    dir.y = 0
    dir.normalize()
    const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0))

    const move = new THREE.Vector3()
    if (keys.forward) move.add(dir)
    if (keys.back) move.sub(dir)
    if (keys.right) move.add(right)
    if (keys.left) move.sub(right)
    if (move.lengthSq() > 0) move.normalize().multiplyScalar(SPEED)

    const vel = body.current.linvel()
    body.current.setLinvel({ x: move.x, y: vel.y, z: move.z }, true)

    const t = body.current.translation()
    camera.position.set(t.x, t.y + 0.6, t.z)
    usePlayerPosition.getState().set(t.x, t.y, t.z)
  })

  return (
    <RigidBody
      ref={body}
      position={start}
      colliders="ball"
      mass={1}
      enabledRotations={[false, false, false]}
      friction={0}
      linearDamping={2}
      ccd // continuous collision detection against frame-rate dips (real
      // risk with screen-recording software during a live demo). Confirmed
      // via testing this doesn't interfere with trigger detection, since
      // clues/hiding spots/calm room are plain distance checks now, not
      // physics sensors -- see playerPosition.ts and triggers.ts.
    >
      <mesh visible={false}>
        <capsuleGeometry args={[0.35, 0.8]} />
      </mesh>
    </RigidBody>
  )
}
