import { clampNormalizedPoint, type NormalizedPoint } from "../coordinates/normalization";

const DEFAULT_MIN_DISTANCE = 0.1;
const DEFAULT_SAMPLES_PER_SEGMENT = 16;
const CATMULL_TENSION = 1;
const MIN_CORNER_TENSION_SCALE = 0.28;

function clonePoint(point: NormalizedPoint): NormalizedPoint {
  return { x: point.x, y: point.y };
}

function dedupeByDistance(
  points: readonly NormalizedPoint[],
  minDistance: number,
): NormalizedPoint[] {
  const deduped: NormalizedPoint[] = [];
  for (const point of points) {
    const next = clampNormalizedPoint(point);
    const previous = deduped[deduped.length - 1];
    if (!previous) {
      deduped.push(next);
      continue;
    }
    if (Math.hypot(previous.x - next.x, previous.y - next.y) < minDistance) {
      continue;
    }
    deduped.push(next);
  }
  return deduped;
}

function cubicBezierPoint(
  p0: NormalizedPoint,
  c1: NormalizedPoint,
  c2: NormalizedPoint,
  p3: NormalizedPoint,
  t: number,
): NormalizedPoint {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  const uuu = uu * u;
  const ttt = tt * t;
  return {
    x: uuu * p0.x + 3 * uu * t * c1.x + 3 * u * tt * c2.x + ttt * p3.x,
    y: uuu * p0.y + 3 * uu * t * c1.y + 3 * u * tt * c2.y + ttt * p3.y,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function cornerTensionScale(
  previous: NormalizedPoint,
  current: NormalizedPoint,
  next: NormalizedPoint,
): number {
  const inX = current.x - previous.x;
  const inY = current.y - previous.y;
  const outX = next.x - current.x;
  const outY = next.y - current.y;
  const inLength = Math.hypot(inX, inY);
  const outLength = Math.hypot(outX, outY);
  if (inLength <= 0.0001 || outLength <= 0.0001) {
    return MIN_CORNER_TENSION_SCALE;
  }
  const dot = clamp((inX * outX + inY * outY) / (inLength * outLength), -1, 1);
  const turnSharpness = (1 - dot) * 0.5;
  return Math.max(MIN_CORNER_TENSION_SCALE, 1 - turnSharpness * 0.9);
}

export function normalizeRoutePoints(
  points: readonly NormalizedPoint[],
  minDistance = DEFAULT_MIN_DISTANCE,
): NormalizedPoint[] {
  return dedupeByDistance(points, Math.max(0, minDistance));
}

export function sampleRoutePoints(points: readonly NormalizedPoint[]): NormalizedPoint[] {
  const normalized = normalizeRoutePoints(points);
  if (normalized.length <= 2) return normalized.map((point) => clonePoint(point));

  const sampled: NormalizedPoint[] = [];
  for (let index = 0; index < normalized.length - 1; index += 1) {
    const p0 = normalized[Math.max(0, index - 1)]!;
    const p1 = normalized[index]!;
    const p2 = normalized[index + 1]!;
    const p3 = normalized[Math.min(normalized.length - 1, index + 2)]!;
    const tensionAtP1 = cornerTensionScale(p0, p1, p2);
    const tensionAtP2 = cornerTensionScale(p1, p2, p3);

    const c1: NormalizedPoint = {
      x: p1.x + ((p2.x - p0.x) / 6) * CATMULL_TENSION * tensionAtP1,
      y: p1.y + ((p2.y - p0.y) / 6) * CATMULL_TENSION * tensionAtP1,
    };
    const c2: NormalizedPoint = {
      x: p2.x - ((p3.x - p1.x) / 6) * CATMULL_TENSION * tensionAtP2,
      y: p2.y - ((p3.y - p1.y) / 6) * CATMULL_TENSION * tensionAtP2,
    };

    const sampleStart = index === 0 ? 0 : 1;
    for (let sample = sampleStart; sample <= DEFAULT_SAMPLES_PER_SEGMENT; sample += 1) {
      const t = sample / DEFAULT_SAMPLES_PER_SEGMENT;
      sampled.push(clampNormalizedPoint(cubicBezierPoint(p1, c1, c2, p2, t)));
    }
  }

  return normalizeRoutePoints(sampled);
}

