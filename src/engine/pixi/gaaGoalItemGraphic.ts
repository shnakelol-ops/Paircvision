import type { Graphics } from "pixi.js";

/**
 * GAA Goal training item: a compact goal drawn in the same flat equipment style
 * as the Mini Goal (white posts, slate outline, light mesh), plus the GAA
 * uprights rising above the crossbar. Drawn around (0, 0) in the item's own
 * space, sized from the host's item half-size so the Tactical Slate and the
 * movement board share one drawing.
 *
 * The goal is drawn at GAA_GOAL_SIZE_FACTOR × the host's item half-size so it
 * reads clearly on a phone. This is a rendering size, not a stored value: saved
 * items are untouched and any per-item scale still multiplies on top.
 *
 * Proportions (h = item half-size × GAA_GOAL_SIZE_FACTOR): 2.5h wide; uprights
 * from −1.3h to the ground line at +1.1h; crossbar at −0.2h; the net fills the
 * mouth below the crossbar, with an inset back frame and corner lines giving it
 * depth.
 */
export const GAA_GOAL_SIZE_FACTOR = 2;
export const GAA_GOAL_WIDTH_FACTOR = 2.5;
export const GAA_GOAL_TOP_FACTOR = -1.3;
export const GAA_GOAL_CROSSBAR_FACTOR = -0.2;
export const GAA_GOAL_BOTTOM_FACTOR = 1.1;

const POST_FILL = 0xf8fafc;
const POST_OUTLINE = 0x64748b;
const NET_FRAME = 0x94a3b8;
const NET_MESH = 0xcbd5e1;
const SHADOW = 0x020617;

/**
 * Touch and selection radius for a GAA Goal, in the item's own space: clears
 * the upright tips (≈1.8h from centre) with a little margin.
 */
export function gaaGoalOuterRadius(itemHalfSize: number): number {
  return itemHalfSize * GAA_GOAL_SIZE_FACTOR * 1.95;
}

export function drawGaaGoalItem(graphic: Graphics, itemHalfSize: number): void {
  const halfSize = itemHalfSize * GAA_GOAL_SIZE_FACTOR;
  const width = halfSize * GAA_GOAL_WIDTH_FACTOR;
  const top = halfSize * GAA_GOAL_TOP_FACTOR;
  const crossbarY = halfSize * GAA_GOAL_CROSSBAR_FACTOR;
  const bottom = halfSize * GAA_GOAL_BOTTOM_FACTOR;
  const post = halfSize * 0.12;
  const outline = halfSize * 0.055;
  const mesh = halfSize * 0.045;
  const left = -width / 2;
  const right = width / 2;

  graphic.ellipse(0, bottom + halfSize * 0.2, width * 0.42, halfSize * 0.22).fill({ color: SHADOW, alpha: 0.14 });

  // Net: a faint panel across the mouth, an inset back frame for depth, and
  // corner lines tying the frame back to the posts and crossbar.
  const netTop = crossbarY + post;
  const inset = halfSize * 0.32;
  const backLeft = left + post + inset;
  const backRight = right - post - inset;
  const backTop = netTop + inset * 0.7;
  const backBottom = bottom - inset * 0.35;
  graphic.rect(left + post, netTop, width - post * 2, bottom - netTop).fill({ color: POST_FILL, alpha: 0.08 });
  graphic
    .rect(backLeft, backTop, backRight - backLeft, backBottom - backTop)
    .stroke({ color: NET_FRAME, width: outline, alpha: 0.9 });
  graphic
    .moveTo(left + post, netTop)
    .lineTo(backLeft, backTop)
    .moveTo(right - post, netTop)
    .lineTo(backRight, backTop)
    .moveTo(left + post, bottom)
    .lineTo(backLeft, backBottom)
    .moveTo(right - post, bottom)
    .lineTo(backRight, backBottom)
    .stroke({ color: NET_FRAME, width: mesh, alpha: 0.8 });
  for (let i = 1; i <= 3; i += 1) {
    const x = backLeft + ((backRight - backLeft) * i) / 4;
    graphic.moveTo(x, backTop).lineTo(x, backBottom).stroke({ color: NET_MESH, width: mesh, alpha: 0.75 });
  }
  for (let i = 1; i <= 2; i += 1) {
    const y = backTop + ((backBottom - backTop) * i) / 3;
    graphic.moveTo(backLeft, y).lineTo(backRight, y).stroke({ color: NET_MESH, width: mesh, alpha: 0.7 });
  }

  // Frame on top of the net: two full-height uprights and the crossbar.
  graphic
    .roundRect(left, top, post, bottom - top, post * 0.3)
    .fill(POST_FILL)
    .stroke({ color: POST_OUTLINE, width: outline });
  graphic
    .roundRect(right - post, top, post, bottom - top, post * 0.3)
    .fill(POST_FILL)
    .stroke({ color: POST_OUTLINE, width: outline });
  graphic
    .roundRect(left, crossbarY, width, post, post * 0.3)
    .fill(POST_FILL)
    .stroke({ color: POST_OUTLINE, width: outline });
}
