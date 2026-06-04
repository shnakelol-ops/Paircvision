import type { NormalizedPoint } from "../coordinates/normalization";

type RouteFollowTarget = { x: number; y: number };

type BasicRouteFollowOptions = {
  target: RouteFollowTarget;
  route: NormalizedPoint[];
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
const EASE_MIN = 0.45;

// Bell-shaped ease: 0.45 at start/end, 1.0 at midpoint.
// Formula: MIN + (1 - MIN) * 4t(1-t), where 4t(1-t) peaks at 1.0 when t=0.5.
function easeInOut(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return EASE_MIN + (1 - EASE_MIN) * 4 * clamped * (1 - clamped);
}

function computeTotalLength(pts: ReadonlyArray<{ x: number; y: number }>): number {
  let total = 0;
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}

export function createBasicRouteFollowSession(options: BasicRouteFollowOptions): BasicRouteFollowSession {
  const { target, route, onComplete, onCancel } = options;
  const speed = Number.isFinite(options.speed) ? Math.max(0, options.speed) : 0;
  const points = route
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    .map((point) => ({ x: point.x, y: point.y }));

  const totalLength = computeTotalLength(points);
  let traveledDistance = 0;
  let active = points.length > 0 && speed > 0;
  let index = 0;

  const complete = (): void => {
    if (!active) return;
    active = false;
    onComplete?.();
  };

  const cancel = (): void => {
    if (!active) return;
    active = false;
    onCancel?.();
  };

  const step = (deltaMs: number): void => {
    if (!active) return;
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) return;
    if (index >= points.length) {
      complete();
      return;
    }

    // Compute ease factor from current progress through the route.
    // Progress is evaluated once at the start of the tick — accurate enough at 60fps.
    const routeProgress = totalLength > 0 ? Math.min(1, traveledDistance / totalLength) : 0;
    const ease = easeInOut(routeProgress);
    let remainingDistance = speed * ease * (deltaMs / 1000);

    while (remainingDistance > 0 && active) {
      const nextPoint = points[index];
      if (!nextPoint) {
        complete();
        return;
      }
      const dx = nextPoint.x - target.x;
      const dy = nextPoint.y - target.y;
      const distance = Math.hypot(dx, dy);
      if (distance <= EPSILON) {
        target.x = nextPoint.x;
        target.y = nextPoint.y;
        index += 1;
        if (index >= points.length) {
          complete();
          return;
        }
        continue;
      }

      if (remainingDistance >= distance) {
        target.x = nextPoint.x;
        target.y = nextPoint.y;
        traveledDistance += distance;
        remainingDistance -= distance;
        index += 1;
        if (index >= points.length) {
          complete();
          return;
        }
        continue;
      }

      const segmentProgress = remainingDistance / distance;
      target.x += dx * segmentProgress;
      target.y += dy * segmentProgress;
      traveledDistance += remainingDistance;
      remainingDistance = 0;
    }
  };

  return {
    step,
    cancel,
    isActive: () => active,
  };
}

