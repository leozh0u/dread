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
        intensity={520}
        angle={0.4}
        penumbra={0.6}
        distance={14}
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
  return <PointerLockControls ref={controls} />
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
      <EffectComposer>
        <Noise opacity={0.06} />
        <Vignette darkness={0.9} offset={0.3} />
        <ChromaticAberration offset={[0.0006, 0.0006]} />
      </EffectComposer>
    </Canvas>
  )
}
