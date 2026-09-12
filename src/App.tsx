import { useCallback, useEffect, useState } from 'react'
import { Scene } from './game/Scene'
import { Webcam } from './components/Webcam'
import { Hud } from './components/Hud'
import { ScreenFlash } from './components/ScreenFlash'
import { FearCurve } from './components/FearCurve'
import { StartGate } from './components/StartGate'
import { useDirectorLoop } from './game/useDirectorLoop'
import { useDirector, type ScareType } from './game/director'
import { useSession } from './game/session'
import { playScare, startAmbient, unlockAudio } from './game/scareFx'

function Game() {
  const setMonsterDistance = useDirector((s) => s.setMonsterDistance)
  const sessionStatus = useSession((s) => s.status)

  const onScare = useCallback(
    (type: ScareType) => playScare(type, setMonsterDistance),
    [setMonsterDistance],
  )
  useDirectorLoop(onScare)

  useEffect(() => {
    if (sessionStatus === 'playing') startAmbient()
  }, [sessionStatus])

  return (
    <>
      <Webcam />
      <Scene />
      <Hud />
      <ScreenFlash />
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
