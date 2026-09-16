import type { WorldPoint } from "../coordinates/coordinates";

/**
 * World-space offset applied so a carried ball renders beside its carrier
 * rather than dead-centre on the token. Canonical values — every carried-ball
 * position (idle render, pass flight origin, shot flight origin) must go
 * through applyCarrierOffset below so they can never disagree with each other.
 *
 * Presentation-only alignment with Standard Slate's production attachment
 * offset (createTacticalPadLiteSurface.ts: ATTACHED_BALL_OFFSETS_WORLD[0] =
 * {4.0, -3.2}, its default/primary candidate). Game Timing intentionally
 * keeps its single fixed offset and rigid (non-edge-aware, non-lag-follow)
 * attachment model — only the offset distance/direction is aligned here.
 */
export const BALL_CARRIER_OFFSET_X = 4.0;
export const BALL_CARRIER_OFFSET_Y = -3.2;

/** Pure coordinate math: the world position a carried ball is actually rendered at. */
export function applyCarrierOffset(carrierWorldPos: WorldPoint): WorldPoint {
  return {
    x: carrierWorldPos.x + BALL_CARRIER_OFFSET_X,
    y: carrierWorldPos.y + BALL_CARRIER_OFFSET_Y,
  };
}
