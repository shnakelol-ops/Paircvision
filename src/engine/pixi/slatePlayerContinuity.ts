import type { NormalizedPoint } from "../shared/normalization";
import { resolveStoredRoutePolyline } from "./routeFollowInterpolation";

/**
 * Player continuity across Tactical Slate phase boundaries.
 *
 * Each player walks each phase segment along exactly the geometry
 * interpolatePath already walks (straight line, or the stored route by arc
 * length); only *how far along it they are* at a given moment changes. That
 * share of the walk is a cubic Hermite curve in segment progress u:
 *
 *   f(u) = h01(u) + α·h10(u) + β·h11(u),   f(0) = 0, f(1) = 1
 *
 * where α and β are the start/end slopes (segment speed relative to the
 * segment's average). With α = β = 0 this is exactly the smoothstep every
 * player used before, so a player who stops at a boundary still eases out
 * and one who starts from rest still eases in. Where a player keeps moving
 * through a boundary, α/β carry a shared non-zero speed across it instead of
 * forcing zero velocity there.
 *
 * Boundary speeds are matched in world units (the 160×100 world, where
 * normalized x is stretched 1.6× relative to y), so a corner from a
 * horizontal run into a vertical one keeps the on-screen speed, not the
 * normalized one. Authored positions are untouched: f(0) = 0 and f(1) = 1 at
 * every segment end.
 */

/**
 * Largest change of direction (degrees, between the end of one segment's
 * walk and the start of the next) that still carries speed through the
 * boundary. A sharper turn — a reversal — stops the player at the boundary
 * (boundary speed 0), so they decelerate, turn and accelerate again.
 */
export const PLAYER_CONTINUITY_REVERSAL_THRESHOLD_DEGREES = 120;

/** A segment walk shorter than this (world units) counts as standing still. */
export const PLAYER_CONTINUITY_MIN_MOVEMENT_WORLD = 0.25;

/**
 * How far (world units) back from a walk's end — or forward from its start —
 * the boundary direction is measured over, so a freehand route's last tiny
 * capture wobble cannot decide whether a boundary is a reversal.
 */
export const PLAYER_CONTINUITY_TANGENT_SPAN_WORLD = 2;

/**
 * Upper bound on α and β. Any (α, β) with α² + β² ≤ 9 keeps the Hermite
 * curve monotonic (no backwards movement, no overshoot of the authored
 * endpoint); 2 per slope keeps us comfortably inside that region.
 */
const MAX_BOUNDARY_SLOPE = 2;

export type WorldScale = { x: number; y: number };

/** Tactical Slate's world is 160×100 over the 0–100 normalized square. */
export const SLATE_WORLD_SCALE: WorldScale = { x: 1.6, y: 1 };

export type PlayerSegmentSlopes = { alpha: number; beta: number };

/** Share of the segment walk completed at linear segment progress u. */
export function resolveContinuityProgress(progress: number, slopes: PlayerSegmentSlopes): number {
  const u = Math.max(0, Math.min(1, progress));
  const u2 = u * u;
  const u3 = u2 * u;
  const h01 = -2 * u3 + 3 * u2;
  const h10 = u3 - 2 * u2 + u;
  const h11 = u3 - u2;
  return h01 + slopes.alpha * h10 + slopes.beta * h11;
}

type SegmentEndpoint = { x: number; y: number; path?: NormalizedPoint[] };

export type PlayerWalkGeometry = {
  /** Arc length in normalized units — what interpolatePath's progress is a share of. */
  normalizedLength: number;
  /** Arc length in world units. */
  worldLength: number;
  /** Unit world-space direction at the start / end of the walk. */
  startDirection: { x: number; y: number };
  endDirection: { x: number; y: number };
  /** World units per normalized unit of arc length, at the start / end. */
  startWorldPerNormalized: number;
  endWorldPerNormalized: number;
};

function toWorld(point: NormalizedPoint, scale: WorldScale): { x: number; y: number } {
  return { x: point.x * scale.x, y: point.y * scale.y };
}

/**
 * Point `distance` world units along a world-space polyline (clamped to its
 * ends).
 */
function pointAlong(world: { x: number; y: number }[], distance: number): { x: number; y: number } {
  let travelled = 0;
  for (let index = 1; index < world.length; index += 1) {
    const a = world[index - 1]!;
    const b = world[index]!;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length <= 0) continue;
    if (travelled + length >= distance) {
      const t = (distance - travelled) / length;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    travelled += length;
  }
  return world[world.length - 1]!;
}

function unit(vector: { x: number; y: number }): { x: number; y: number } | null {
  const length = Math.hypot(vector.x, vector.y);
  return length > 1e-9 ? { x: vector.x / length, y: vector.y / length } : null;
}

/** World units per normalized unit along a world-space direction. */
function worldPerNormalized(direction: { x: number; y: number }, scale: WorldScale): number {
  // A unit world step (dx, dy) is (dx/sx, dy/sy) in normalized units.
  const normalizedLength = Math.hypot(direction.x / scale.x, direction.y / scale.y);
  return normalizedLength > 1e-9 ? 1 / normalizedLength : 1;
}

/**
 * The walk interpolatePath makes from `from` to `to`, measured. Null when
 * the player effectively stands still for this segment.
 */
export function measurePlayerWalk(
  from: SegmentEndpoint,
  to: SegmentEndpoint,
  scale: WorldScale = SLATE_WORLD_SCALE,
): PlayerWalkGeometry | null {
  const polyline = resolveStoredRoutePolyline(from, to) ?? [
    { x: from.x, y: from.y },
    { x: to.x, y: to.y },
  ];
  let normalizedLength = 0;
  let worldLength = 0;
  const world = polyline.map((point) => toWorld(point, scale));
  for (let index = 1; index < polyline.length; index += 1) {
    const a = polyline[index - 1]!;
    const b = polyline[index]!;
    normalizedLength += Math.hypot(b.x - a.x, b.y - a.y);
    worldLength += Math.hypot(world[index]!.x - world[index - 1]!.x, world[index]!.y - world[index - 1]!.y);
  }
  if (worldLength < PLAYER_CONTINUITY_MIN_MOVEMENT_WORLD || normalizedLength <= 0) return null;

  const span = Math.min(PLAYER_CONTINUITY_TANGENT_SPAN_WORLD, worldLength);
  const first = world[0]!;
  const last = world[world.length - 1]!;
  const startDirection = unit({ x: pointAlong(world, span).x - first.x, y: pointAlong(world, span).y - first.y });
  const endPoint = pointAlong(world, worldLength - span);
  const endDirection = unit({ x: last.x - endPoint.x, y: last.y - endPoint.y });
  if (!startDirection || !endDirection) return null;
  return {
    normalizedLength,
    worldLength,
    startDirection,
    endDirection,
    startWorldPerNormalized: worldPerNormalized(startDirection, scale),
    endWorldPerNormalized: worldPerNormalized(endDirection, scale),
  };
}

/** Angle (degrees, 0–180) between two unit directions. */
export function resolveTurnDegrees(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dot = Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y));
  return (Math.acos(dot) * 180) / Math.PI;
}

/**
 * World speed (world units per 1× ms) a player carries through the boundary
 * between two consecutive walks: 0 unless they move on both sides without
 * reversing; otherwise the slower of the two segments' average speeds, so
 * neither segment has to rush to meet it.
 */
export function resolveBoundaryWorldSpeed(
  before: { walk: PlayerWalkGeometry | null; durationMs: number } | null,
  after: { walk: PlayerWalkGeometry | null; durationMs: number } | null,
): number {
  if (!before?.walk || !after?.walk) return 0;
  if (before.durationMs <= 0 || after.durationMs <= 0) return 0;
  const turn = resolveTurnDegrees(before.walk.endDirection, after.walk.startDirection);
  if (turn > PLAYER_CONTINUITY_REVERSAL_THRESHOLD_DEGREES) return 0;
  return Math.min(before.walk.worldLength / before.durationMs, after.walk.worldLength / after.durationMs);
}

function clampSlope(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(MAX_BOUNDARY_SLOPE, value);
}

type ContinuitySnapshot = { players: readonly (SegmentEndpoint & { id: string })[] };

/**
 * Per segment, per player: the Hermite slopes for that player's walk.
 * Players absent from a segment's two snapshots get no entry (they are not
 * animated in that segment); players who stand still get no entry either and
 * are sampled with the plain smoothstep, exactly as before.
 */
export function compilePlayerContinuitySlopes(
  path: readonly ContinuitySnapshot[],
  durationsMs: readonly number[],
  scale: WorldScale = SLATE_WORLD_SCALE,
): Map<string, PlayerSegmentSlopes>[] {
  const segmentCount = Math.max(0, path.length - 1);
  const walks: Map<string, PlayerWalkGeometry | null>[] = [];
  for (let index = 0; index < segmentCount; index += 1) {
    const fromById = new Map(path[index]!.players.map((entry) => [entry.id, entry] as const));
    const segmentWalks = new Map<string, PlayerWalkGeometry | null>();
    for (const to of path[index + 1]!.players) {
      const from = fromById.get(to.id);
      if (!from) continue;
      segmentWalks.set(to.id, measurePlayerWalk(from, to, scale));
    }
    walks.push(segmentWalks);
  }

  const slopes: Map<string, PlayerSegmentSlopes>[] = [];
  for (let index = 0; index < segmentCount; index += 1) {
    const segmentSlopes = new Map<string, PlayerSegmentSlopes>();
    const durationMs = durationsMs[index] ?? 0;
    for (const [id, walk] of walks[index]!) {
      if (!walk || durationMs <= 0) continue;
      const here = { walk, durationMs };
      const previous = index > 0 && walks[index - 1]!.has(id)
        ? { walk: walks[index - 1]!.get(id) ?? null, durationMs: durationsMs[index - 1] ?? 0 }
        : null;
      const next = index < segmentCount - 1 && walks[index + 1]!.has(id)
        ? { walk: walks[index + 1]!.get(id) ?? null, durationMs: durationsMs[index + 1] ?? 0 }
        : null;
      const startSpeed = resolveBoundaryWorldSpeed(previous, here);
      const endSpeed = resolveBoundaryWorldSpeed(here, next);
      // Convert a world speed at an end of the walk into a slope relative to
      // the walk's average normalized speed (what interpolatePath's progress
      // is measured in): slope = v_world · T / (L_normalized · worldPerNormalized).
      const alpha = clampSlope((startSpeed * durationMs) / (walk.normalizedLength * walk.startWorldPerNormalized));
      const beta = clampSlope((endSpeed * durationMs) / (walk.normalizedLength * walk.endWorldPerNormalized));
      if (alpha === 0 && beta === 0) continue;
      segmentSlopes.set(id, { alpha, beta });
    }
    slopes.push(segmentSlopes);
  }
  return slopes;
}
