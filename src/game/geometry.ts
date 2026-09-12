/**
 * Where the room's surfaces actually are.
 *
 * These were implicit, and they disagreed. The floor slab sits at y=-1
 * with thickness 0.2, so its top face is -0.9 — but walls, hiding props,
 * the exit door and the fragments were all authored as though the floor
 * were at y=0. Every one of them hung 0.9 units in the air, which is
 * immediately obvious in play and was the first thing Leo reported after
 * the first real playthrough.
 *
 * Kept in a plain module with no React or Three imports so that anything
 * can depend on it — components, and the test that asserts they line up.
 */
export const FLOOR_Y = -1
export const FLOOR_THICK = 0.2
export const SLAB_THICK = 0.2

/** Visible room height, and where the ceiling slab is centred. */
export const WALL_H = 3.2

/** The surface things stand on. */
export const FLOOR_TOP = FLOOR_Y + FLOOR_THICK / 2

/** The underside of the ceiling. */
export const CEILING_BOTTOM = WALL_H

/** Full floor-to-ceiling height, and the centre of that span. Anything
 * meant to close an opening — walls, the door — uses both, so it cannot
 * drift from the floor again. */
export const WALL_SPAN = CEILING_BOTTOM - FLOOR_TOP
export const WALL_MID_Y = (FLOOR_TOP + CEILING_BOTTOM) / 2
