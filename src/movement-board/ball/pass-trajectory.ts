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

/**
 * Positional progress (how far along the fromWorld->effectiveTarget
 * interpolation the ball is) for player-to-player PASS flight only — an
 * ease-out curve (fastest at release, decelerating into arrival), not the
 * ease-in-out curve shot flight still uses.
 *
 * Investigation finding: the prior ease-in-out curve (slow-fast-slow) made
 * the ball appear to hesitate at the passer's foot, then visibly trail the
 * moving receiver for the first ~30% of the flight regardless of target-
 * blend choice (eased(0.28)≈0.157 — the ball had covered under a sixth of
 * its journey at over a quarter of the elapsed time). A real struck pass
 * leaves at or near peak velocity and decelerates, not the other way
 * round. This curve fixes that read without touching target-blend,
 * duration, or the arc: passProgress(0)=0, passProgress(1)=1 exactly, so
 * the live-receiver arrival guarantee at t=1 is unaffected.
 */
export function computePassPositionProgress(t: number): number {
  return 2 * t - t * t;
}
