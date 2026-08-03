/**
 * Shape Links — pure geometry for the Tactical Slate presentation feature.
 *
 * A Shape Link renders a thin elastic tether connecting players the coach
 * has manually animated as one tactical unit (e.g. a kickout press, a
 * half-back line, a midfield screen). It never influences player movement,
 * football, or timing: it only reads positions that already exist and
 * derives a curve to draw. There is no physics simulation — "elasticity" is
 * a direct function of live distance versus phase-0 (rest) distance,
 * computed fresh every frame from whatever the coach has animated.
 *
 * A Shape Link is one connected unit, not a set of independent pair links:
 * every member-to-member segment shares a single tension value computed
 * across the whole chain (computeUnitTension), so a stretch anywhere in the
 * group reads as the whole band flexing together rather than one isolated
 * segment moving on its own. Only each segment's local direction (and so its
 * curve orientation) is per-segment — the "how stretched" reading is shared.
 *
 * Topology is exactly two shapes, chosen by how the coach tapped players —
 * never a separate mode setting: an open chain (the default) connects every
 * consecutive pair in tap order; a closed loop additionally connects the
 * last member back to the first, when the coach re-taps the first member
 * they started with. No mesh, no polygon fill, no auto-generated pairs.
 *
 * Framework-free so it can be unit tested without PixiJS.
 */

export type ShapePoint = { x: number; y: number };

export type TetherSegment = {
  from: ShapePoint;
  to: ShapePoint;
  /** Absolute quadratic Bézier control point (already offset perpendicular to the segment). */
  control: ShapePoint;
  /** The whole chain's shared tension (see computeUnitTension), not a per-segment value. */
  tension: number;
};

/** Tension is clamped to this range so a fast-diverging unit never vanishes or overshoots. */
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
 * Index pairs to connect for a chain of `count` members: every consecutive
 * pair, plus — only when `closed` and there are at least 3 members — one
 * extra pair closing the last member back to the first. That is the entire
 * topology vocabulary: no diagonals, no mesh, no auto-generated pairs beyond
 * this single closing edge. A 2-member "loop" is meaningless (closing it
 * would just re-draw the one edge that already exists), so closing is a
 * no-op below 3 members.
 */
function pairsForChain(count: number, closed: boolean): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];
  for (let index = 0; index < count - 1; index += 1) {
    pairs.push([index, index + 1]);
  }
  if (closed && count >= 3) {
    pairs.push([count - 1, 0]);
  }
  return pairs;
}

/**
 * One tension value for an entire chain: total live path length versus total
 * rest (phase-0) path length, summed across every resolvable pair (including
 * the closing pair, when `closed`). This is what makes the tether read as
 * one unit — a stretch in one part of the group and a compression in
 * another can net out, but the result is a single number every segment
 * renders with, not a per-pair reading. Falls back to 1 (resting) when no
 * rest pair is resolvable at all, so a missing rest position never inflates
 * or erases the visible tension.
 */
export function computeUnitTension(
  liveMembers: readonly ShapePoint[],
  restMembers: readonly ShapePoint[],
  closed = false,
): number {
  let liveLength = 0;
  let restLength = 0;
  for (const [i, j] of pairsForChain(liveMembers.length, closed)) {
    const liveFrom = liveMembers[i];
    const liveTo = liveMembers[j];
    const restFrom = restMembers[i];
    const restTo = restMembers[j];
    if (!liveFrom || !liveTo || !restFrom || !restTo) continue;
    liveLength += distance(liveFrom, liveTo);
    restLength += distance(restFrom, restTo);
  }
  if (restLength <= MIN_DISTANCE) return 1;
  return clampTension(liveLength / restLength);
}

/**
 * Builds one tether segment between two live points at a given (already
 * clamped) tension. Sag derives from tension: the band pulls taut (less
 * sag) when stretched and relaxes (more sag) when compressed — which is
 * what reads as "elastic" without any spring simulation or stored state.
 */
function buildTetherSegment(from: ShapePoint, to: ShapePoint, tension: number, baseSag: number): TetherSegment {
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

/** Computes a single two-member tether segment from an explicit rest distance. */
export function computeTetherSegment(
  from: ShapePoint,
  to: ShapePoint,
  restDistance: number,
  baseSag: number,
): TetherSegment {
  const liveDistance = distance(from, to);
  const safeRestDistance = Math.max(MIN_DISTANCE, restDistance);
  return buildTetherSegment(from, to, clampTension(liveDistance / safeRestDistance), baseSag);
}

/** Stroke-width multiplier for the whole chain: thinner when stretched, thicker when compressed. */
export function tensionToWidthScale(tension: number): number {
  return 1 / Math.sqrt(clampTension(tension));
}

/**
 * Builds one tether segment per pair in a chain of members (in selection
 * order): every consecutive pair, plus one closing pair (last back to
 * first) when `closed` is true and there are at least 3 members — nothing
 * else. This is the coach's own drawing order deciding the topology: an
 * open chain if they tapped "Done", a closed loop if they tapped the first
 * member again first. There is no mesh, polygon, or auto-generated pair
 * beyond that single closing edge.
 *
 * Every segment shares the same computeUnitTension() reading, so the whole
 * shape visually flexes as one connected structure rather than a series of
 * independently-stretching pair links. A segment is only omitted when one of
 * its own live points is unresolved — a missing rest position affects the
 * shared tension reading, not whether the segment is drawn.
 */
export function computeChainTetherSegments(
  liveMembers: readonly ShapePoint[],
  restMembers: readonly ShapePoint[],
  baseSag: number,
  closed = false,
): TetherSegment[] {
  const unitTension = computeUnitTension(liveMembers, restMembers, closed);
  const segments: TetherSegment[] = [];
  for (const [i, j] of pairsForChain(liveMembers.length, closed)) {
    const from = liveMembers[i];
    const to = liveMembers[j];
    if (!from || !to) continue;
    segments.push(buildTetherSegment(from, to, unitTension, baseSag));
  }
  return segments;
}
