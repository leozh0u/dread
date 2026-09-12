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

  useEffect(() => {
    if (sessionStatus === 'playing') {
      startAmbient()
      startHeartbeatAudio(() => usePulseStore.getState().bpm)
    }
    if (sessionStatus === 'ended') stopHeartbeatAudio()
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
