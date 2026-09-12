import { useEffect } from 'react'
import { usePlayerPosition } from './playerPosition'
import { useThreat, CLUES_REQUIRED } from './threat'
import { useCalmRoom } from './calmRoom'
import { useSession } from './session'
import { CLUES, HIDING_SPOTS, CALM_ROOM, OUTSIDE, distance3, insideBox } from './triggers'

const TICK_MS = 100

/**
 * One tick of trigger evaluation, pulled out of the React effect so it can
 * be driven directly by a test. scripts/fullrun.ts walks a player along a
 * real path through the maze and calls this, which is the closest thing
 * to a playthrough that doesn't need a GPU — and it exercises this exact
 * code rather than a reimplementation of it that could drift.
 */
export function tickTriggers() {
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

  // Win condition #1: walk out the unlocked door. Distinct from the
  // calm room's slower "regulate yourself" win (useCalmRoomLoop.ts).
  // Gated on the session actually having started for the same reason
  // useThreatLoop gates death on it — an outcome set before startedAt
  // exists sends the player to a broken "not enough data" end screen.
  if (
    useSession.getState().status === 'playing' &&
    useThreat.getState().outcome === 'playing' &&
    collected.size >= CLUES_REQUIRED &&
    insideBox(p, OUTSIDE)
  ) {
    useThreat.getState().setOutcome('escaped_door')
    useSession.getState().setStatus('ended')
  }
}

/** Distance/bounding-box based replacement for Rapier sensor colliders —
 * see the note in playerPosition.ts for why. Runs at 10Hz, cheap: a
 * handful of distance checks against a plain array, nothing physics-y. */
export function useTriggersLoop() {
  useEffect(() => {
    const interval = setInterval(tickTriggers, TICK_MS)
    return () => clearInterval(interval)
  }, [])
}
