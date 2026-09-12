import { useCallback, useEffect } from 'react'
import { Scene } from './game/Scene'
import { Webcam } from './components/Webcam'
import { Hud } from './components/Hud'
import { ScreenFlash } from './components/ScreenFlash'
import { FearCurve } from './components/FearCurve'
import { useDirectorLoop } from './game/useDirectorLoop'
import { useDirector, type ScareType } from './game/director'
import { useSession } from './game/session'
import { playScare, startAmbient } from './game/scareFx'

function Game() {
  const setMonsterDistance = useDirector((s) => s.setMonsterDistance)
  const sessionStatus = useSession((s) => s.status)

  const onScare = useCallback(
    (type: ScareType) => playScare(type, setMonsterDistance),
    [setMonsterDistance],
  )
  useDirectorLoop(onScare)

  // Ambient drone starts on first user gesture (browsers block autoplay
  // AudioContext until then) — the calibration screen's "click to begin"
  // step doubles as that gesture.
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
  return <Game />
}
