import type { WorldPoint } from "../coordinates/coordinates";

/**
 * World-space offset applied so a carried ball renders beside its carrier
 * rather than dead-centre on the token. Canonical values — every carried-ball
 * position (idle render, pass flight origin, shot flight origin) must go
 * through applyCarrierOffset below so they can never disagree with each other.
 */
export const BALL_CARRIER_OFFSET_X = 3.5;
export const BALL_CARRIER_OFFSET_Y = -2.5;

/** Pure coordinate math: the world position a carried ball is actually rendered at. */
export function applyCarrierOffset(carrierWorldPos: WorldPoint): WorldPoint {
  return {
    x: carrierWorldPos.x + BALL_CARRIER_OFFSET_X,
    y: carrierWorldPos.y + BALL_CARRIER_OFFSET_Y,
  };
}
