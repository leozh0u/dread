import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { RigidBody, CapsuleCollider, type RapierRigidBody } from '@react-three/rapier'
import { usePlayerPosition, SPAWN_POINT } from './playerPosition'
import { playFootstep, playJumpSound, playLandSound } from './scareFx'
import * as THREE from 'three'

/** Exported so creature hunt speeds can be clamped against it — see
 * entities/Entity.tsx. A monster faster than the player makes a chase
 * unwinnable, and that relationship should be enforced by the code rather
 * than remembered by whoever edits the numbers next. */
export const PLAYER_SPEED = 4
const SPEED = PLAYER_SPEED
const JUMP_SPEED = 6.5
const LOOK_SPEED = 1.8 // rad/sec, arrow-key look
/** Well below the floor (top face -0.9). Anything past this means the
 * player is no longer in the level. */
const FALL_LIMIT = -8
/** Metres travelled per full two-step stride. Keeps the head bob locked
 * to the footstep rhythm rather than running on its own clock. */
const STRIDE = 1.9
const keys = {
  forward: false,
  back: false,
  left: false,
  right: false,
  jump: false,
  lookLeft: false,
  lookRight: false,
  lookUp: false,
  lookDown: false,
}

// WASD moves; arrow keys look around. This is a deliberate split, not a
// duplicate binding — arrow-key look works whether or not pointer lock is
// currently engaged, so losing pointer lock (Escape, alt-tab, a flaky
// browser) doesn't leave the player stuck unable to look around at all.
function bindKeys() {
  const down = (e: KeyboardEvent) => setKey(e.code, true)
  const up = (e: KeyboardEvent) => setKey(e.code, false)
  function setKey(code: string, v: boolean) {
    if (code === 'KeyW') keys.forward = v
    if (code === 'KeyS') keys.back = v
    if (code === 'KeyA') keys.left = v
    if (code === 'KeyD') keys.right = v
    if (code === 'Space') keys.jump = v
    if (code === 'ArrowLeft') keys.lookLeft = v
    if (code === 'ArrowRight') keys.lookRight = v
    if (code === 'ArrowUp') keys.lookUp = v
    if (code === 'ArrowDown') keys.lookDown = v
  }
  window.addEventListener('keydown', down)
  window.addEventListener('keyup', up)
  return () => {
    window.removeEventListener('keydown', down)
    window.removeEventListener('keyup', up)
  }
}

const PITCH_LIMIT = Math.PI / 2 - 0.05

/**
 * Minimal first-person controller: a capsule RigidBody for collision,
 * moved by WASD relative to camera look direction, camera position synced
 * to the body every frame. Deliberately not a third-person-first library
 * (ecctrl etc.) — those bring their own camera rig that fights a
 * flashlight parented directly to the camera, which is the whole point
 * of this scene.
 */
const STEP_INTERVAL_MS = 380

export function Player({ start = SPAWN_POINT }: { start?: [number, number, number] } = {}) {
  const body = useRef<RapierRigidBody>(null!)
  const { camera } = useThree()
  const lastStep = useRef(0)
  /** Last ground the player actually stood on, for fall recovery. */
  const lastSafe = useRef({ x: 0, y: 0.5, z: 30 })
  const stepPhase = useRef(0)
  const bobAmount = useRef(0)
  const landDip = useRef(0)
  const cameraRoll = useRef(0)
  const wasGrounded = useRef(true)
  const fallSpeed = useRef(0)

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

  useFrame(({ clock }, delta) => {
    if (!body.current) return
    // Clamped so a frame-rate hitch (screen recording, a GC pause) can't
    // jolt the camera — the one place a dropped frame would be visible.
    const dtClamped = Math.min(delta, 0.05)

    if (keys.lookLeft) camera.rotation.y += LOOK_SPEED * delta
    if (keys.lookRight) camera.rotation.y -= LOOK_SPEED * delta
    if (keys.lookUp) camera.rotation.x = Math.min(PITCH_LIMIT, camera.rotation.x + LOOK_SPEED * delta)
    if (keys.lookDown) camera.rotation.x = Math.max(-PITCH_LIMIT, camera.rotation.x - LOOK_SPEED * delta)

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
    // Grounded approximation: resting on the floor keeps vertical velocity
    // near zero (gravity balanced by the contact solver); a real jump or
    // fall pushes it well past this. No raycast/contact-event needed,
    // which matters given this project's history with Rapier events not
    // firing reliably (see playerPosition.ts).
    const grounded = Math.abs(vel.y) < 0.05

    // Landing: only fires on the false -> true grounded transition, scaled
    // by how fast we were falling the instant before touchdown.
    if (grounded && !wasGrounded.current) {
      playLandSound(Math.abs(fallSpeed.current))
      // Knees absorbing the impact. Scaled by how hard the landing was, so
      // stepping off a kerb and dropping properly don't feel identical.
      landDip.current = Math.min(0.16, Math.abs(fallSpeed.current) * 0.018)
    }
    if (!grounded) fallSpeed.current = vel.y
    wasGrounded.current = grounded

    if (keys.jump && grounded) playJumpSound()
    const jumpVel = keys.jump && grounded ? JUMP_SPEED : vel.y
    body.current.setLinvel({ x: move.x, y: jumpVel, z: move.z }, true)

    if (move.lengthSq() > 0 && grounded) {
      const now = performance.now()
      if (now - lastStep.current > STEP_INTERVAL_MS) {
        lastStep.current = now
        playFootstep()
      }
    }

    const t = body.current.translation()

    // --- CAMERA FEEL ---
    // The camera used to be bolted rigidly to the body, which is why
    // walking felt like being slid along on rails: a first-person camera
    // that never moves relative to its own body reads as a floating
    // viewpoint rather than as a person. All of it is deliberately small —
    // this is a dark game people play for a while, and an aggressive head
    // bob is the fastest way to make someone feel ill.
    const planarSpeed = Math.hypot(vel.x, vel.z)
    const walking = grounded && planarSpeed > 0.4

    // Step phase accumulates from distance travelled, so the bob stays in
    // sync with the footstep sounds instead of drifting against them.
    if (walking) stepPhase.current += (planarSpeed * dtClamped) / STRIDE
    const sp = stepPhase.current * Math.PI * 2
    // Amplitude eases in and out so starting and stopping don't snap.
    bobAmount.current += ((walking ? 1 : 0) - bobAmount.current) * Math.min(1, dtClamped * 6)
    const a = bobAmount.current

    // Vertical dips twice per stride (once per foot), lateral once — the
    // figure-of-eight a real head traces.
    const bobY = -Math.abs(Math.sin(sp)) * 0.032 * a
    const bobX = Math.sin(sp * 0.5) * 0.022 * a

    // Landing dip recovers over about a quarter second.
    landDip.current *= Math.max(0, 1 - dtClamped * 7)

    // Idle sway: breathing, so standing still isn't perfectly static.
    const idle = (1 - a) * Math.sin(clock.elapsedTime * 1.1) * 0.006

    // Roll into a strafe. Tiny — enough to feel, not enough to notice.
    const strafe = right.dot(new THREE.Vector3(vel.x, 0, vel.z)) / Math.max(SPEED, 0.001)
    cameraRoll.current += (strafe * -0.016 - cameraRoll.current) * Math.min(1, dtClamped * 5)
    camera.rotation.z = cameraRoll.current + Math.sin(sp * 0.5) * 0.004 * a

    // Last-resort recovery. The level is sealed and the floor is a solid
    // collider, so this should never fire — but "should never" is exactly
    // how a player ends up falling through the world forever with no way
    // back, which is unrecoverable in a way no other bug here is. Restore
    // the last place they were standing rather than the spawn, so a glitch
    // costs a moment instead of the whole run.
    if (t.y < FALL_LIMIT) {
      const safe = lastSafe.current
      body.current.setTranslation({ x: safe.x, y: safe.y, z: safe.z }, true)
      body.current.setLinvel({ x: 0, y: 0, z: 0 }, true)
      console.warn('[dread] fell out of the world — restored to last safe ground')
      return
    }
    if (grounded && t.y > FALL_LIMIT) {
      lastSafe.current.x = t.x
      lastSafe.current.y = t.y + 0.2
      lastSafe.current.z = t.z
    }

    camera.position.set(
      t.x + right.x * bobX,
      t.y + 0.6 + bobY + idle - landDip.current,
      t.z + right.z * bobX,
    )
    usePlayerPosition.getState().set(t.x, t.y, t.z)
  })

  return (
    <RigidBody
      ref={body}
      position={start}
      colliders={false}
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
      {/* Explicit capsule collider matching the visual capsule exactly —
          the previous auto "ball" collider approximated the capsule with
          its bounding sphere, which clipped corners at wall junctions and
          was the real cause of the player occasionally phasing through
          walls. args are [halfHeight, radius]. */}
      <CapsuleCollider args={[0.4, 0.35]} />
      <mesh visible={false}>
        <capsuleGeometry args={[0.35, 0.8]} />
      </mesh>
    </RigidBody>
  )
}
