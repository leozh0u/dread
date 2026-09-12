import { useCallback } from 'react'
import { Scene } from './game/Scene'
import { Webcam } from './components/Webcam'
import { Hud } from './components/Hud'
import { useDirectorLoop } from './game/useDirectorLoop'
import type { ScareType } from './game/director'

/** Placeholder scare dispatch — wire to audio/lighting/monster triggers
 * as those land. Logged for now so the Director loop is visible/testable
 * without the full audio pipeline built yet. */
function fireScare(type: ScareType) {
  console.log('[scare]', type)
}

function Game() {
  const onScare = useCallback((type: ScareType) => fireScare(type), [])
  useDirectorLoop(onScare)
  return (
    <>
      <Webcam />
      <Scene />
      <Hud />
    </>
  )
}

export default function App() {
  return <Game />
}
