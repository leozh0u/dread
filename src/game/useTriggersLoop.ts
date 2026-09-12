import { useEffect } from 'react'
import { usePlayerPosition } from './playerPosition'
import { useThreat } from './threat'
import { useCalmRoom } from './calmRoom'
import { CLUES, HIDING_SPOTS, CALM_ROOM, distance3, insideBox } from './triggers'

const TICK_MS = 100

/** Distance/bounding-box based replacement for Rapier sensor colliders —
 * see the note in playerPosition.ts for why. Runs at 10Hz, cheap: a
 * handful of distance checks against a plain array, nothing physics-y. */
export function useTriggersLoop() {
  useEffect(() => {
    const interval = setInterval(() => {
      const p = usePlayerPosition.getState()
      const collected = useThreat.getState().cluesCollected

      for (const clue of CLUES) {
        if (collected.has(clue.id)) continue
        if (distance3(p, clue.position) <= clue.radius) {
          useThreat.getState().addClue(clue.id)
        }
      }

      const hidden = HIDING_SPOTS.some((spot) => insideBox(p, spot))
      if (hidden !== useThreat.getState().isHidden) {
        useThreat.getState().setHidden(hidden)
      }

      const inCalm = insideBox(p, CALM_ROOM)
      if (inCalm !== useCalmRoom.getState().inCalmRoom) {
        useCalmRoom.getState().setInCalmRoom(inCalm)
      }
    }, TICK_MS)

    return () => clearInterval(interval)
  }, [])
}
