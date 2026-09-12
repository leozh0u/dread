import { useEffect, useRef, type ElementRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { PointerLockControls } from '@react-three/drei'
import { Physics } from '@react-three/rapier'
import { Player } from './Player'
import { House } from './House'
import { Entities } from './entities'
import { EffectComposer, Vignette, Noise, ChromaticAberration } from '@react-three/postprocessing'
import * as THREE from 'three'
import { updateAudioListener } from './scareFx'
import { installDevBridge } from './devBridge'

/** Flashlight rigidly attached to the camera. */
function Flashlight() {
  const light = useRef<THREE.SpotLight>(null!)
  const target = useRef<THREE.Object3D>(null!)
  const { camera } = useThree()

  useFrame(() => {
    light.current.position.copy(camera.position)
    const dir = new THREE.Vector3()
    camera.getWorldDirection(dir)
    updateAudioListener(camera.position.x, camera.position.y, camera.position.z, dir.x, dir.y, dir.z)
    target.current.position.copy(camera.position).add(dir.clone().multiplyScalar(5))
    light.current.target = target.current
  })

  return (
    <>
      <spotLight
        ref={light}
        intensity={170}
        angle={0.42}
        penumbra={0.75}
        distance={17}
        decay={1.55}
        color="#fff2d0"
        castShadow
        // Explicit and modest. Nothing but the flashlight casts, and its
        // frustum is only 14 units deep, so 1024 is plenty for a sharp
        // silhouette without paying for a map nobody sees the detail in.
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.0015}
        shadow-camera-near={0.4}
        shadow-camera-far={15}
      />
      <object3D ref={target} />
    </>
  )
}

/** Auto-engages pointer lock the moment the scene mounts, so panning/
 * looking around works immediately after clicking BEGIN instead of
 * needing a second click into the canvas. This relies on the browser's
 * "transient activation" window from the BEGIN click still being open a
 * moment later — true in every browser we've tested this in — with the
 * old click-to-lock behavior as an automatic fallback if it isn't. */
/** Publishes a handle on the running game for automated playthroughs.
 * Compiled out of production builds — see devBridge.ts. */
function DevBridge() {
  const { camera } = useThree()
  useEffect(() => {
    installDevBridge(camera)
  }, [camera])
  return null
}

/** How far short of straight up/down the pitch stops, in radians.
 * ~4.6 degrees: far enough from the YXZ singularity to be numerically
 * safe, small enough that nobody notices the ceiling is slightly out of
 * reach. */
const PITCH_MARGIN = 0.08

function AutoPointerLock() {
  const controls = useRef<ElementRef<typeof PointerLockControls>>(null)
  useEffect(() => {
    try {
      // requestPointerLock() returns a Promise in modern browsers, which
      // rejects (not throws) if transient activation already expired or
      // the browser refused it — either way, the player just clicks the
      // canvas once, same as before this existed.
      const result = controls.current?.lock() as unknown
      if (result && typeof (result as Promise<void>).catch === 'function') {
        ;(result as Promise<void>).catch(() => {})
      }
    } catch {
      // synchronous throw path, older browsers
    }
  }, [])
  /**
   * THE PITCH CLAMP IS THE BUG FIX HERE, not a tuning knob.
   *
   * Leo: "sometimes when I move my finger left on the trackpad, the
   * perspective rotates, and then everything is upside down."
   *
   * Three's PointerLockControls does its look in a YXZ euler and clamps
   * pitch with `_euler.x = clamp(PI/2 - maxPolarAngle, PI/2 - minPolarAngle)`.
   * The defaults are minPolarAngle 0 and maxPolarAngle PI, which works out
   * to clamping pitch at EXACTLY plus or minus 90 degrees — and straight
   * up is precisely the singularity of a YXZ euler.
   *
   * At that singularity the decomposition is degenerate: yaw and roll
   * describe the same rotation and can be traded off freely. So looking
   * fully up or down parks the camera exactly on the gimbal lock, and the
   * next horizontal movement lets `setFromQuaternion` come back with yaw
   * and roll each flipped by 180 degrees. The view snaps upside down. It
   * only happens after looking all the way up or down, which is why it
   * was intermittent and why it looked like it was caused by the sideways
   * movement that merely revealed it.
   *
   * Stopping a few degrees short keeps the euler away from the
   * singularity entirely. You still get full 360 turning and can still
   * look as near to straight up as anyone needs — you simply cannot park
   * on the one orientation where the maths has no unique answer.
   */
  return (
    <PointerLockControls
      ref={controls}
      minPolarAngle={PITCH_MARGIN}
      maxPolarAngle={Math.PI - PITCH_MARGIN}
    />
  )
}

export function Scene() {
  return (
    <Canvas
      shadows
      camera={{ fov: 75, position: [0, 0.5, 29] }}
      gl={{ antialias: true }}
      onCreated={({ scene, gl }) => {
        // A lost WebGL context is the other way this screen goes black
        // with no error and no explanation. Browsers fire an event for
        // it, and will restore the context if we ask them to — but only
        // if we prevent the default, which is to give up permanently.
        const canvas = gl.domElement
        canvas.addEventListener('webglcontextlost', (e) => {
          e.preventDefault()
          console.warn('[dread] WebGL context lost — requesting restore')
          window.dispatchEvent(new CustomEvent('dread:gl-lost'))
        })
        canvas.addEventListener('webglcontextrestored', () => {
          console.warn('[dread] WebGL context restored')
          window.dispatchEvent(new CustomEvent('dread:gl-restored'))
        })
        // Exponential fog, tinted to the room's own sickly yellow rather
        // than pure black. Linear black fog gave a hard "wall of
        // darkness" cutoff; a warm haze that matches the walls reads as
        // depth — corridors fading out rather than ending.
        scene.fog = new THREE.FogExp2('#0d0b06', 0.055)
      }}
    >
      <color attach="background" args={['#0d0b06']} />
      {/* Enough ambient to read the space — the fluorescents are the real
          light source now, so the room is lit-but-wrong rather than a
          black void navigated by torch. */}
      <ambientLight intensity={0.11} color="#b8a878" />
      <Physics gravity={[0, -20, 0]}>
        <House />
        <Entities />
        <Player />
      </Physics>
      <Flashlight />
      <AutoPointerLock />
      <DevBridge />
      <EffectComposer>
        <Noise opacity={0.06} />
        <Vignette darkness={0.9} offset={0.3} />
        <ChromaticAberration offset={[0.0006, 0.0006]} />
      </EffectComposer>
    </Canvas>
  )
}
