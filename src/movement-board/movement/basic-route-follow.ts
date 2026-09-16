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
  /**
   * Non-mutating forward prediction: where this route-follow would be after
   * `gameTimeMs` more of game time, without touching real progress, target,
   * or firing callbacks. Walks the same advanceRouteFollowState core used by
   * the real step(), so prediction can never diverge from actual playback.
   */
  predictPositionAfter: (gameTimeMs: number) => { x: number; y: number };
};

/** Mutable walking state shared by real stepping and non-mutating prediction. */
export type RouteFollowState = {
  x: number;
  y: number;
  index: number;
  traveledDistance: number;
};

const EPSILON = 0.0001;
const EASE_MIN = 0.45;
// Fixed sub-step used only by prediction, matching typical real-tick granularity
// (~60fps) so the ease factor is re-evaluated at roughly the same resolution a
// real playback session would experience.
const PREDICT_SUBSTEP_MS = 1000 / 60;

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

/**
 * Advances a route-follow state by one tick's worth of distance, in place.
 * This is the single source of movement math for both the real mutating
 * session step and the non-mutating predictor below — the two must never
 * diverge into separate formulas. Returns true when the route becomes
 * complete as a result of this advance (the walk reaches its final point).
 */
function advanceRouteFollowState(
  state: RouteFollowState,
  points: ReadonlyArray<{ x: number; y: number }>,
  totalLength: number,
  speed: number,
  deltaMs: number,
): boolean {
  if (!Number.isFinite(deltaMs) || deltaMs <= 0) return false;
  if (state.index >= points.length) return true;

  // Compute ease factor from current progress through the route.
  // Progress is evaluated once at the start of the tick — accurate enough at 60fps.
  const routeProgress = totalLength > 0 ? Math.min(1, state.traveledDistance / totalLength) : 0;
  const ease = easeInOut(routeProgress);
  let remainingDistance = speed * ease * (deltaMs / 1000);

  while (remainingDistance > 0) {
    const nextPoint = points[state.index];
    if (!nextPoint) return true;
    const dx = nextPoint.x - state.x;
    const dy = nextPoint.y - state.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= EPSILON) {
      state.x = nextPoint.x;
      state.y = nextPoint.y;
      state.index += 1;
      if (state.index >= points.length) return true;
      continue;
    }

    if (remainingDistance >= distance) {
      state.x = nextPoint.x;
      state.y = nextPoint.y;
      state.traveledDistance += distance;
      remainingDistance -= distance;
      state.index += 1;
      if (state.index >= points.length) return true;
      continue;
    }

    const segmentProgress = remainingDistance / distance;
    state.x += dx * segmentProgress;
    state.y += dy * segmentProgress;
    state.traveledDistance += remainingDistance;
    remainingDistance = 0;
  }

  return false;
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

    const state: RouteFollowState = { x: target.x, y: target.y, index, traveledDistance };
    const didComplete = advanceRouteFollowState(state, points, totalLength, speed, deltaMs);
    target.x = state.x;
    target.y = state.y;
    index = state.index;
    traveledDistance = state.traveledDistance;

    if (didComplete) {
      complete();
    }
  };

  // Non-mutating: reads current real progress but never writes it back, never
  // touches `target`, and never fires onComplete/onCancel. Stationary or
  // already-finished sessions simply return the current position — case A of
  // the fixed-reception prediction spec (stationary → current position).
  const predictPositionAfter = (gameTimeMs: number): { x: number; y: number } => {
    if (!active || index >= points.length) {
      return { x: target.x, y: target.y };
    }
    if (!Number.isFinite(gameTimeMs) || gameTimeMs <= 0) {
      return { x: target.x, y: target.y };
    }

    const predicted: RouteFollowState = { x: target.x, y: target.y, index, traveledDistance };
    let remaining = gameTimeMs;
    while (remaining > EPSILON) {
      const dt = Math.min(PREDICT_SUBSTEP_MS, remaining);
      const completed = advanceRouteFollowState(predicted, points, totalLength, speed, dt);
      remaining -= dt;
      if (completed) break;
    }
    return { x: predicted.x, y: predicted.y };
  };

  return {
    step,
    cancel,
    isActive: () => active,
    predictPositionAfter,
  };
}
