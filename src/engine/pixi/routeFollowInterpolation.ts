import { NORMALIZED_MAX, NORMALIZED_MIN, type NormalizedPoint } from "../shared/normalization";

/**
 * Minimum distance (in normalized 0-100 units) between two points for them to
 * be treated as distinct along a recorded route path.
 */
export const BALL_PATH_MIN_POINT_DISTANCE = 0.35;

function clampNormalizedValue(value: number): number {
  if (!Number.isFinite(value)) return NORMALIZED_MIN;
  return Math.max(NORMALIZED_MIN, Math.min(NORMALIZED_MAX, value));
}

/**
 * Shared Phase-engine interpolation: walks an optional stored freehand
 * `path` proportionally by arc length, or falls back to a straight lerp
 * when no path is present. Originally the football's own interpolation;
 * kept generic (`{ x, y, path? }`) so any Phase-tracked object — not just
 * the football — can reuse it.
 */
export function interpolatePath(
  from: { x: number; y: number; path?: NormalizedPoint[] } | null,
  to: { x: number; y: number; path?: NormalizedPoint[] },
  progress: number,
): NormalizedPoint {
  const fallbackStart = from ?? to;
  const fallbackPoint = {
    x: fallbackStart.x + (to.x - fallbackStart.x) * progress,
    y: fallbackStart.y + (to.y - fallbackStart.y) * progress,
  };
  const storedPath = to.path ?? [];
  if (storedPath.length < 2) {
    return fallbackPoint;
  }

  let path = storedPath.map((point) => ({
    x: clampNormalizedValue(point.x),
    y: clampNormalizedValue(point.y),
  }));

  if (from) {
    const fromPoint = {
      x: clampNormalizedValue(from.x),
      y: clampNormalizedValue(from.y),
    };
    // Trim stale prefix points so each playback segment begins from the current segment origin.
    const firstAlignedIndex = path.findIndex(
      (point) => Math.hypot(point.x - fromPoint.x, point.y - fromPoint.y) < BALL_PATH_MIN_POINT_DISTANCE,
    );
    if (firstAlignedIndex > 0) {
      path = path.slice(firstAlignedIndex);
    }
    const firstPoint = path[0];
    if (!firstPoint) {
      path.unshift(fromPoint);
    } else {
      // Always pin the walk's origin to the true segment start, even when
      // the nearest sample is already within BALL_PATH_MIN_POINT_DISTANCE —
      // "close enough" is not exact, and a dense sampled path (many points
      // per drawn segment) will often have a sample land just under that
      // threshold without ever being exactly on the start. Leaving it
      // unreplaced in that case produced a small but real backward offset at
      // progress=0 (a visible "hop" back before the route proceeds forward).
      // Replacing it unconditionally costs nothing when it was already
      // exact, and removes that gap when it wasn't.
      path[0] = fromPoint;
    }
  }

  let totalDistance = 0;
  for (let index = 1; index < path.length; index += 1) {
    const previous = path[index - 1];
    const current = path[index];
    if (!previous || !current) continue;
    totalDistance += Math.hypot(current.x - previous.x, current.y - previous.y);
  }
  if (totalDistance <= 0) {
    return fallbackPoint;
  }

  const targetDistance = totalDistance * progress;
  let traveledDistance = 0;
  for (let index = 1; index < path.length; index += 1) {
    const previous = path[index - 1];
    const current = path[index];
    if (!previous || !current) continue;
    const segmentDistance = Math.hypot(current.x - previous.x, current.y - previous.y);
    if (segmentDistance <= 0) continue;
    if (traveledDistance + segmentDistance >= targetDistance) {
      const segmentProgress = (targetDistance - traveledDistance) / segmentDistance;
      return {
        x: previous.x + (current.x - previous.x) * segmentProgress,
        y: previous.y + (current.y - previous.y) * segmentProgress,
      };
    }
    traveledDistance += segmentDistance;
  }
  return {
    x: clampNormalizedValue(to.x),
    y: clampNormalizedValue(to.y),
  };
}

/**
 * Smoothstep ease (t²(3−2t)) applied to phase-playback progress so movement
 * eases in/out instead of running at constant velocity.
 */
export function getPlaybackEaseProgress(progress: number): number {
  const clamped = Math.max(0, Math.min(1, progress));
  return clamped * clamped * (3 - 2 * clamped);
}

// --- Distance-aware phase-segment timing ---------------------------------
//
// Normal (non-possession-pass) phase transitions previously always took a
// flat PLAY_DURATION_MS regardless of how far anything actually had to
// travel, which made long moves visibly "rocket" across the pitch. The
// functions below compute one shared segment duration from the largest
// movement demand in the segment (any player, or a freely-moving ball),
// preserving the existing "a phase is a synchronized snapshot" semantic —
// there is still exactly one duration/progress value per segment, just
// derived instead of constant.

/**
 * Distance a single tracked entity (a player or the ball) travels between
 * two snapshot positions: the recorded route's arc length when a Draw
 * Route/path exists, otherwise straight-line displacement. Deliberately
 * measures the *stored* path as-is (matching the "use the actual stored
 * route arc length" spec) rather than re-deriving interpolatePath's
 * playback-time first-point correction — the two differ by at most a small
 * touch-selection offset, well within this formula's own tolerance, and
 * this keeps the calculation fully independent of interpolatePath.
 */
export function resolveMovementDistance(
  from: { x: number; y: number } | null,
  to: { x: number; y: number; path?: NormalizedPoint[] },
): number {
  const storedPath = to.path;
  if (storedPath && storedPath.length >= 2) {
    let arcLength = 0;
    for (let index = 1; index < storedPath.length; index += 1) {
      const previous = storedPath[index - 1];
      const current = storedPath[index];
      if (!previous || !current) continue;
      arcLength += Math.hypot(current.x - previous.x, current.y - previous.y);
    }
    if (arcLength > 0) {
      return arcLength;
    }
  }
  const fallbackStart = from ?? to;
  return Math.hypot(to.x - fallbackStart.x, to.y - fallbackStart.y);
}

type MovementEntry = {
  id: string;
  x: number;
  y: number;
  path?: NormalizedPoint[];
};

type FreeBallMovementEntry = MovementEntry & {
  isFree: boolean;
  attachedPlayerId: string | null;
};

export type MovementSnapshot = {
  players: readonly MovementEntry[];
  football: readonly FreeBallMovementEntry[];
};

/**
 * Largest movement demand across every player and any freely-moving ball
 * transitioning from one phase snapshot to the next. A ball being carried
 * by the same player throughout the segment is excluded — its motion is
 * just that player's own hand-follow, already captured by the player's own
 * distance, not a duration-driven animation. A ball that is free at either
 * end, or that switches holders (a possession change captured as an
 * ordinary phase edit rather than the dedicated tap-to-pass gesture), does
 * move independently during the segment and participates in the max.
 */
export function resolveSegmentMaxMovementDistance(
  fromSnapshot: MovementSnapshot,
  toSnapshot: MovementSnapshot,
): number {
  let maxDistance = 0;

  const fromPlayersById = new Map(fromSnapshot.players.map((entry) => [entry.id, entry] as const));
  for (const toPlayer of toSnapshot.players) {
    const fromPlayer = fromPlayersById.get(toPlayer.id);
    if (!fromPlayer) continue;
    const distance = resolveMovementDistance(fromPlayer, toPlayer);
    if (distance > maxDistance) {
      maxDistance = distance;
    }
  }

  const fromBallsById = new Map(fromSnapshot.football.map((entry) => [entry.id, entry] as const));
  for (const toBall of toSnapshot.football) {
    const fromBall = fromBallsById.get(toBall.id);
    if (!fromBall) continue;
    const targetAttachedPlayerId = toBall.isFree ? null : toBall.attachedPlayerId ?? null;
    const sourceAttachedPlayerId = fromBall.isFree ? null : fromBall.attachedPlayerId ?? null;
    const isHolderSwitch =
      sourceAttachedPlayerId != null && targetAttachedPlayerId != null && sourceAttachedPlayerId !== targetAttachedPlayerId;
    const ballMovesIndependently = targetAttachedPlayerId == null || isHolderSwitch;
    if (!ballMovesIndependently) continue;
    const distance = resolveMovementDistance(fromBall, toBall);
    if (distance > maxDistance) {
      maxDistance = distance;
    }
  }

  return maxDistance;
}

// Matches PLAY_DURATION_MS in createTacticalPadLiteSurface.ts — the same 1×
// baseline the flat timing this formula replaces was built on, and the one
// the existing possession-pass formula also scales from.
const PHASE_SEGMENT_BASE_DURATION_MS = 1200;
/**
 * Distance (normalized units) up to which the 1× baseline duration applies
 * unchanged — protects the short/normal range that already felt right.
 */
export const PHASE_SEGMENT_SHORT_DISTANCE_THRESHOLD = 20;
/** ms added per normalized unit of movement beyond the short-distance threshold. */
const PHASE_SEGMENT_DURATION_PER_EXTRA_UNIT_MS = 20;
/** Longest a 1× normal phase segment may take, however far something moves. */
export const PHASE_SEGMENT_MAX_DURATION_MS = 2800;

/**
 * Converts a segment's largest movement demand into a shared duration.
 * Distances at or below the threshold keep the existing flat 1200ms pacing;
 * beyond it, duration grows linearly with the extra distance, capped at a
 * safety ceiling — then, and only then, playback speed is applied. Clamping
 * before dividing by speed (not after) is deliberate: it's what makes
 * slow-motion (e.g. 0.25×) genuinely take longer rather than being capped
 * at the same ceiling as 1×.
 */
export function resolvePhaseSegmentDurationMs(maxDistance: number, speedMultiplier: number): number {
  const safeDistance = Number.isFinite(maxDistance) && maxDistance > 0 ? maxDistance : 0;
  const durationAt1x = Math.min(
    PHASE_SEGMENT_MAX_DURATION_MS,
    safeDistance <= PHASE_SEGMENT_SHORT_DISTANCE_THRESHOLD
      ? PHASE_SEGMENT_BASE_DURATION_MS
      : PHASE_SEGMENT_BASE_DURATION_MS +
          PHASE_SEGMENT_DURATION_PER_EXTRA_UNIT_MS * (safeDistance - PHASE_SEGMENT_SHORT_DISTANCE_THRESHOLD),
  );
  return durationAt1x / Math.max(0.01, speedMultiplier);
}
