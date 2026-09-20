/**
 * Ease-out-quad positional progress for a ball flight — pass or shot alike.
 * Validated (via numerical simulation against the production pass-duration
 * formula) to give the ball immediate departure velocity and a smoothly
 * decaying approach with no late velocity spike, unlike a linear ramp or the
 * bell-shaped ease-in-out previously used for shots (see git history: that
 * ease-in-out, combined with a sinusoidal arc offset, gave shots a visible
 * outward "push" at release before curving toward goal — a legacy
 * TacticalPlay artifact, not a deliberate shot-specific design).
 *
 * This is deliberately the only shaping applied to a flight: progress moves
 * toward a single fixed destination captured once at release. There is no
 * live target blending, no receiver chasing, and no per-frame retargeting
 * here or anywhere else in ball flight — the path is a straight line whose
 * only complexity is *when* the ball is along it, not *where* it goes.
 */
export function computePassPositionProgress(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return 2 * clamped - clamped * clamped;
}

export type BallFlightWorldPoint = { x: number; y: number };

/**
 * The ball's world position at progress `t` of a flight from `fromWorld` to
 * `toWorld`. Used identically for passes and shots: both are a strictly
 * straight XY line (temporal easing only) — a top-down 2D board has no
 * orthographic way to represent a real ball's aerial height, and rendering
 * that height as sideways curvature (the previous shot-only arc) is exactly
 * the visual defect a straight path avoids. `t` is expected to already be a
 * pure elapsed/duration ratio in [0, 1], so this function is frame-rate
 * invariant and playback-speed invariant by construction — speed changes
 * how fast `t` advances, never what position a given `t` maps to.
 */
export function computeBallFlightWorldPosition(params: {
  fromWorld: BallFlightWorldPoint;
  toWorld: BallFlightWorldPoint;
  t: number;
}): BallFlightWorldPoint {
  const { fromWorld, toWorld, t } = params;
  const eased = computePassPositionProgress(t);
  return {
    x: fromWorld.x + (toWorld.x - fromWorld.x) * eased,
    y: fromWorld.y + (toWorld.y - fromWorld.y) * eased,
  };
}
