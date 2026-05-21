export type RoutePoint = { x: number; y: number };

type RouteFollowTarget = { x: number; y: number };

type BasicRouteFollowOptions = {
  target: RouteFollowTarget;
  route: RoutePoint[];
  speed: number;
  onComplete?: () => void;
  onCancel?: () => void;
};

export type BasicRouteFollowSession = {
  step: (deltaMs: number) => void;
  cancel: () => void;
  isActive: () => boolean;
};

const EPSILON = 0.0001;

export function createBasicRouteFollowSession(options: BasicRouteFollowOptions): BasicRouteFollowSession {
  const { target, route, onComplete, onCancel } = options;
  const speed = Number.isFinite(options.speed) ? Math.max(0, options.speed) : 0;
  const filteredPoints = route
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    .map((point) => ({ x: point.x, y: point.y }));
  const pathPoints: RoutePoint[] = [{ x: target.x, y: target.y }];
  for (const point of filteredPoints) {
    const previous = pathPoints[pathPoints.length - 1];
    if (!previous) continue;
    if (Math.hypot(previous.x - point.x, previous.y - point.y) <= EPSILON) continue;
    pathPoints.push(point);
  }

  const segmentLengths: number[] = [];
  let totalLength = 0;
  for (let index = 0; index < pathPoints.length - 1; index += 1) {
    const start = pathPoints[index];
    const end = pathPoints[index + 1];
    if (!start || !end) continue;
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    segmentLengths.push(length);
    totalLength += length;
  }

  let active = pathPoints.length > 1 && totalLength > EPSILON && speed > 0;
  let linearDistance = 0;
  let hasCanceled = false;

  const getEasedProgress = (progress: number): number => {
    const clamped = Math.max(0, Math.min(1, progress));
    return clamped * clamped * (3 - 2 * clamped);
  };

  const getPointAtDistance = (distance: number): RoutePoint => {
    const clampedDistance = Math.max(0, Math.min(totalLength, distance));
    let traversed = 0;
    for (let index = 0; index < segmentLengths.length; index += 1) {
      const segmentLength = segmentLengths[index] ?? 0;
      const start = pathPoints[index];
      const end = pathPoints[index + 1];
      if (!start || !end) continue;
      if (segmentLength <= EPSILON) {
        traversed += segmentLength;
        continue;
      }
      const segmentEndDistance = traversed + segmentLength;
      if (clampedDistance > segmentEndDistance && index < segmentLengths.length - 1) {
        traversed = segmentEndDistance;
        continue;
      }
      const segmentProgress = Math.max(0, Math.min(1, (clampedDistance - traversed) / segmentLength));
      return {
        x: start.x + (end.x - start.x) * segmentProgress,
        y: start.y + (end.y - start.y) * segmentProgress,
      };
    }
    const lastPoint = pathPoints[pathPoints.length - 1];
    return lastPoint ? { x: lastPoint.x, y: lastPoint.y } : { x: target.x, y: target.y };
  };

  const complete = (): void => {
    if (!active) return;
    active = false;
    const finalPoint = pathPoints[pathPoints.length - 1];
    if (finalPoint) {
      target.x = finalPoint.x;
      target.y = finalPoint.y;
    }
    onComplete?.();
  };

  const cancel = (): void => {
    if (!active) return;
    active = false;
    hasCanceled = true;
    onCancel?.();
  };

  const step = (deltaMs: number): void => {
    if (!active) return;
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) return;
    linearDistance = Math.min(totalLength, linearDistance + speed * (deltaMs / 1000));
    const linearProgress = totalLength <= EPSILON ? 1 : linearDistance / totalLength;
    const easedDistance = totalLength * getEasedProgress(linearProgress);
    const nextPoint = getPointAtDistance(easedDistance);
    target.x = nextPoint.x;
    target.y = nextPoint.y;
    if (linearDistance >= totalLength - EPSILON) {
      complete();
    }
  };

  if (!active && !hasCanceled && pathPoints.length > 1) {
    onComplete?.();
  }

  return {
    step,
    cancel,
    isActive: () => active,
  };
}
