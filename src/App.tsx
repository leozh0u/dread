import { useCallback, useEffect, useState } from 'react'
import { Scene } from './game/Scene'
import { Webcam } from './components/Webcam'
import { Hud } from './components/Hud'
import { ScreenFlash } from './components/ScreenFlash'
import { FearCurve } from './components/FearCurve'
import { StartGate } from './components/StartGate'
import { BreathingPacer } from './components/BreathingPacer'
import { useDirectorLoop } from './game/useDirectorLoop'
import { useThreatLoop } from './game/useThreatLoop'
import { useTriggersLoop } from './game/useTriggersLoop'
import { useCalmRoomLoop } from './game/useCalmRoomLoop'
import { useMicSource } from './lib/useMic'
import { useDirector, type ScareType } from './game/director'
import { useSession } from './game/session'
import { playScare, startAmbient, startHeartbeatAudio, stopHeartbeatAudio, unlockAudio } from './game/scareFx'
import { usePulseStore } from './lib/usePulse'

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

  return <Game />
}
