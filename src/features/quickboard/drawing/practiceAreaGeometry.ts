/**
 * Pure geometry for Training Practice Areas (rectangle-zone drawings on the
 * Training Grass surface): hit testing, move, four-corner resize and
 * duplicate. No Pixi, no DOM — every rule here is unit-tested directly.
 *
 * Coordinates:
 *  - Stored geometry is normalised [0,100] on both axes (the drawing
 *    record's two points). Move / resize / duplicate work in that space so
 *    the stored record never drifts.
 *  - Hit testing works in world units (the 160×100 board), because touch
 *    tolerances are pixels and the board is not square.
 *
 * Rules carried over from Tactical Sequence's zone layer
 * (movement-board/zones/zone-layer.ts) — copied, not imported, because that
 * module's maths is private and built on a different zone record:
 *  - 46px corner-handle touch target
 *  - 5×5 normalised minimum size
 *  - a dragged corner is clamped at the minimum size rather than crossing
 *    the opposite corner.
 */

export type PracticeRect = { left: number; top: number; right: number; bottom: number };
export type PracticeRectCorner = "tl" | "tr" | "bl" | "br";
type Point = { x: number; y: number };

export const PRACTICE_AREA_MIN_SIZE = 5;
export const PRACTICE_AREA_HANDLE_TOUCH_PX = 46;
export const PRACTICE_AREA_EDGE_TOUCH_PX = 14;
export const PRACTICE_AREA_DUPLICATE_OFFSET = 4;
const BOARD_MIN = 0;
const BOARD_MAX = 100;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Bounding rectangle of a drawing's two points (in whichever space they are given). */
export function practiceRectFromPoints(points: readonly Point[]): PracticeRect | null {
  if (points.length < 2) return null;
  const a = points[0]!;
  const b = points[points.length - 1]!;
  return {
    left: Math.min(a.x, b.x),
    top: Math.min(a.y, b.y),
    right: Math.max(a.x, b.x),
    bottom: Math.max(a.y, b.y),
  };
}

/** Canonical two-point form written back to the drawing record (top-left, bottom-right). */
export function practiceRectToPoints(rect: PracticeRect): [Point, Point] {
  return [
    { x: rect.left, y: rect.top },
    { x: rect.right, y: rect.bottom },
  ];
}

export function practiceRectCorners(rect: PracticeRect): Record<PracticeRectCorner, Point> {
  return {
    tl: { x: rect.left, y: rect.top },
    tr: { x: rect.right, y: rect.top },
    bl: { x: rect.left, y: rect.bottom },
    br: { x: rect.right, y: rect.bottom },
  };
}

/** Moves the whole rectangle by (dx, dy), keeping its size and staying on the board. */
export function translatePracticeRect(rect: PracticeRect, dx: number, dy: number): PracticeRect {
  const width = rect.right - rect.left;
  const height = rect.bottom - rect.top;
  const left = clamp(rect.left + dx, BOARD_MIN, BOARD_MAX - width);
  const top = clamp(rect.top + dy, BOARD_MIN, BOARD_MAX - height);
  return { left, top, right: left + width, bottom: top + height };
}

/**
 * Drags one corner to `pointer`; the opposite corner stays fixed. The dragged
 * corner is clamped to the board and can never come closer than the minimum
 * size to the fixed corner, so a corner never crosses its opposite.
 */
export function resizePracticeRectCorner(
  rect: PracticeRect,
  corner: PracticeRectCorner,
  pointer: Point,
  minSize: number = PRACTICE_AREA_MIN_SIZE,
): PracticeRect {
  const x = clamp(pointer.x, BOARD_MIN, BOARD_MAX);
  const y = clamp(pointer.y, BOARD_MIN, BOARD_MAX);
  let { left, top, right, bottom } = rect;
  if (corner === "tl" || corner === "bl") left = Math.min(x, right - minSize);
  else right = Math.max(x, left + minSize);
  if (corner === "tl" || corner === "tr") top = Math.min(y, bottom - minSize);
  else bottom = Math.max(y, top + minSize);
  return { left, top, right, bottom };
}

/**
 * A copy offset down-right so it can be grabbed straight away; if that would
 * leave the board on an axis, it is offset the other way on that axis.
 */
export function duplicatePracticeRect(
  rect: PracticeRect,
  offset: number = PRACTICE_AREA_DUPLICATE_OFFSET,
): PracticeRect {
  const dx = rect.right + offset <= BOARD_MAX ? offset : -offset;
  const dy = rect.bottom + offset <= BOARD_MAX ? offset : -offset;
  return translatePracticeRect(rect, dx, dy);
}

/** Corner handle under `point` (world space), nearest first, within `tolerance`. */
export function findPracticeRectCornerAt(
  rect: PracticeRect,
  point: Point,
  tolerance: number,
): PracticeRectCorner | null {
  let best: PracticeRectCorner | null = null;
  let bestDistance = tolerance;
  const corners = practiceRectCorners(rect);
  for (const corner of ["tl", "tr", "bl", "br"] as const) {
    const distance = Math.hypot(point.x - corners[corner].x, point.y - corners[corner].y);
    if (distance <= bestDistance) {
      bestDistance = distance;
      best = corner;
    }
  }
  return best;
}

function containsPoint(rect: PracticeRect, point: Point): boolean {
  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
}

/** Distance from `point` to the rectangle's outline (inside or outside). */
export function distanceToPracticeRectEdge(rect: PracticeRect, point: Point): number {
  if (containsPoint(rect, point)) {
    return Math.min(point.x - rect.left, rect.right - point.x, point.y - rect.top, rect.bottom - point.y);
  }
  const dx = Math.max(rect.left - point.x, 0, point.x - rect.right);
  const dy = Math.max(rect.top - point.y, 0, point.y - rect.bottom);
  return Math.hypot(dx, dy);
}

/** True when `point` is inside the rectangle or within `edgeTolerance` of its outline. */
export function isPointOnPracticeRect(rect: PracticeRect, point: Point, edgeTolerance: number): boolean {
  return containsPoint(rect, point) || distanceToPracticeRectEdge(rect, point) <= edgeTolerance;
}

/**
 * Which Practice Area a tap at `point` (world space) belongs to.
 * Deterministic for overlapping areas:
 *  1. an outline within `edgeTolerance` wins — the nearest outline;
 *  2. otherwise the smallest area containing the point;
 *  3. ties keep the most recently drawn (later in the list).
 */
export function findPracticeAreaAt(
  areas: ReadonlyArray<{ id: string; rect: PracticeRect }>,
  point: Point,
  edgeTolerance: number,
): string | null {
  let edgeId: string | null = null;
  let edgeDistance = Number.POSITIVE_INFINITY;
  let containerId: string | null = null;
  let containerSize = Number.POSITIVE_INFINITY;
  for (const area of areas) {
    const distance = distanceToPracticeRectEdge(area.rect, point);
    if (distance <= edgeTolerance && distance <= edgeDistance) {
      edgeDistance = distance;
      edgeId = area.id;
    }
    if (containsPoint(area.rect, point)) {
      const size = (area.rect.right - area.rect.left) * (area.rect.bottom - area.rect.top);
      if (size <= containerSize) {
        containerSize = size;
        containerId = area.id;
      }
    }
  }
  return edgeId ?? containerId;
}

// ---- Smart alignment ------------------------------------------------------
//
// While a Practice Area is moved or resized, an edge that lands within a small
// tolerance of another area's edge snaps onto it: matching edges (left–left,
// top–top …) and opposing edges (left–right, top–bottom …). Each axis snaps
// independently; outside the tolerance the result is returned untouched.
// Tolerances are normalised units per axis (the board is not square), derived
// by the caller from a screen-pixel distance.

/** Screen-pixel distance within which an edge snaps; small enough to stay out of the way. */
export const PRACTICE_AREA_SNAP_PX = 8;

export type PracticeSnapTolerance = { x: number; y: number };

/**
 * Smallest correction that brings any of `moving` onto any of `targets`
 * within `tolerance`, or null when nothing is that close.
 */
function nearestSnapDelta(moving: readonly number[], targets: readonly number[], tolerance: number): number | null {
  let best: number | null = null;
  for (const edge of moving) {
    for (const target of targets) {
      const delta = target - edge;
      if (Math.abs(delta) <= tolerance && (best === null || Math.abs(delta) < Math.abs(best))) best = delta;
    }
  }
  return best;
}

function xEdges(rects: readonly PracticeRect[]): number[] {
  return rects.flatMap((rect) => [rect.left, rect.right]);
}

function yEdges(rects: readonly PracticeRect[]): number[] {
  return rects.flatMap((rect) => [rect.top, rect.bottom]);
}

/**
 * Snaps an already-translated rectangle to `others`. Size is preserved; an
 * axis whose snap would push the rectangle off the board is left as-is.
 */
export function snapTranslatedPracticeRect(
  rect: PracticeRect,
  others: readonly PracticeRect[],
  tolerance: PracticeSnapTolerance,
): PracticeRect {
  if (others.length === 0) return rect;
  let { left, top, right, bottom } = rect;
  const dx = nearestSnapDelta([left, right], xEdges(others), tolerance.x);
  if (dx !== null && left + dx >= BOARD_MIN && right + dx <= BOARD_MAX) {
    left += dx;
    right += dx;
  }
  const dy = nearestSnapDelta([top, bottom], yEdges(others), tolerance.y);
  if (dy !== null && top + dy >= BOARD_MIN && bottom + dy <= BOARD_MAX) {
    top += dy;
    bottom += dy;
  }
  return { left, top, right, bottom };
}

/**
 * Snaps the two edges a corner resize moved (the dragged corner's x and y
 * edges) to `others`. The fixed edges never move; a snap that would breach
 * the minimum size or the board is skipped on that axis.
 */
export function snapResizedPracticeRect(
  rect: PracticeRect,
  corner: PracticeRectCorner,
  others: readonly PracticeRect[],
  tolerance: PracticeSnapTolerance,
  minSize: number = PRACTICE_AREA_MIN_SIZE,
): PracticeRect {
  if (others.length === 0) return rect;
  let { left, top, right, bottom } = rect;
  const movesLeft = corner === "tl" || corner === "bl";
  const movesTop = corner === "tl" || corner === "tr";
  const dx = nearestSnapDelta([movesLeft ? left : right], xEdges(others), tolerance.x);
  if (dx !== null) {
    if (movesLeft) {
      const next = left + dx;
      if (next >= BOARD_MIN && right - next >= minSize) left = next;
    } else {
      const next = right + dx;
      if (next <= BOARD_MAX && next - left >= minSize) right = next;
    }
  }
  const dy = nearestSnapDelta([movesTop ? top : bottom], yEdges(others), tolerance.y);
  if (dy !== null) {
    if (movesTop) {
      const next = top + dy;
      if (next >= BOARD_MIN && bottom - next >= minSize) top = next;
    } else {
      const next = bottom + dy;
      if (next <= BOARD_MAX && next - top >= minSize) bottom = next;
    }
  }
  return { left, top, right, bottom };
}
