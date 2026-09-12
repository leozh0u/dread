import { useEffect } from 'react'
import { pointAtArcLength, PATH_TOTAL_LENGTH } from './maze'
import { playCreak, playScratch } from './scareFx'
import { useSession } from './session'

const MIN_DELAY_MS = 14_000
const MAX_DELAY_MS = 34_000

/**
 * Random, positioned horror stingers — a creak, a scratch — completely
 * independent of the Director and the monster's actual location. This is
 * deliberate: the monster is a known, predictable threat once you've
 * learned its patrol; these are not tied to anything, which is what
 * makes them unsettling. Fires somewhere along the maze's own corridors
 * (so it's always a plausible in-world position) at an unpredictable
 * interval, for as long as a run is in progress.
 */
export function useAmbientHorror() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>

    function scheduleNext() {
      const delay = MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS)
      timer = setTimeout(fire, delay)
    }

    function fire() {
      if (useSession.getState().status === 'playing') {
        const s = Math.random() * PATH_TOTAL_LENGTH
        const p = pointAtArcLength(s)
        if (Math.random() < 0.5) playCreak(p.x, 1.5, p.z)
        else playScratch(p.x, 1.2, p.z)
      }
      scheduleNext()
    }

    scheduleNext()
    return () => clearTimeout(timer)
  }, [])
}
