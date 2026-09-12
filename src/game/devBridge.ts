import * as THREE from 'three'
import { navStepToward, navDistance, updateNavField } from './nav'
import { usePlayerPosition } from './playerPosition'
import { useThreat } from './threat'
import { useSession } from './session'
import { useDirector } from './director'
import { CLUES, OUTSIDE } from './triggers'
import { entityReports } from './entities/registry'

/**
 * A handle on the running game, for automated playthroughs. DEV ONLY —
 * `import.meta.env.DEV` is statically false in a production build, so
 * Rollup drops this entire module from the bundle.
 *
 * WHY THIS EXISTS. "Nobody has played a full run end to end" was the
 * oldest open item on the pre-submission list, and it stayed open for a
 * simple reason: a run is sixty seconds of calibration followed by
 * finding three fragments scattered through eighty units of maze and then
 * locating the door. Verifying an ending by hand costs minutes per
 * attempt, so it does not get done — and the endings are precisely the
 * part of the game least likely to have been exercised.
 *
 * The dev keys (C/K/J) already skip the slow parts. What was missing was
 * a way to actually traverse the maze without a human at the keyboard.
 * This exposes just enough to steer: the camera, the navigation field the
 * creatures themselves use, and the stores that say where things are and
 * whether the run has ended.
 *
 * It deliberately exposes primitives rather than a canned "win the game"
 * button. A scripted autopilot that drives the real controls, walks the
 * real maze and trips the real triggers is evidence the game works; one
 * that sets outcome='escaped_door' directly is evidence of nothing.
 */
export interface DevBridge {
  camera: THREE.Camera | null
  navStepToward: typeof navStepToward
  navDistance: typeof navDistance
  updateNavField: typeof updateNavField
  position: () => { x: number; y: number; z: number }
  clues: typeof CLUES
  outside: typeof OUTSIDE
  entities: typeof entityReports
  state: () => {
    outcome: string
    session: string
    phase: string
    clues: number
    doorOpen: boolean
    detection: number
    hidden: boolean
    monsterDistance: number
    monsterVisible: boolean
  }
}

export function installDevBridge(camera: THREE.Camera) {
  if (!import.meta.env.DEV) return
  const bridge: DevBridge = {
    camera,
    navStepToward,
    navDistance,
    updateNavField,
    position: () => {
      const p = usePlayerPosition.getState()
      return { x: p.x, y: p.y, z: p.z }
    },
    clues: CLUES,
    outside: OUTSIDE,
    entities: entityReports,
    state: () => {
      const threat = useThreat.getState()
      const dir = useDirector.getState()
      return {
        outcome: threat.outcome,
        session: useSession.getState().status,
        phase: dir.phase,
        clues: threat.cluesCollected.size,
        doorOpen: threat.cluesCollected.size >= CLUES.length,
        // The four numbers that decide whether you live. Without these
        // an automated run can only report "died", which is exactly as
        // useful as a player saying the game killed them.
        detection: threat.detection,
        hidden: threat.isHidden,
        monsterDistance: dir.monsterDistance,
        monsterVisible: dir.monsterVisible,
      }
    },
  }
  ;(window as unknown as { __dread?: DevBridge }).__dread = bridge
}
