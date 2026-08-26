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
    if (
      !firstPoint ||
      Math.hypot(firstPoint.x - fromPoint.x, firstPoint.y - fromPoint.y) >= BALL_PATH_MIN_POINT_DISTANCE
    ) {
      path.unshift(fromPoint);
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
