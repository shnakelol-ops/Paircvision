import type { NormalizedPoint } from "../shared/normalization";
import type { WorldScale } from "./slatePlayerContinuity";

/**
 * Player-to-player pass flight for Tactical Slate playback.
 *
 * A recorded holder switch (ball carried by A at one phase, by B at the
 * next) is played as a real pass: the ball leaves A from where it is drawn
 * being carried at the start of the phase, travels in a straight line at a
 * constant world-space speed, and is received by B wherever B is when the
 * ball reaches their carry distance — B may still be running. The meeting
 * point is solved once, at compile time, against B's compiled movement; the
 * flight is then locked (no homing). After reception the ball is carried by
 * B (direction-aware carry takes over).
 */

/**
 * Pass speed in world units per second (the world is 160×100). About nine
 * Vision V3 token diameters per second in Normal mode — the measured
 * TacticalPad range was 8–10. A tuning value, not a product constant.
 */
export const SLATE_PASS_SPEED_WORLD_PER_S = 60;

export type WorldPoint = { x: number; y: number };

export type SlatePassFlight = {
  ballId: string;
  passerId: string;
  receiverId: string;
  launchMs: number;
  arrivalMs: number;
  /** Launch and arrival points (normalized). */
  start: NormalizedPoint;
  end: NormalizedPoint;
};

export function toWorldPoint(point: NormalizedPoint, scale: WorldScale): WorldPoint {
  return { x: point.x * scale.x, y: point.y * scale.y };
}

export function toNormalizedPoint(point: WorldPoint, scale: WorldScale): NormalizedPoint {
  return { x: point.x / scale.x, y: point.y / scale.y };
}

/** Ball position during a flight: straight line, constant speed, from launch to arrival. */
export function resolvePassFlightPoint(flight: SlatePassFlight, timeMs: number): NormalizedPoint {
  const span = flight.arrivalMs - flight.launchMs;
  if (span <= 0) return { x: flight.end.x, y: flight.end.y };
  const t = Math.max(0, Math.min(1, (timeMs - flight.launchMs) / span));
  return {
    x: flight.start.x + (flight.end.x - flight.start.x) * t,
    y: flight.start.y + (flight.end.y - flight.start.y) * t,
  };
}

/**
 * Shortest phase (1× ms) in which a pass is guaranteed to reach the receiver
 * by the end of the phase, whatever the receiver does in between: the ball
 * leaves at most `releaseOffsetWorld` from the passer's start and is caught
 * `carryDistanceWorld` short of the receiver's end position.
 */
export function resolvePassPhaseMinimumMs(params: {
  passerStartWorld: WorldPoint;
  receiverEndWorld: WorldPoint;
  releaseOffsetWorld: number;
  carryDistanceWorld: number;
  speedWorldPerS?: number;
}): number {
  const speedPerMs = (params.speedWorldPerS ?? SLATE_PASS_SPEED_WORLD_PER_S) / 1000;
  const reach =
    Math.hypot(params.receiverEndWorld.x - params.passerStartWorld.x, params.receiverEndWorld.y - params.passerStartWorld.y) +
    params.releaseOffsetWorld -
    params.carryDistanceWorld;
  return Math.max(0, reach) / speedPerMs;
}

/**
 * Earliest moment the ball, launched from `startWorld` at constant speed,
 * is `carryDistanceWorld` from the receiver: the first root in [0, maxMs] of
 *
 *   f(τ) = |receiver(τ) − start| − carryDistance − speed·τ
 *
 * where receiver(τ) is the receiver's compiled position τ ms after launch.
 * Found by a fixed scan for the first sign change, then bisection, so it is
 * deterministic. If the ball starts within carry distance it is received at
 * once. Returns the flight time, the arrival point and where the receiver is
 * at that moment (all world space).
 */
export function solvePassInterception(params: {
  startWorld: WorldPoint;
  receiverWorldAt: (msSinceLaunch: number) => WorldPoint;
  carryDistanceWorld: number;
  maxMs: number;
  speedWorldPerS?: number;
}): { flightMs: number; arrivalWorld: WorldPoint; receiverWorld: WorldPoint } {
  const { startWorld, receiverWorldAt, carryDistanceWorld } = params;
  const speedPerMs = (params.speedWorldPerS ?? SLATE_PASS_SPEED_WORLD_PER_S) / 1000;
  const maxMs = Math.max(0, params.maxMs);
  const gap = (ms: number) => {
    const receiver = receiverWorldAt(ms);
    return Math.hypot(receiver.x - startWorld.x, receiver.y - startWorld.y) - carryDistanceWorld - speedPerMs * ms;
  };
  const arrive = (ms: number) => {
    const receiver = receiverWorldAt(ms);
    const dx = receiver.x - startWorld.x;
    const dy = receiver.y - startWorld.y;
    const length = Math.hypot(dx, dy);
    const travelled = Math.max(0, Math.min(length, speedPerMs * ms));
    const arrivalWorld =
      length > 1e-9 ? { x: startWorld.x + (dx / length) * travelled, y: startWorld.y + (dy / length) * travelled } : startWorld;
    return { flightMs: ms, arrivalWorld, receiverWorld: receiver };
  };

  if (gap(0) <= 0) return arrive(0);
  const step = Math.max(1, Math.min(4, maxMs / 500));
  let low = 0;
  let high = -1;
  for (let ms = step; ms < maxMs + step; ms += step) {
    const at = Math.min(ms, maxMs);
    if (gap(at) <= 0) {
      high = at;
      break;
    }
    low = at;
    if (at >= maxMs) break;
  }
  if (high < 0) return arrive(maxMs);
  for (let iteration = 0; iteration < 50; iteration += 1) {
    const mid = (low + high) / 2;
    if (gap(mid) <= 0) high = mid;
    else low = mid;
  }
  return arrive(high);
}

/** Flight time (1× ms) for `distanceWorld` at the pass speed. */
export function resolvePassFlightDurationMs(distanceWorld: number, speedWorldPerS: number = SLATE_PASS_SPEED_WORLD_PER_S): number {
  return (Math.max(0, distanceWorld) / speedWorldPerS) * 1000;
}

/**
 * A pass to a receiver who stands still for the whole flight (tap-to-pass):
 * a straight line from `start` toward the receiver, received at the carry
 * distance short of their centre, at constant pass speed — the same flight
 * a recorded pass makes to a stationary receiver, without the moving-receiver
 * solve. A start already within the carry distance is received at once.
 */
export function buildStationaryReceiverPassFlight(params: {
  ballId: string;
  passerId: string;
  receiverId: string;
  launchMs: number;
  start: NormalizedPoint;
  receiver: NormalizedPoint;
  carryDistanceWorld: number;
  scale: WorldScale;
  speedWorldPerS?: number;
}): SlatePassFlight {
  const startWorld = toWorldPoint(params.start, params.scale);
  const receiverWorld = toWorldPoint(params.receiver, params.scale);
  const dx = receiverWorld.x - startWorld.x;
  const dy = receiverWorld.y - startWorld.y;
  const length = Math.hypot(dx, dy);
  const flown = Math.max(0, length - params.carryDistanceWorld);
  const end =
    length > 1e-9
      ? toNormalizedPoint({ x: startWorld.x + (dx / length) * flown, y: startWorld.y + (dy / length) * flown }, params.scale)
      : { x: params.start.x, y: params.start.y };
  return {
    ballId: params.ballId,
    passerId: params.passerId,
    receiverId: params.receiverId,
    launchMs: params.launchMs,
    arrivalMs: params.launchMs + resolvePassFlightDurationMs(flown, params.speedWorldPerS),
    start: { x: params.start.x, y: params.start.y },
    end,
  };
}
