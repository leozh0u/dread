/**
 * The surfaces of the room have to agree with each other.
 *
 * This exact class of bug — geometry authored as though the floor were at
 * y=0 when its top face is at -0.9 — shipped in the walls, every hiding
 * prop, the exit door and the collectible fragments simultaneously, and
 * was the first thing reported after the first real playthrough. It's
 * invisible in code review because each file looks internally consistent;
 * it's glaringly obvious the moment anyone walks around in it.
 */
import {
  FLOOR_Y,
  FLOOR_THICK,
  FLOOR_TOP,
  CEILING_BOTTOM,
  WALL_SPAN,
  WALL_MID_Y,
  WALL_H,
  DOOR_OPENING_H,
  PLAYER_HALF_H,
  EYE_OFFSET,
} from '../src/game/geometry'

let failures = 0
const check = (label: string, ok: boolean) => {
  console.log(`${ok ? '  ok  ' : '  FAIL'}  ${label}`)
  if (!ok) failures++
}
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9

console.log('\n--- floor, walls and ceiling line up ---')
check('floor top is the top face of the floor slab', near(FLOOR_TOP, FLOOR_Y + FLOOR_THICK / 2))

const wallBottom = WALL_MID_Y - WALL_SPAN / 2
const wallTop = WALL_MID_Y + WALL_SPAN / 2
console.log(`  floor top ${FLOOR_TOP}   wall spans ${wallBottom.toFixed(2)} .. ${wallTop.toFixed(2)}`)

check('NO GAP beneath the walls', near(wallBottom, FLOOR_TOP))
check('walls reach the ceiling', near(wallTop, CEILING_BOTTOM))
check('the floor is below the ceiling', FLOOR_TOP < CEILING_BOTTOM)
check('the room is tall enough to walk through', WALL_SPAN > 2.4)
check('room height accounts for the floor sitting below zero', WALL_SPAN > WALL_H)

console.log('\n--- a player of normal height fits ---')
const headY = FLOOR_TOP + PLAYER_HALF_H + EYE_OFFSET
console.log(`  player head reaches y=${headY.toFixed(2)}`)
check('head clears the ceiling', headY < CEILING_BOTTOM)
// The level tests path on a 2D grid that knows nothing about height, so a
// doorway too low to walk through would seal a room and every one of them
// would still pass.
check(
  'head clears a framed doorway',
  headY < FLOOR_TOP + DOOR_OPENING_H,
)
check(
  'doorway has real headroom, not a scrape',
  FLOOR_TOP + DOOR_OPENING_H - headY > 0.25,
)

console.log(failures ? `\n${failures} FAILURE(S)\n` : '\nRoom geometry is consistent\n')
process.exit(failures ? 1 : 0)
