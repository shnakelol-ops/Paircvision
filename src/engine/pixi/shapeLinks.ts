/**
 * Shape Links — pure geometry for the Tactical Slate presentation feature.
 *
 * A Shape Link renders a thin elastic tether between players the coach has
 * manually animated as one tactical unit (e.g. a kickout press, a half-back
 * line, a midfield screen). It never influences player movement, football,
 * or timing: it only reads positions that already exist and derives a curve
 * to draw. There is no physics simulation — "elasticity" is a direct
 * function of the live distance between two players versus their phase-0
 * (rest) distance, computed fresh every frame from whatever the coach has
 * animated.
 *
 * Framework-free so it can be unit tested without PixiJS.
 */

export type ShapePoint = { x: number; y: number };

export type TetherSegment = {
  from: ShapePoint;
  to: ShapePoint;
  /** Absolute quadratic Bézier control point (already offset perpendicular to the segment). */
  control: ShapePoint;
  /** live / rest distance ratio, clamped. 1 = resting, >1 = stretched, <1 = compressed. */
  tension: number;
};

/** Tension is clamped to this range so a fast-diverging pair never vanishes or overshoots. */
const MIN_TENSION = 0.5;
const MAX_TENSION = 2.0;
/** Guards distance/direction math against coincident points. */
const MIN_DISTANCE = 0.001;

function distance(a: ShapePoint, b: ShapePoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function clampTension(value: number): number {
  return Math.min(MAX_TENSION, Math.max(MIN_TENSION, value));
}

/**
 * Computes one tether segment between two live points, given their rest
 * (phase-0) distance. Sag and width both derive from the tension ratio: the
 * band pulls taut (less sag) when stretched and relaxes (more sag) when
 * compressed — which is what reads as "elastic" without any spring
 * simulation or stored velocity/state.
 */
export function computeTetherSegment(
  from: ShapePoint,
  to: ShapePoint,
  restDistance: number,
  baseSag: number,
): TetherSegment {
  const liveDistance = distance(from, to);
  const safeRestDistance = Math.max(MIN_DISTANCE, restDistance);
  const tension = clampTension(liveDistance / safeRestDistance);

  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.max(MIN_DISTANCE, Math.hypot(dx, dy));
  const normalX = -dy / length;
  const normalY = dx / length;
  const sag = baseSag / tension;

  return {
    from,
    to,
    control: { x: midX + normalX * sag, y: midY + normalY * sag },
    tension,
  };
}

/** Stroke-width multiplier for a segment: thinner when stretched, thicker when compressed. */
export function tensionToWidthScale(tension: number): number {
  return 1 / Math.sqrt(clampTension(tension));
}

/**
 * Builds one tether segment per consecutive pair in a chain of members (in
 * selection order), given their live positions and phase-0 rest positions.
 * A member without a resolvable rest position contributes no segment on
 * either side of it, rather than throwing — callers pass whatever they can
 * resolve and gaps are simply skipped.
 */
export function computeChainTetherSegments(
  liveMembers: readonly ShapePoint[],
  restMembers: readonly ShapePoint[],
  baseSag: number,
): TetherSegment[] {
  const segments: TetherSegment[] = [];
  for (let index = 0; index < liveMembers.length - 1; index += 1) {
    const from = liveMembers[index];
    const to = liveMembers[index + 1];
    const restFrom = restMembers[index];
    const restTo = restMembers[index + 1];
    if (!from || !to || !restFrom || !restTo) continue;
    segments.push(computeTetherSegment(from, to, distance(restFrom, restTo), baseSag));
  }
  return segments;
}
