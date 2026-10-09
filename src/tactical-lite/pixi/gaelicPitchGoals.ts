/**
 * Permanent goals on the Gaelic Pitch surface (theme "gaelicBands"): the
 * approved GAA Goal item artwork, placed by the pitch renderer — never an
 * item, never saved, never interactive.
 *
 * Each goal sits wholly outside its endline: the net's base on the endline,
 * then the crossbar, with the uprights pointing away from the pitch. The size
 * is set so the upright tips stay inside the board frame margin, and lines are
 * drawn heavier than the movable item so posts and net stay visible on a phone.
 *
 * Kept free of any pixi.js import (the artwork module is type-only on pixi) so
 * the placement is directly unit-testable; renderTacticalPitch.ts draws it.
 */
import {
  GAA_GOAL_BOTTOM_FACTOR,
  GAA_GOAL_SIZE_FACTOR,
  GAA_GOAL_TOP_FACTOR,
} from "../../engine/pixi/gaaGoalItemGraphic";
import { CENTRE_Y, LEFT_ENDLINE_X, RIGHT_ENDLINE_X } from "../../tactics/pitch/gaa-goal-markings";

/** Item half-size handed to drawGaaGoalItem (drawn unit h = this × GAA_GOAL_SIZE_FACTOR = 1.9). */
export const GAELIC_PITCH_GOAL_ITEM_HALF_SIZE = 0.95;
/** Post / outline / mesh thickness multiplier for the small permanent goals. */
export const GAELIC_PITCH_GOAL_LINE_WEIGHT = 2.5;
/** The board frame drawn around the pitch face (renderTacticalPitch's chassis pad). */
export const GAELIC_PITCH_FRAME_MARGIN = 2.95;

export type GaelicPitchGoalPlacement = { x: number; y: number; rotation: number };

/**
 * Left and right goal origins in pitch viewbox units. The artwork's uprights
 * point toward local −y; rotating ∓90° turns them outward at each end, and the
 * origin is offset so the artwork's ground line (+1.1h) lands on the endline.
 * The pitch root rotates with the world in portrait, so both ends stay correct.
 */
export function gaelicPitchGoalPlacements(): [GaelicPitchGoalPlacement, GaelicPitchGoalPlacement] {
  const h = GAELIC_PITCH_GOAL_ITEM_HALF_SIZE * GAA_GOAL_SIZE_FACTOR;
  const groundOffset = h * GAA_GOAL_BOTTOM_FACTOR;
  return [
    { x: LEFT_ENDLINE_X - groundOffset, y: CENTRE_Y, rotation: -Math.PI / 2 },
    { x: RIGHT_ENDLINE_X + groundOffset, y: CENTRE_Y, rotation: Math.PI / 2 },
  ];
}

/** How far the upright tips reach beyond the endline (viewbox units). */
export function gaelicPitchGoalOutwardReach(): number {
  const h = GAELIC_PITCH_GOAL_ITEM_HALF_SIZE * GAA_GOAL_SIZE_FACTOR;
  return h * (GAA_GOAL_BOTTOM_FACTOR - GAA_GOAL_TOP_FACTOR);
}
