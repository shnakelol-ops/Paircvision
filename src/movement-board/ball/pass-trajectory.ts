/**
 * Ease-out-quad positional progress for a player-to-player pass flight only.
 * Validated (via numerical simulation against the production pass-duration
 * formula) to give the ball immediate departure velocity and a smoothly
 * decaying approach with no late velocity spike, unlike a linear ramp or the
 * bell-shaped ease-in-out used for player route-following.
 *
 * This is deliberately the only shaping applied to a pass's flight: progress
 * moves toward a single fixed destination captured once at release. There is
 * no live target blending, no receiver chasing, and no per-frame retargeting
 * here or anywhere else in the pass flight — the path is a straight line
 * whose only complexity is *when* the ball is along it, not *where* it goes.
 */
export function computePassPositionProgress(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return 2 * clamped - clamped * clamped;
}

/** Shot flight keeps its own original, untouched ease-in-out-quad progression. */
export function computeShotPositionProgress(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return clamped < 0.5 ? 2 * clamped * clamped : -1 + (4 - 2 * clamped) * clamped;
}

export type BallFlightWorldPoint = { x: number; y: number };

/**
 * The ball's world position at progress `t` of a flight from `fromWorld` to
 * `toWorld`. Passes travel a strictly straight XY line (temporal easing
 * only) — a top-down 2D board has no orthographic way to represent a real
 * ball's aerial height, and rendering that height as sideways curvature is
 * exactly the visual defect a straight path avoids. Shots keep their
 * original arc, unchanged, via `shotArcHeightPx`.
 */
export function computeBallFlightWorldPosition(params: {
  fromWorld: BallFlightWorldPoint;
  toWorld: BallFlightWorldPoint;
  t: number;
  isShot: boolean;
  shotArcHeightPx: number;
}): BallFlightWorldPoint {
  const { fromWorld, toWorld, t, isShot, shotArcHeightPx } = params;
  const eased = isShot ? computeShotPositionProgress(t) : computePassPositionProgress(t);
  const arcY = isShot ? -Math.sin(Math.PI * t) * shotArcHeightPx : 0;
  return {
    x: fromWorld.x + (toWorld.x - fromWorld.x) * eased,
    y: fromWorld.y + (toWorld.y - fromWorld.y) * eased + arcY,
  };
}
