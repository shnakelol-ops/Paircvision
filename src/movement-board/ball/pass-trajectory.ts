import type { WorldPoint } from "../coordinates/coordinates";

/**
 * Blends a player-to-player pass's flight target between the receiver's
 * world position at the moment the pass was released (targetAtStart) and
 * their live, possibly-moving position (liveTarget).
 *
 * Lerping straight at a continuously-moving liveTarget every frame (the
 * prior behaviour) makes the ball's path sweep out a scaled copy of the
 * receiver's own run: as the receiver moves, the "far end" of the
 * from→target line rotates while the eased flight progress grows along it,
 * so a receiver changing direction mid-flight produced a dramatic,
 * player-run-shaped bow instead of a direct pass. Weighting liveTarget's
 * influence by t² keeps the ball tracking close to the originally-aimed
 * line for most of the flight, only correcting onto the receiver's true
 * position in the closing portion of it.
 *
 * At t>=1 this returns liveTarget exactly (no lerp round-trip), which is
 * the deliberate guarantee that a completed pass always lands on the
 * receiver's true live position — possession transfer and chained
 * pass/shot events depend on this being exact, not approximate.
 */
export function computePassEffectiveTarget(targetAtStart: WorldPoint, liveTarget: WorldPoint, t: number): WorldPoint {
  if (t >= 1) {
    return { x: liveTarget.x, y: liveTarget.y };
  }
  const liveWeight = t * t;
  return {
    x: targetAtStart.x + (liveTarget.x - targetAtStart.x) * liveWeight,
    y: targetAtStart.y + (liveTarget.y - targetAtStart.y) * liveWeight,
  };
}
