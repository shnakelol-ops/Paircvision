/**
 * Pure geometry for Angled Zones (the "angled-zone" drawing kind): a filled
 * four-corner polygon whose corners the coach drags independently to mark
 * irregular or diagonal areas of the pitch. No Pixi, no DOM — every rule
 * here is unit-tested directly.
 *
 * Coordinates:
 *  - Stored geometry is the drawing record's four points, normalised [0,100]
 *    on both axes (pitch-relative). Corner drag / move work in that space so
 *    the stored record never drifts.
 *  - Hit testing works in world units (the 160×100 board), because touch
 *    tolerances are pixels and the board is not square. Every hit-test
 *    helper here is space-agnostic: callers pass points and tolerances in
 *    the same space.
 *
 * Validity (applied on create, on every corner drag, and on load):
 *  - exactly four finite corners on the board;
 *  - a simple polygon — opposite edges never cross or touch, so a corner
 *    drag can never turn the zone into a bow-tie;
 *  - at least ANGLED_ZONE_MIN_AREA (the same 5×5 normalised minimum as a
 *    Practice Area) and no two corners closer than ANGLED_ZONE_MIN_CORNER_GAP.
 * A corner drag that would break any rule is not applied: the corner stays
 * where it last was valid, so the shape is always predictable.
 * Concave (dented) shapes are allowed.
 */

import { PRACTICE_AREA_EDGE_TOUCH_PX, PRACTICE_AREA_HANDLE_TOUCH_PX } from "./practiceAreaGeometry";

type Point = { x: number; y: number };
export type AngledZoneCorners = [Point, Point, Point, Point];

export const ANGLED_ZONE_CORNER_COUNT = 4;
/** Same 5×5 normalised minimum as a Practice Area. */
export const ANGLED_ZONE_MIN_AREA = 25;
export const ANGLED_ZONE_MIN_CORNER_GAP = 2;
/** 46px corner-handle touch target (shared with Practice Areas). */
export const ANGLED_ZONE_HANDLE_TOUCH_PX = PRACTICE_AREA_HANDLE_TOUCH_PX;
export const ANGLED_ZONE_EDGE_TOUCH_PX = PRACTICE_AREA_EDGE_TOUCH_PX;
const BOARD_MIN = 0;
const BOARD_MAX = 100;
const EPSILON = 1e-9;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isFinitePoint(point: Point | undefined): point is Point {
  return point != null && Number.isFinite(point.x) && Number.isFinite(point.y);
}

function onBoard(point: Point): boolean {
  return point.x >= BOARD_MIN && point.x <= BOARD_MAX && point.y >= BOARD_MIN && point.y <= BOARD_MAX;
}

/**
 * The four corners of the rectangle dragged from `a` to `b`, clockwise on
 * screen (y down) from top-left: top-left, top-right, bottom-right, bottom-left.
 */
export function angledZoneCornersFromDrag(a: Point, b: Point): AngledZoneCorners {
  const left = Math.min(a.x, b.x);
  const right = Math.max(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const bottom = Math.max(a.y, b.y);
  return [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
  ];
}

/** Unsigned polygon area (shoelace). */
export function angledZoneArea(points: readonly Point[]): number {
  let twice = 0;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index]!;
    const b = points[(index + 1) % points.length]!;
    twice += a.x * b.y - b.x * a.y;
  }
  return Math.abs(twice) / 2;
}

function orientation(a: Point, b: Point, c: Point): number {
  const value = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  if (Math.abs(value) <= EPSILON) return 0;
  return value > 0 ? 1 : -1;
}

function onSegment(a: Point, b: Point, p: Point): boolean {
  return (
    p.x <= Math.max(a.x, b.x) + EPSILON &&
    p.x >= Math.min(a.x, b.x) - EPSILON &&
    p.y <= Math.max(a.y, b.y) + EPSILON &&
    p.y >= Math.min(a.y, b.y) - EPSILON
  );
}

/** True when segments a1–a2 and b1–b2 cross or touch (including collinear overlap). */
export function segmentsIntersect(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
  const o1 = orientation(a1, a2, b1);
  const o2 = orientation(a1, a2, b2);
  const o3 = orientation(b1, b2, a1);
  const o4 = orientation(b1, b2, a2);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(a1, a2, b1)) return true;
  if (o2 === 0 && onSegment(a1, a2, b2)) return true;
  if (o3 === 0 && onSegment(b1, b2, a1)) return true;
  if (o4 === 0 && onSegment(b1, b2, a2)) return true;
  return false;
}

/** A quadrilateral self-intersects when either pair of opposite edges meets. */
export function isAngledZoneSelfIntersecting(points: readonly Point[]): boolean {
  if (points.length !== ANGLED_ZONE_CORNER_COUNT) return true;
  const [p0, p1, p2, p3] = points as AngledZoneCorners;
  return segmentsIntersect(p0, p1, p2, p3) || segmentsIntersect(p1, p2, p3, p0);
}

export type AngledZoneValidityOptions = {
  minArea?: number;
  minCornerGap?: number;
};

/** Every validity rule in one place (see the module header). Points are normalised. */
export function isValidAngledZone(points: readonly Point[], options: AngledZoneValidityOptions = {}): boolean {
  if (points.length !== ANGLED_ZONE_CORNER_COUNT) return false;
  if (!points.every((point) => isFinitePoint(point) && onBoard(point))) return false;
  const minCornerGap = options.minCornerGap ?? ANGLED_ZONE_MIN_CORNER_GAP;
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      if (Math.hypot(points[i]!.x - points[j]!.x, points[i]!.y - points[j]!.y) < minCornerGap) return false;
    }
  }
  if (isAngledZoneSelfIntersecting(points)) return false;
  return angledZoneArea(points) >= (options.minArea ?? ANGLED_ZONE_MIN_AREA);
}

function cloneCorners(points: readonly Point[]): AngledZoneCorners {
  return points.map((point) => ({ x: point.x, y: point.y })) as AngledZoneCorners;
}

/**
 * Drags corner `index` to `pointer` (clamped to the board). If the result
 * would be invalid the zone is returned unchanged, so the corner simply stops
 * at its last valid position.
 */
export function moveAngledZoneCorner(points: readonly Point[], index: number, pointer: Point): AngledZoneCorners {
  const current = cloneCorners(points);
  if (index < 0 || index >= ANGLED_ZONE_CORNER_COUNT || !isFinitePoint(pointer)) return current;
  const next = cloneCorners(points);
  next[index] = { x: clamp(pointer.x, BOARD_MIN, BOARD_MAX), y: clamp(pointer.y, BOARD_MIN, BOARD_MAX) };
  return isValidAngledZone(next) ? next : current;
}

/** Moves the whole zone by (dx, dy), keeping its shape and every corner on the board. */
export function translateAngledZone(points: readonly Point[], dx: number, dy: number): AngledZoneCorners {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const safeDx = clamp(Number.isFinite(dx) ? dx : 0, BOARD_MIN - Math.min(...xs), BOARD_MAX - Math.max(...xs));
  const safeDy = clamp(Number.isFinite(dy) ? dy : 0, BOARD_MIN - Math.min(...ys), BOARD_MAX - Math.max(...ys));
  return points.map((point) => ({ x: point.x + safeDx, y: point.y + safeDy })) as AngledZoneCorners;
}

/** Even-odd point-in-polygon (works for convex and concave simple polygons). */
export function isPointInAngledZone(points: readonly Point[], point: Point): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const a = points[i]!;
    const b = points[j]!;
    if (a.y > point.y !== b.y > point.y) {
      const crossX = ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
      if (point.x < crossX) inside = !inside;
    }
  }
  return inside;
}

function distanceToSegment(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= EPSILON) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1);
  return Math.hypot(point.x - (start.x + dx * t), point.y - (start.y + dy * t));
}

/** Distance from `point` to the zone's outline (inside or outside). */
export function distanceToAngledZoneOutline(points: readonly Point[], point: Point): number {
  let best = Number.POSITIVE_INFINITY;
  for (let index = 0; index < points.length; index += 1) {
    best = Math.min(best, distanceToSegment(point, points[index]!, points[(index + 1) % points.length]!));
  }
  return best;
}

/** True when `point` is inside the zone or within `edgeTolerance` of its outline. */
export function isPointOnAngledZone(points: readonly Point[], point: Point, edgeTolerance: number): boolean {
  return isPointInAngledZone(points, point) || distanceToAngledZoneOutline(points, point) <= edgeTolerance;
}

/** Index of the corner handle under `point`, nearest first, within `tolerance`; null if none. */
export function findAngledZoneCornerAt(points: readonly Point[], point: Point, tolerance: number): number | null {
  let best: number | null = null;
  let bestDistance = tolerance;
  for (let index = 0; index < points.length; index += 1) {
    const distance = Math.hypot(point.x - points[index]!.x, point.y - points[index]!.y);
    if (distance <= bestDistance) {
      bestDistance = distance;
      best = index;
    }
  }
  return best;
}

/**
 * Which Angled Zone a tap at `point` belongs to. Deterministic for overlaps:
 * the most recently drawn zone (later in the list) the point is on wins,
 * matching the order zones are painted in.
 */
export function findAngledZoneAt(
  zones: ReadonlyArray<{ id: string; points: readonly Point[] }>,
  point: Point,
  edgeTolerance: number,
): string | null {
  for (let index = zones.length - 1; index >= 0; index -= 1) {
    const zone = zones[index]!;
    if (isPointOnAngledZone(zone.points, point, edgeTolerance)) return zone.id;
  }
  return null;
}

/** True when two corner lists hold the same geometry. */
export function sameAngledZoneCorners(a: readonly Point[], b: readonly Point[]): boolean {
  return a.length === b.length && a.every((point, index) => point.x === b[index]!.x && point.y === b[index]!.y);
}
