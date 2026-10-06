import type { NormalizedPoint } from "../shared/normalization";
import type { WorldScale } from "./slatePlayerContinuity";

/**
 * Direction-aware carried-ball presentation for Tactical Slate playback.
 *
 * During playback a carried ball sits at the carry radius ahead of its holder
 * in the holder's direction of movement, and turns smoothly when that
 * direction changes. A stationary holder keeps the last direction.
 *
 * The carry angle is deterministic in timeline time. The holder's direction
 * of movement only changes at known moments — the start of each segment walk
 * and each corner of a freehand route — so a carry track is a list of
 * (time, target direction) events. Between events the angle follows a
 * critically damped approach to the latest target, which has a closed form:
 * the angle and angular velocity at each event are computed once, at
 * compile time, and any timeline position is then evaluated exactly. No
 * per-frame state, so frame rate, pause/resume, playback speed and recording
 * all see the same ball.
 *
 * All angles are in world space (the 160×100 world, where normalized x is
 * stretched 1.6×), so "ahead" means ahead on screen.
 *
 * This is presentation only: snapshots and persisted boards keep the
 * canonical fixed carry offset (SLATE_CARRY_OFFSETS_WORLD).
 */

/**
 * The canonical carried-ball offsets (world units), in preference order: the
 * first that stays on the pitch is used. This is what snapshots store and
 * what a holder with no movement history shows.
 */
export const SLATE_CARRY_OFFSETS_WORLD: ReadonlyArray<Readonly<{ x: number; y: number }>> = [
  { x: 4.0, y: -3.2 },
  { x: 4.0, y: 3.2 },
  { x: -4.0, y: -3.2 },
  { x: -4.0, y: 3.2 },
  { x: 4.7, y: 0 },
  { x: -4.7, y: 0 },
];

/** Distance (world units) from the holder's centre to a presented carried ball. */
export const SLATE_CARRY_RADIUS_WORLD = Math.hypot(SLATE_CARRY_OFFSETS_WORLD[0]!.x, SLATE_CARRY_OFFSETS_WORLD[0]!.y);

/**
 * Time constant (1× ms) of the carried ball's turn toward a new direction of
 * movement. Critically damped: a 90° turn is ~90% complete after ~4τ and a
 * full 180° reversal settles in roughly 400ms.
 */
export const CARRY_TURN_TIME_CONSTANT_MS = 85;

/** A route piece shorter than this (world units) does not change the carry direction. */
export const CARRY_MIN_DIRECTION_PIECE_WORLD = 0.05;

export type CarryWorld = {
  scale: WorldScale;
  /** World size in world units (Slate: 160×100). */
  size: { width: number; height: number };
  radiusWorld: number;
  offsetsWorld: ReadonlyArray<Readonly<{ x: number; y: number }>>;
};

export const SLATE_CARRY_WORLD: CarryWorld = {
  scale: { x: 1.6, y: 1 },
  size: { width: 160, height: 100 },
  radiusWorld: SLATE_CARRY_RADIUS_WORLD,
  offsetsWorld: SLATE_CARRY_OFFSETS_WORLD,
};

function clampNormalized(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

/** The presented carried-ball point for a holder at `holder` (normalized), at `angle` (world radians). */
export function resolvePresentedCarryPoint(
  holder: NormalizedPoint,
  angle: number,
  world: CarryWorld = SLATE_CARRY_WORLD,
): NormalizedPoint {
  return {
    x: clampNormalized(holder.x + (Math.cos(angle) * world.radiusWorld) / world.scale.x),
    y: clampNormalized(holder.y + (Math.sin(angle) * world.radiusWorld) / world.scale.y),
  };
}

/** World angle of the canonical (snapshot) carry offset for a holder at `holder`. */
export function resolveDefaultCarryAngle(holder: NormalizedPoint, world: CarryWorld = SLATE_CARRY_WORLD): number {
  const holderWorld = { x: holder.x * world.scale.x, y: holder.y * world.scale.y };
  for (const offset of world.offsetsWorld) {
    const x = holderWorld.x + offset.x;
    const y = holderWorld.y + offset.y;
    if (x >= 0 && x <= world.size.width && y >= 0 && y <= world.size.height) {
      return Math.atan2(offset.y, offset.x);
    }
  }
  const fallback = world.offsetsWorld[0] ?? { x: 4, y: -3.2 };
  return Math.atan2(fallback.y, fallback.x);
}

/** World angle from a holder to a ball (both normalized). */
export function resolveCarryAngleTo(holder: NormalizedPoint, ball: NormalizedPoint, world: CarryWorld = SLATE_CARRY_WORLD): number {
  return Math.atan2((ball.y - holder.y) * world.scale.y, (ball.x - holder.x) * world.scale.x);
}

export type CarryDirectionEvent = { timeMs: number; angle: number };

type CarryTrackState = { timeMs: number; theta: number; omega: number; target: number };

export type CarryAngleTrack = {
  initialAngle: number;
  /** State right after each event (target already switched), in time order. */
  states: readonly CarryTrackState[];
};

/** Evolves a critically damped angle toward `target` for `dtMs`. */
function evolve(theta: number, omega: number, target: number, dtMs: number): { theta: number; omega: number } {
  if (dtMs <= 0) return { theta, omega };
  const tau = CARRY_TURN_TIME_CONSTANT_MS;
  const x0 = theta - target;
  const b = omega + x0 / tau;
  const decay = Math.exp(-dtMs / tau);
  return { theta: target + (x0 + b * dtMs) * decay, omega: (omega - (b * dtMs) / tau) * decay };
}

/** `target` shifted by whole turns to lie within half a turn of `theta` (shortest way round). */
function nearestEquivalentAngle(target: number, theta: number): number {
  const turn = 2 * Math.PI;
  return target + turn * Math.round((theta - target) / turn);
}

/**
 * A carry track starting at `startMs` with the ball at `initialAngle` and no
 * angular velocity, turning toward each event's direction in turn.
 */
export function buildCarryAngleTrack(
  startMs: number,
  initialAngle: number,
  events: readonly CarryDirectionEvent[],
): CarryAngleTrack {
  const states: CarryTrackState[] = [];
  let current: CarryTrackState = { timeMs: startMs, theta: initialAngle, omega: 0, target: initialAngle };
  for (const event of [...events].sort((a, b) => a.timeMs - b.timeMs)) {
    const timeMs = Math.max(event.timeMs, current.timeMs);
    const evolved = evolve(current.theta, current.omega, current.target, timeMs - current.timeMs);
    const target = nearestEquivalentAngle(event.angle, evolved.theta);
    current = { timeMs, theta: evolved.theta, omega: evolved.omega, target };
    states.push(current);
  }
  return { initialAngle, states };
}

/** Carry angle (world radians, unwrapped) at `timeMs` on a track. */
export function evaluateCarryAngle(track: CarryAngleTrack, timeMs: number): number {
  const { states } = track;
  if (states.length <= 0 || timeMs < states[0]!.timeMs) return track.initialAngle;
  let low = 0;
  let high = states.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (states[mid]!.timeMs <= timeMs) low = mid;
    else high = mid - 1;
  }
  const state = states[low]!;
  return evolve(state.theta, state.omega, state.target, timeMs - state.timeMs).theta;
}

/**
 * Direction-of-movement events for one segment walk: one per piece of the
 * walked polyline (a straight move is a single piece), at the moment the
 * holder starts walking that piece. `share` maps linear segment progress to
 * the share of the walk completed (the Stage 1 player-continuity curve);
 * the polyline is walked by normalized arc length, exactly as
 * interpolatePath does.
 */
export function collectWalkDirectionEvents(
  polyline: readonly NormalizedPoint[],
  segmentStartMs: number,
  segmentDurationMs: number,
  share: (progress: number) => number,
  world: CarryWorld = SLATE_CARRY_WORLD,
): CarryDirectionEvent[] {
  let normalizedTotal = 0;
  for (let index = 1; index < polyline.length; index += 1) {
    normalizedTotal += Math.hypot(polyline[index]!.x - polyline[index - 1]!.x, polyline[index]!.y - polyline[index - 1]!.y);
  }
  if (normalizedTotal <= 0) return [];
  const events: CarryDirectionEvent[] = [];
  let walked = 0;
  for (let index = 1; index < polyline.length; index += 1) {
    const a = polyline[index - 1]!;
    const b = polyline[index]!;
    const pieceNormalized = Math.hypot(b.x - a.x, b.y - a.y);
    const dx = (b.x - a.x) * world.scale.x;
    const dy = (b.y - a.y) * world.scale.y;
    if (Math.hypot(dx, dy) >= CARRY_MIN_DIRECTION_PIECE_WORLD) {
      const progress = invertShare(share, walked / normalizedTotal);
      events.push({ timeMs: segmentStartMs + progress * segmentDurationMs, angle: Math.atan2(dy, dx) });
    }
    walked += pieceNormalized;
  }
  return events;
}

/** Linear progress at which a monotonic `share` reaches `target` (bisection). */
function invertShare(share: (progress: number) => number, target: number): number {
  if (target <= 0) return 0;
  if (target >= 1) return 1;
  let low = 0;
  let high = 1;
  for (let iteration = 0; iteration < 48; iteration += 1) {
    const mid = (low + high) / 2;
    if (share(mid) < target) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}
