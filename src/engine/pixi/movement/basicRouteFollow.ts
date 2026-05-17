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
  const points = route
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    .map((point) => ({ x: point.x, y: point.y }));

  let active = points.length > 0 && speed > 0;
  let index = 0;
  let hasCanceled = false;

  const complete = (): void => {
    if (!active) return;
    active = false;
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
    if (index >= points.length) {
      complete();
      return;
    }

    let remainingDistance = speed * (deltaMs / 1000);
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
        remainingDistance -= distance;
        index += 1;
        if (index >= points.length) {
          complete();
          return;
        }
        continue;
      }

      const t = remainingDistance / distance;
      target.x += dx * t;
      target.y += dy * t;
      remainingDistance = 0;
    }
  };

  if (!active && !hasCanceled && points.length > 0) {
    onComplete?.();
  }

  return {
    step,
    cancel,
    isActive: () => active,
  };
}
