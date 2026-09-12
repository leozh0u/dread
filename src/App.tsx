import { useCallback, useEffect, useState } from 'react'
import { Scene } from './game/Scene'
import { Webcam } from './components/Webcam'
import { Hud } from './components/Hud'
import { ScreenFlash } from './components/ScreenFlash'
import { FearCurve } from './components/FearCurve'
import { StartGate } from './components/StartGate'
import { useHouseMemory } from './game/useHouseMemory'
import { Recognition } from './components/Recognition'
import { Vitals } from './components/Vitals'
import { Crash } from './components/Crash'
import { MuteButton } from './components/MuteButton'
import { BreathingPacer } from './components/BreathingPacer'
import { useDirectorLoop } from './game/useDirectorLoop'
import { useThreatLoop } from './game/useThreatLoop'
import { useTriggersLoop } from './game/useTriggersLoop'
import { useCalmRoomLoop } from './game/useCalmRoomLoop'
import { useMicSource } from './lib/useMic'
import { useAmbientHorror } from './game/useAmbientHorror'
import { useDevKeys } from './game/devKeys'
import { useDirector, type ScareType } from './game/director'
import { useSession } from './game/session'
import { playScare, startAmbient, startHeartbeatAudio, stopHeartbeatAudio, unlockAudio } from './game/scareFx'
import { usePulseStore } from './lib/usePulse'

/** Shown if the GPU drops the rendering context — otherwise the canvas
 * just goes black and looks identical to a very dark corridor. */
function GlLostBanner() {
  const [lost, setLost] = useState(false)
  useEffect(() => {
    const onLost = () => setLost(true)
    const onRestored = () => setLost(false)
    window.addEventListener('dread:gl-lost', onLost)
    window.addEventListener('dread:gl-restored', onRestored)
    return () => {
      window.removeEventListener('dread:gl-lost', onLost)
      window.removeEventListener('dread:gl-restored', onRestored)
    }
  }, [])
  if (!lost) return null
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        background: 'rgba(0,0,0,0.94)',
        color: '#c33',
        fontFamily: 'monospace',
        zIndex: 200,
      }}
    >
      <div style={{ letterSpacing: 2 }}>GRAPHICS STOPPED</div>
      <div style={{ opacity: 0.6, fontSize: 13, maxWidth: 420, textAlign: 'center', lineHeight: 1.6 }}>
        The browser dropped the 3D context. Trying to recover — if this screen stays, reload.
      </div>
      <button
        onClick={() => window.location.reload()}
        style={{
          background: 'transparent',
          border: '1px solid #c33',
          color: '#c33',
          padding: '10px 28px',
          fontFamily: 'monospace',
          letterSpacing: 2,
          cursor: 'pointer',
        }}
      >
        RELOAD
      </button>
    </div>
  )
}

function Game() {
  const setMonsterDistance = useDirector((s) => s.setMonsterDistance)
  const sessionStatus = useSession((s) => s.status)

  const onScare = useCallback(
    (type: ScareType) => playScare(type, setMonsterDistance),
    [setMonsterDistance],
  )
  useDirectorLoop(onScare)
  useThreatLoop()
  useCalmRoomLoop()
  useTriggersLoop()
  useMicSource()
  useAmbientHorror()
  useDevKeys()
  // Backboard: what the Director learned about this player in previous
  // sessions, and a line to tell them the house recognises them.
  const recognition = useHouseMemory()

  // Ambient (room tone + monster growl/breathing) starts the moment the
  // game does, NOT once calibration finishes — calibration can take the
  // full 60s, or stall entirely on bad lighting/no face, and gating all
  // audio behind 'playing' meant the game went dead silent for that whole
  // window. Heartbeat audio only needs a live bpm reading, which usually
  // arrives well before calibration completes, so it starts as soon as
  // one exists rather than waiting on the full session state.
  useEffect(() => {
    startAmbient()
  }, [])

  // Pointer lock captures the mouse entirely — without releasing it here,
  // clicking "PLAY AGAIN" on the end screen silently does nothing until
  // the player manually hits Escape first, which read as the whole game
  // being broken. Release it the moment a run ends; FearCurve's button
  // re-requests it on click (see PlayAgainButton) since restarting still
  // needs a locked mouse to look around.
  useEffect(() => {
    if (sessionStatus === 'ended' && document.pointerLockElement) {
      document.exitPointerLock()
    }
  }, [sessionStatus])

  useEffect(() => {
    if (sessionStatus === 'ended') {
      stopHeartbeatAudio()
      return
    }
    const unsubscribe = usePulseStore.subscribe((s) => {
      if (s.bpm != null) {
        startHeartbeatAudio(() => usePulseStore.getState().bpm)
        unsubscribe()
      }
    })
    return unsubscribe
  }, [sessionStatus])

  return (
    <>
      <Webcam />
      <Scene />
      <Hud />
      <ScreenFlash />
      <BreathingPacer />
      {sessionStatus === 'ended' && <FearCurve />}
      <MuteButton />
      <Vitals />
      {recognition && <Recognition text={recognition} />}
      <GlLostBanner />
    </>
  )
}

export default function App() {
  const [started, setStarted] = useState(false)

  if (!started) {
    return (
      <StartGate
        onStart={() => {
          unlockAudio() // must happen synchronously in the click, see scareFx.ts
          setStarted(true)
        }}
      />
    )
  }

  return (
    <Crash>
      <Game />
    </Crash>
  )
}
