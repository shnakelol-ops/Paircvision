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
   * or firing callbacks. Drains the same fixed-timestep core (drainFixedSteps)
   * used by the real step(), so prediction can never diverge from actual
   * playback — and, critically, neither one depends on render frame rate.
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

// The one and only step size route advancement is ever numerically
// integrated at, for BOTH real playback and prediction. Render frames never
// drive movement math directly — they only deposit elapsed game time into an
// accumulator (see step() below), and how many whole FIXED_STEP_MS chunks
// that accumulator drains depends solely on total elapsed game time, never
// on how that time happened to be divided into frames. That is what makes
// position(route, state, gameTime) independent of render cadence: two runs
// that have each accumulated the same total game time have always consumed
// exactly floor(totalMs / FIXED_STEP_MS) identical fixed steps, regardless
// of whether that time arrived as one giant frame or a thousand tiny ones.
//
// Chosen to exactly match the render cadence this route math was originally
// tuned against (a stable 60fps device), so stepping at a genuine 60fps
// still consumes one fixed step per frame just as before — preserving
// existing speed, run duration, and easing feel at normal frame rates.
const FIXED_STEP_MS = 1000 / 60;

// A budget that is within this many ms of one full fixed step still counts
// as a complete step. Without this, two cadences that accumulate the exact
// same real-number total game time (e.g. both reaching precisely 900ms) can
// land on opposite sides of a fixed-step boundary purely from IEEE-754
// summation-order noise (54 additions of 1000/60 vs 27 additions of
// 1000/30 do not round identically, even though their mathematical sum is
// identical) — costing or gaining one entire fixed step, which is exactly
// the kind of render-cadence-dependent divergence this file exists to
// eliminate. The epsilon is many orders of magnitude larger than that
// summation noise (~1e-10 to 1e-13 ms for sums of this size) and many
// orders of magnitude smaller than any meaningful frame duration.
const STEP_BOUNDARY_EPSILON_MS = 1e-6;

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
 * Advances a route-follow state by one fixed-size chunk's worth of distance,
 * in place. This is the single source of movement math — the per-chunk
 * Euler step every caller ultimately bottoms out in. Returns true when the
 * route becomes complete as a result of this advance.
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
  // Progress is evaluated once at the start of the chunk — chunks are always
  // FIXED_STEP_MS now, never a variable render-frame size, so this is no
  // longer a render-cadence-dependent approximation.
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

/**
 * Drains up to `budgetMs` of pending game time from `state` in fixed
 * FIXED_STEP_MS increments via advanceRouteFollowState, leaving any
 * remainder under one fixed step unconsumed. This is the single fixed-
 * timestep loop shared by real stepping (mutating the session's real state,
 * fed by an accumulator) and prediction (non-mutating, budget = current
 * pending leftover + requested horizon) — neither has its own separate
 * integration strategy; both bottom out in exactly this function.
 */
function drainFixedSteps(
  state: RouteFollowState,
  points: ReadonlyArray<{ x: number; y: number }>,
  totalLength: number,
  speed: number,
  budgetMs: number,
): { leftoverMs: number; completed: boolean } {
  let leftover = budgetMs;
  while (leftover >= FIXED_STEP_MS - STEP_BOUNDARY_EPSILON_MS) {
    if (state.index >= points.length) return { leftoverMs: leftover, completed: true };
    const completed = advanceRouteFollowState(state, points, totalLength, speed, FIXED_STEP_MS);
    leftover = Math.max(0, leftover - FIXED_STEP_MS);
    if (completed) return { leftoverMs: leftover, completed: true };
  }
  return { leftoverMs: leftover, completed: false };
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
  // Pending real game time deposited by step() but not yet large enough to
  // consume a whole FIXED_STEP_MS chunk. This — not raw per-frame deltaMs —
  // is what step() actually integrates against.
  let accumulatorMs = 0;

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

    accumulatorMs += deltaMs;
    const state: RouteFollowState = { x: target.x, y: target.y, index, traveledDistance };
    const { leftoverMs, completed } = drainFixedSteps(state, points, totalLength, speed, accumulatorMs);
    target.x = state.x;
    target.y = state.y;
    index = state.index;
    traveledDistance = state.traveledDistance;
    accumulatorMs = leftoverMs;

    if (completed) {
      complete();
    }
  };

  // Non-mutating: reads current real progress (and pending accumulator) but
  // never writes any of it back, and never fires onComplete/onCancel.
  // Starting the predicted budget from `accumulatorMs + gameTimeMs` (not
  // just `gameTimeMs`) means a prediction taken mid-accumulator agrees
  // exactly with what real stepping will eventually produce once that same
  // horizon of real time actually elapses — there is no separate predictor
  // approximation left, only the one shared fixed-timestep core.
  const predictPositionAfter = (gameTimeMs: number): { x: number; y: number } => {
    if (!active || index >= points.length) {
      return { x: target.x, y: target.y };
    }
    if (!Number.isFinite(gameTimeMs) || gameTimeMs <= 0) {
      return { x: target.x, y: target.y };
    }

    const predicted: RouteFollowState = { x: target.x, y: target.y, index, traveledDistance };
    drainFixedSteps(predicted, points, totalLength, speed, accumulatorMs + gameTimeMs);
    return { x: predicted.x, y: predicted.y };
  };

  return {
    step,
    cancel,
    isActive: () => active,
    predictPositionAfter,
  };
}
