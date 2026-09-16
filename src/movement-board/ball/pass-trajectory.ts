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
