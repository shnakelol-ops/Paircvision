import type { WorldPoint } from "../coordinates/coordinates";

// A genuine single-frame token displacement at 60fps tops out well under 1
// world unit even at the fastest route-follow speed in the game. A delta
// larger than this cannot be real movement between consecutive samples —
// it means the "previous" sample is stale (this token hasn't been sampled
// in a while), so treat it as "no direction available" rather than report
// a spurious direction computed from an old, unrelated position.
const STALE_JUMP_THRESHOLD_WORLD = 10;

// Smaller than any genuine per-frame movement, larger than floating-point
// noise — distinguishes "actually stationary this frame" from "moving."
const MOVEMENT_EPSILON = 0.0001;

/**
 * Pure frame-to-frame direction: given a token's current world position and
 * its position one sample ago (or null if this is the first time it's been
 * sampled), returns a unit vector pointing the way it's moving, or null if
 * the token is stationary (or the previous sample is missing/stale).
 */
export function computeMovementDirection(current: WorldPoint, previous: WorldPoint | null): WorldPoint | null {
  if (!previous) return null;
  const dx = current.x - previous.x;
  const dy = current.y - previous.y;
  const magnitude = Math.hypot(dx, dy);
  if (magnitude < MOVEMENT_EPSILON || magnitude > STALE_JUMP_THRESHOLD_WORLD) return null;
  return { x: dx / magnitude, y: dy / magnitude };
}

/**
 * A small, token-scale point ahead of a receiver in their current direction
 * of travel — not a predicted/intercept position, just where the ball
 * should visually terminate so a moving receiver runs onto it rather than
 * being struck from behind. Falls back to the token's own centre exactly
 * (no invented direction) whenever `direction` is null — the stationary-
 * receiver case, and the existing behaviour this must not change.
 */
export function computeReceivePoint(centre: WorldPoint, direction: WorldPoint | null, offset: number): WorldPoint {
  if (!direction) return { x: centre.x, y: centre.y };
  return { x: centre.x + direction.x * offset, y: centre.y + direction.y * offset };
}
