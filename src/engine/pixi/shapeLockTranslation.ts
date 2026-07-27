/**
 * Shape Lock — pure geometry helpers for the Tactical Slate editing convenience.
 *
 * Shape Lock lets a coach link several players temporarily and drag any member
 * to move the whole group by the same distance, preserving their current
 * spacing. It is editing-only: it never runs during playback and nothing here is
 * ever persisted. The single behaviour is a rigid shared translation.
 *
 * These functions deliberately carry no PixiJS or rendering dependencies so they
 * can be unit tested in isolation.
 */

export type ShapePoint = { x: number; y: number };

/** Normalized pitch bounds shared with normal player dragging (0–100 world). */
export const SHAPE_BOUND_MIN = 0;
export const SHAPE_BOUND_MAX = 100;

/**
 * Computes a single translation delta for the whole shape from the anchor
 * (dragged) member's intended new position, then clamps that shared delta so
 * every member stays within [min, max].
 *
 * Clamping the shared delta — rather than clamping each member independently —
 * is what preserves the shape at the boundary: the entire group stops moving in
 * an axis as soon as its first member reaches an edge, instead of the shape
 * distorting as individual members pile up against the boundary.
 */
export function computeSharedDelta(
  startPositions: ReadonlyMap<string, ShapePoint>,
  anchorStart: ShapePoint,
  intendedAnchor: ShapePoint,
  min: number = SHAPE_BOUND_MIN,
  max: number = SHAPE_BOUND_MAX,
): { dx: number; dy: number } {
  const rawDx = intendedAnchor.x - anchorStart.x;
  const rawDy = intendedAnchor.y - anchorStart.y;

  let lowerDx = -Infinity;
  let upperDx = Infinity;
  let lowerDy = -Infinity;
  let upperDy = Infinity;

  for (const point of startPositions.values()) {
    lowerDx = Math.max(lowerDx, min - point.x);
    upperDx = Math.min(upperDx, max - point.x);
    lowerDy = Math.max(lowerDy, min - point.y);
    upperDy = Math.min(upperDy, max - point.y);
  }

  // No members → nothing to clamp against.
  if (!Number.isFinite(lowerDx) || !Number.isFinite(upperDx)) {
    return { dx: rawDx, dy: rawDy };
  }

  return {
    dx: Math.min(upperDx, Math.max(lowerDx, rawDx)),
    dy: Math.min(upperDy, Math.max(lowerDy, rawDy)),
  };
}

/** Applies a shared delta to every start position, returning the new positions. */
export function translateShape(
  startPositions: ReadonlyMap<string, ShapePoint>,
  delta: { dx: number; dy: number },
): Map<string, ShapePoint> {
  const result = new Map<string, ShapePoint>();
  for (const [id, point] of startPositions) {
    result.set(id, { x: point.x + delta.dx, y: point.y + delta.dy });
  }
  return result;
}

/**
 * Orders member points into a stable, non-crossing loop for the guide outline by
 * sorting around the centroid by angle.
 *
 * This "ordered chain" strategy (rather than a convex hull) is deterministic,
 * invariant under translation, and — crucially — includes every member,
 * interior players too. That matters for irregular Gaelic shapes such as a 3-1-3
 * press, where the middle player must still read as part of the unit; a convex
 * hull would omit it.
 */
export function orderMembersForGuide(points: readonly ShapePoint[]): ShapePoint[] {
  if (points.length <= 2) return [...points];
  const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length;
  const cy = points.reduce((sum, p) => sum + p.y, 0) / points.length;
  return [...points].sort(
    (a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx),
  );
}
