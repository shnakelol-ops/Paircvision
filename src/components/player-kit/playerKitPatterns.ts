import type { VisionV3KitPattern } from "../../engine/pixi/createVisionV3PlayerToken";

/**
 * Canonical shared pattern type. Re-exported (not redeclared) from the
 * actual Vision V3 renderer so there is exactly one source of truth for
 * which pattern identifiers exist — see createVisionV3PlayerToken.ts for
 * where each one is actually drawn.
 */
export type PlayerKitPattern = VisionV3KitPattern;

/**
 * All six patterns Vision V3 can render, in the renderer's own declared
 * order. Do not reorder or rename — these strings are the renderer's real
 * parameter values, not display labels.
 *
 * Declared `as const satisfies` (not `: readonly PlayerKitPattern[]`) so its
 * element type stays the precise 6-member literal union instead of widening
 * to the general PlayerKitPattern alias — that precision is what lets
 * <PlayerKitEditor allowedPatterns={FULL_VISION_PATTERNS}> infer its
 * generic exactly, so Game Timing's callbacks are typed to the real 6-value
 * union with no cast anywhere in the chain.
 */
export const FULL_VISION_PATTERNS = [
  "plain",
  "hoops",
  "stripes",
  "slash",
  "chestDash",
  "gradient",
] as const satisfies readonly PlayerKitPattern[];

/**
 * Standard Slate's currently-exposed subset (PR2A). A literal prefix of
 * FULL_VISION_PATTERNS — Slate does not yet offer chestDash/gradient in its
 * UI; that is a deliberate, separate follow-up, not an oversight here.
 * Same `as const satisfies` precision as above, so Slate's own callback
 * wiring type-checks against its existing 4-value `TacticalKitPattern`
 * without a cast (the two are the same literal union, just declared via
 * different aliases).
 */
export const SLATE_V1_PATTERNS = [
  "plain",
  "hoops",
  "stripes",
  "slash",
] as const satisfies readonly PlayerKitPattern[];

export const PLAYER_KIT_PATTERN_LABEL: Record<PlayerKitPattern, string> = {
  plain: "Plain",
  hoops: "Hoops",
  stripes: "Stripes",
  slash: "Slash",
  chestDash: "Chest Dash",
  gradient: "Gradient",
};
