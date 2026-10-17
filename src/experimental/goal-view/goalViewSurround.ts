// Goal View grass surround: grass that continues beyond the pitch boundary.
//
// Used by Tactical Slate's Gaelic Pitch and Training Grass boards (see
// slateGoalView.ts) with mown bands + a camera-depth fade. The edge-sampled
// turf builder below is an internal Tactical Sequence investigation used only
// by the /internal/goal-view prototype.
//
// Pure, framework-free geometry. The surround is a list of flat-coloured
// convex cells in WORLD units (x ∈ [0,160] goal-to-goal, y ∈ [0,100]); the
// lens projects each cell through the same Goal View camera as the pitch mesh.
// A pinhole camera maps ground lines to lines, so a projected cell is an exact
// quadrilateral: no texture, no distortion, crisp band edges at any zoom.
//
// The pitch texture itself is never touched. Cells start OVERLAP units inside
// the boundary, under the opaque pitch mesh, so no gap can open at the edge,
// and leave the rest of the pitch interior out (no overdraw).

import {
  GOAL_VIEW_BOARD_LENGTH,
  GOAL_VIEW_BOARD_WIDTH,
  type GoalViewProjection,
  type Vec2,
} from "./goalViewCamera";

/** World-space flat-colour cell. `poly` is convex, in world units. */
export type GoalViewSurroundCell = { poly: readonly Vec2[]; color: number; alpha: number };

/**
 * Fade with distance from the CAMERA (fog-like), in world units of camera
 * depth beyond the farthest pitch corner: full grass up to `start`, easing to
 * nothing at `end`, in `slices` steps. Measured from the pitch, so the grass
 * next to the far boundary is always solid (no seam), and grass near the
 * camera never fades, at any angle or tilt.
 */
export type SurroundDepthFade = { start: number; end: number; slices: number };
export const DEFAULT_SURROUND_DEPTH_FADE: SurroundDepthFade = { start: 8, end: 120, slices: 20 };

/**
 * A surround is an immutable cell list. The lens caches its board-space
 * conversion by object identity, so build it once and reuse it.
 */
export type GoalViewSurround = {
  readonly id: string;
  readonly cells: readonly GoalViewSurroundCell[];
  readonly depthFade: SurroundDepthFade | null;
  /**
   * Opaque colour painted over the whole canvas beneath the grass (normally
   * the panel colour behind the board's canvas), or null for none. Needed
   * whenever the grass fades: canvas recordings drop alpha (faded grass would
   * show solid, ending in a hard edge) and PNG viewers show transparency.
   */
  readonly backdrop: number | null;
};

/** The same surround over an opaque backdrop (see GoalViewSurround.backdrop). */
export function withBackdrop(surround: GoalViewSurround, backdrop: number | null): GoalViewSurround {
  return { ...surround, id: `${surround.id}:bg${backdrop ?? "none"}`, backdrop };
}

const WORLD_LENGTH = GOAL_VIEW_BOARD_LENGTH; // world x
const WORLD_WIDTH = GOAL_VIEW_BOARD_WIDTH; // world y

/** Cells begin this far inside the pitch boundary (hidden under the mesh). */
export const SURROUND_OVERLAP = 2;
/**
 * How far the grass reaches beyond every boundary, in world units. With the
 * default depth fade, an outer edge at ≥ 300 units is never on screen before
 * the fade has removed it (every preset, Fit, tilt 20–75°, all yaws, phone
 * and desktop canvases; see goalViewSurround.test.ts). Larger costs only a
 * few more band cells.
 */
export const SURROUND_MARGIN = 360;

/** Options shared by the builders. */
export type SurroundOptions = { margin?: number; depthFade?: SurroundDepthFade | null };

/** Grass bands + fade: the approved Goal View surround. */
export const FADED_SURROUND_OPTIONS: SurroundOptions = { margin: SURROUND_MARGIN, depthFade: DEFAULT_SURROUND_DEPTH_FADE };

type Rect = { x0: number; y0: number; x1: number; y1: number };

const expanded = (d: number): Rect => ({ x0: -d, y0: -d, x1: WORLD_LENGTH + d, y1: WORLD_WIDTH + d });

/** The surround area: the margin rect minus the pitch (less the overlap), as four non-overlapping rects. */
function surroundRects(margin: number): Rect[] {
  const o = expanded(margin);
  const h = expanded(-SURROUND_OVERLAP);
  return [
    { x0: o.x0, y0: o.y0, x1: o.x1, y1: h.y0 }, // y < 0 side (top in landscape)
    { x0: o.x0, y0: h.y1, x1: o.x1, y1: o.y1 }, // y > 100 side
    { x0: o.x0, y0: h.y0, x1: h.x0, y1: h.y1 }, // x < 0 side (left endline)
    { x0: h.x1, y0: h.y0, x1: o.x1, y1: h.y1 }, // x > 160 side (right endline)
  ];
}

const smoothstep = (t: number) => t * t * (3 - 2 * t);

/** Splits a rect at the given x positions (sorted). */
function splitX(r: Rect, xs: readonly number[]): Rect[] {
  const cuts = [r.x0, ...xs.filter((x) => x > r.x0 + 1e-9 && x < r.x1 - 1e-9), r.x1];
  const out: Rect[] = [];
  for (let i = 0; i < cuts.length - 1; i += 1) out.push({ ...r, x0: cuts[i], x1: cuts[i + 1] });
  return out;
}

function splitY(r: Rect, ys: readonly number[]): Rect[] {
  const cuts = [r.y0, ...ys.filter((y) => y > r.y0 + 1e-9 && y < r.y1 - 1e-9), r.y1];
  const out: Rect[] = [];
  for (let i = 0; i < cuts.length - 1; i += 1) out.push({ ...r, y0: cuts[i], y1: cuts[i + 1] });
  return out;
}

const rectPoly = (r: Rect): Vec2[] => [
  { x: r.x0, y: r.y0 },
  { x: r.x1, y: r.y0 },
  { x: r.x1, y: r.y1 },
  { x: r.x0, y: r.y1 },
];

const range = (from: number, to: number, step: number): number[] => {
  const out: number[] = [];
  for (let v = Math.ceil(from / step) * step; v <= to; v += step) out.push(v);
  return out;
};

// ---------------------------------------------------------------------------
// Mown bands (Tactical Slate: Gaelic Pitch and Training Grass)
// ---------------------------------------------------------------------------

export type SurroundBands = {
  /** Band width in world units along x (goal-to-goal). Bands are anchored at x = 0. */
  bandWidth: number;
  /** [band starting at x = 0, next band]. */
  colors: readonly [number, number];
};

/** Colour of the band containing world x, continuing the board's own alternation beyond 0 and 160. */
export function bandColorAt(bands: SurroundBands, x: number): number {
  const index = Math.floor(x / bands.bandWidth);
  return bands.colors[((index % 2) + 2) % 2];
}

/**
 * Bands that continue the board's mown bands past both endlines and run on
 * straight past both touchlines (bands vary along x only). One cell per band
 * per side.
 */
export function buildBandSurround(bands: SurroundBands, options: SurroundOptions = {}): GoalViewSurround {
  const margin = options.margin ?? SURROUND_MARGIN;
  const depthFade = options.depthFade ?? null;
  const cells: GoalViewSurroundCell[] = [];
  const xs = range(-margin, WORLD_LENGTH + margin, bands.bandWidth);
  for (const rect of surroundRects(margin)) {
    for (const piece of splitX(rect, xs)) {
      cells.push({ poly: rectPoly(piece), color: bandColorAt(bands, (piece.x0 + piece.x1) / 2), alpha: 1 });
    }
  }
  return {
    id: `bands:${bands.bandWidth}:${bands.colors.join(",")}:${margin}:${depthFade ? `${depthFade.start}-${depthFade.end}x${depthFade.slices}` : "solid"}`,
    cells,
    depthFade,
    backdrop: null,
  };
}

// ---------------------------------------------------------------------------
// Edge-sampled turf (Tactical Sequence investigation, internal prototype only)
// ---------------------------------------------------------------------------

/**
 * Colours of the pitch just inside each boundary, sampled from the board's own
 * pitch renderer (see goalViewSurroundSampling.ts), `perUnit` samples per world
 * unit. top: along x at y≈0 · bottom: along x at y≈100 · left: along y at
 * x≈0 · right: along y at x≈160. Colours are 0xRRGGBB.
 */
export type SurroundEdgeSamples = {
  perUnit: number;
  top: readonly number[];
  bottom: readonly number[];
  left: readonly number[];
  right: readonly number[];
};

/** Multiply-blended dark stripes (the turf's TilingSprite, continued). */
export type SurroundStripes = {
  /** Repeat length in world units, anchored at x = 0. */
  period: number;
  /** [start, end) offsets within one period of each dark stripe. */
  stripes: ReadonlyArray<readonly [number, number]>;
  /** Darkening: the stripe draws black at this alpha (≡ multiply by 1 − alpha). */
  alpha: number;
};

const channel = (c: number, shift: number) => (c >> shift) & 0xff;

/** Mean colour of samples[from, to) (indices clamped). */
function meanColor(samples: readonly number[], from: number, to: number): number {
  const i0 = Math.max(0, Math.min(samples.length - 1, Math.floor(from)));
  const i1 = Math.max(i0 + 1, Math.min(samples.length, Math.ceil(to)));
  let r = 0;
  let g = 0;
  let b = 0;
  for (let i = i0; i < i1; i += 1) {
    r += channel(samples[i], 16);
    g += channel(samples[i], 8);
    b += channel(samples[i], 0);
  }
  const n = i1 - i0;
  return (Math.round(r / n) << 16) | (Math.round(g / n) << 8) | Math.round(b / n);
}

function mix(a: number, b: number): number {
  return (
    (Math.round((channel(a, 16) + channel(b, 16)) / 2) << 16) |
    (Math.round((channel(a, 8) + channel(b, 8)) / 2) << 8) |
    Math.round((channel(a, 0) + channel(b, 0)) / 2)
  );
}

/** World x positions of every stripe edge within [from, to]. */
function stripeEdges(stripes: SurroundStripes, from: number, to: number): number[] {
  const out: number[] = [];
  const k0 = Math.floor(from / stripes.period) - 1;
  const k1 = Math.ceil(to / stripes.period) + 1;
  for (let k = k0; k <= k1; k += 1) {
    for (const [s, e] of stripes.stripes) {
      for (const x of [k * stripes.period + s, k * stripes.period + e]) if (x >= from && x <= to) out.push(x);
    }
  }
  return out.sort((p, q) => p - q);
}

function inStripe(stripes: SurroundStripes, x: number): boolean {
  const u = ((x % stripes.period) + stripes.period) % stripes.period;
  return stripes.stripes.some(([s, e]) => u >= s && u < e);
}

/**
 * Turf that continues each boundary's own colour straight outwards (the same
 * idea as clamp-to-edge sampling), so the colour just outside the line equals
 * the colour just inside it everywhere along the boundary. The samples are
 * taken WITHOUT the stripe layer; the dark stripes are then drawn on every
 * side from the turf's own repeat, so their phase matches the pitch exactly.
 *
 * `stepUnits` is the column width for the outward strips (smaller = smoother
 * edge match, more cells); stripe edges are always cut exactly.
 */
export function buildEdgeSampledSurround(
  samples: SurroundEdgeSamples,
  stripes: SurroundStripes | null,
  options: SurroundOptions & { stepUnits?: number } = {},
): GoalViewSurround {
  const step = options.stepUnits ?? 4;
  const margin = options.margin ?? SURROUND_MARGIN;
  const depthFade = options.depthFade ?? null;
  const k = samples.perUnit;
  const cells: GoalViewSurroundCell[] = [];
  const corner = {
    tl: mix(samples.top[0], samples.left[0]),
    tr: mix(samples.top[samples.top.length - 1], samples.right[0]),
    bl: mix(samples.bottom[0], samples.left[samples.left.length - 1]),
    br: mix(samples.bottom[samples.bottom.length - 1], samples.right[samples.right.length - 1]),
  };
  const xCuts = [0, WORLD_LENGTH, ...range(0, WORLD_LENGTH, step), ...(stripes ? stripeEdges(stripes, -margin, WORLD_LENGTH + margin) : [])].sort(
    (p, q) => p - q,
  );
  const yCuts = [0, WORLD_WIDTH, ...range(0, WORLD_WIDTH, step)].sort((p, q) => p - q);

  const baseColor = (piece: Rect): number => {
    const cx = (piece.x0 + piece.x1) / 2;
    const cy = (piece.y0 + piece.y1) / 2;
    const outsideX = cx < 0 || cx > WORLD_LENGTH;
    const outsideY = cy < 0 || cy > WORLD_WIDTH;
    if (outsideX && outsideY) return cx < 0 ? (cy < 0 ? corner.tl : corner.bl) : cy < 0 ? corner.tr : corner.br;
    if (outsideY) return meanColor(cy < 0 ? samples.top : samples.bottom, piece.x0 * k, piece.x1 * k);
    if (outsideX) return meanColor(cx < 0 ? samples.left : samples.right, piece.y0 * k, piece.y1 * k);
    // Inside the overlap band (hidden under the mesh): nearest edge.
    const d = [cy, WORLD_WIDTH - cy, cx, WORLD_LENGTH - cx];
    const nearest = d.indexOf(Math.min(...d));
    if (nearest === 0) return meanColor(samples.top, piece.x0 * k, piece.x1 * k);
    if (nearest === 1) return meanColor(samples.bottom, piece.x0 * k, piece.x1 * k);
    return meanColor(nearest === 2 ? samples.left : samples.right, piece.y0 * k, piece.y1 * k);
  };

  for (const rect of surroundRects(margin)) {
    for (const column of splitX(rect, xCuts)) {
      for (const piece of splitY(column, yCuts)) {
        cells.push({ poly: rectPoly(piece), color: baseColor(piece), alpha: 1 });
        // Stripes on top (the samples have none). Inside the pitch rectangle
        // the cell is hidden under the mesh.
        const cx = (piece.x0 + piece.x1) / 2;
        const cy = (piece.y0 + piece.y1) / 2;
        const outside = cx < 0 || cx > WORLD_LENGTH || cy < 0 || cy > WORLD_WIDTH;
        if (stripes && outside && inStripe(stripes, cx)) {
          cells.push({ poly: rectPoly(piece), color: 0x000000, alpha: stripes.alpha });
        }
      }
    }
  }
  return {
    id: `edge:${step}:${margin}:${depthFade ? `${depthFade.start}-${depthFade.end}x${depthFade.slices}` : "solid"}`,
    cells,
    depthFade,
    backdrop: null,
  };
}

// ---------------------------------------------------------------------------
// Projection and clipping
// ---------------------------------------------------------------------------

/** Board-space (camera frame) polygon: a across, b along. */
export type BoardPoly = ReadonlyArray<{ a: number; b: number }>;

/** Minimum camera-space depth kept, in world units. Anything nearer is clipped away. */
export const SURROUND_NEAR_DEPTH = 0.5;

type GroundPoint = { a: number; b: number };

/** Keeps the part of a convex ground polygon where side(p) >= 0 (side affine in a, b). */
function clipGround(poly: readonly GroundPoint[], side: (p: GroundPoint) => number): GroundPoint[] {
  const out: GroundPoint[] = [];
  for (let i = 0; i < poly.length; i += 1) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const dp = side(p);
    const dq = side(q);
    if (dp >= 0) out.push(p);
    if ((dp >= 0) !== (dq >= 0)) {
      const t = dp / (dp - dq);
      out.push({ a: p.a + (q.a - p.a) * t, b: p.b + (q.b - p.b) * t });
    }
  }
  return out;
}

/** Camera depth of the farthest pitch corner: the reference for the depth fade. */
export function farthestPitchDepth(projection: Pick<GoalViewProjection, "cameraDepth">): number {
  return Math.max(
    projection.cameraDepth(0, 0),
    projection.cameraDepth(GOAL_VIEW_BOARD_WIDTH, 0),
    projection.cameraDepth(GOAL_VIEW_BOARD_WIDTH, GOAL_VIEW_BOARD_LENGTH),
    projection.cameraDepth(0, GOAL_VIEW_BOARD_LENGTH),
  );
}

/**
 * Depth slabs for a depth fade: [minDepth, maxDepth, alpha multiplier], in
 * increasing depth. The first slab is solid from the near plane to the fade
 * start; anything beyond the fade end is not drawn at all.
 */
export function depthFadeSlabs(fade: SurroundDepthFade | null, farPitchDepth: number): Array<[number, number, number]> {
  if (!fade) return [[SURROUND_NEAR_DEPTH, Infinity, 1]];
  const start = farPitchDepth + fade.start;
  const end = farPitchDepth + Math.max(fade.start, fade.end);
  const slabs: Array<[number, number, number]> = [[SURROUND_NEAR_DEPTH, start, 1]];
  const n = Math.max(1, Math.round(fade.slices));
  const step = (end - start) / n;
  for (let i = 0; i < n; i += 1) slabs.push([start + i * step, start + (i + 1) * step, 1 - smoothstep((i + 0.5) / n)]);
  return slabs;
}

/**
 * Clips a convex board polygon to the camera depth range [minDepth, maxDepth]
 * (minDepth >= the near plane), projects it, and clips it to the canvas
 * rectangle. Returns flat screen coordinates [x0, y0, x1, y1, …] or null when
 * nothing is visible. The result never extends outside [0, width] ×
 * [0, height], so the grass can never grow the stage bounds (and with them a
 * Share Image export) beyond the canvas.
 */
export function projectClippedPolygon(
  poly: BoardPoly,
  projection: Pick<GoalViewProjection, "project" | "cameraDepth">,
  screen: { width: number; height: number },
  minDepth = SURROUND_NEAR_DEPTH,
  maxDepth = Infinity,
): number[] | null {
  // 1. Depth range (near plane first). Depth is affine in (a, b) on the
  //    ground, so linear interpolation finds the exact crossings.
  const depth = (p: GroundPoint) => projection.cameraDepth(p.a, p.b);
  const near = Math.max(SURROUND_NEAR_DEPTH, minDepth);
  let front = clipGround(poly, (p) => depth(p) - near);
  if (front.length < 3) return null;
  if (Number.isFinite(maxDepth)) {
    front = clipGround(front, (p) => maxDepth - depth(p));
    if (front.length < 3) return null;
  }
  // 2. Project (every vertex is now in front of the camera).
  let pts: Vec2[] = [];
  for (const p of front) {
    const s = projection.project(p.a, p.b);
    if (!s || !Number.isFinite(s.x) || !Number.isFinite(s.y)) return null;
    pts.push(s);
  }
  // 3. Canvas rectangle (Sutherland–Hodgman, one edge at a time).
  const edges: Array<(p: Vec2) => number> = [
    (p) => p.x,
    (p) => screen.width - p.x,
    (p) => p.y,
    (p) => screen.height - p.y,
  ];
  for (const inside of edges) {
    const next: Vec2[] = [];
    for (let i = 0; i < pts.length; i += 1) {
      const p = pts[i];
      const q = pts[(i + 1) % pts.length];
      const dp = inside(p);
      const dq = inside(q);
      if (dp >= 0) next.push(p);
      if ((dp >= 0) !== (dq >= 0)) {
        const t = dp / (dp - dq);
        next.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
      }
    }
    pts = next;
    if (pts.length < 3) return null;
  }
  const flat: number[] = [];
  for (const p of pts) flat.push(p.x, p.y);
  return flat;
}

/** A surround cell already converted to the camera's board frame. */
export type BoardSurroundCell = { poly: BoardPoly; color: number; alpha: number };

/** A screen-space polygon ready to fill. */
export type SurroundPolygon = { flat: number[]; color: number; alpha: number };

/**
 * Projects a whole surround for one camera: every cell is clipped to the near
 * plane and canvas, and cut into depth-fade slabs. Work is skipped early where
 * it cannot draw anything:
 *  - a cell entirely behind the camera or beyond the fade end;
 *  - a cell whose visible part projects entirely off the canvas (its screen
 *    bounding box is tested once, before any slab cut);
 *  - slabs outside the cell's own depth range (depth is affine, so the range
 *    is spanned by its vertices). Most cells touch only a few slabs.
 */
export function projectSurround(
  cells: readonly BoardSurroundCell[],
  depthFade: SurroundDepthFade | null,
  projection: Pick<GoalViewProjection, "project" | "cameraDepth">,
  screen: { width: number; height: number },
): { polygons: SurroundPolygon[]; clipCalls: number } {
  const slabs = depthFadeSlabs(depthFade, farthestPitchDepth(projection));
  const fadeEnd = slabs[slabs.length - 1][1];
  const depth = (p: GroundPoint) => projection.cameraDepth(p.a, p.b);
  const polygons: SurroundPolygon[] = [];
  let clipCalls = 0;
  for (const cell of cells) {
    let dMin = Infinity;
    let dMax = -Infinity;
    for (const p of cell.poly) {
      const d = depth(p);
      if (d < dMin) dMin = d;
      if (d > dMax) dMax = d;
    }
    if (dMax <= SURROUND_NEAR_DEPTH || dMin >= fadeEnd) continue;
    // The part that can be drawn at all: in front of the camera, before the fade end.
    let visible = clipGround(cell.poly, (p) => depth(p) - SURROUND_NEAR_DEPTH);
    if (Number.isFinite(fadeEnd) && visible.length >= 3) visible = clipGround(visible, (p) => fadeEnd - depth(p));
    if (visible.length < 3) continue;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const p of visible) {
      const q = projection.project(p.a, p.b);
      if (!q) continue;
      if (q.x < x0) x0 = q.x;
      if (q.x > x1) x1 = q.x;
      if (q.y < y0) y0 = q.y;
      if (q.y > y1) y1 = q.y;
    }
    // A convex polygon lies inside its vertices' bounding box.
    if (x1 < 0 || y1 < 0 || x0 > screen.width || y0 > screen.height) continue;
    const lo0 = Math.max(SURROUND_NEAR_DEPTH, dMin);
    const hi0 = Math.min(fadeEnd, dMax);
    for (const [lo, hi, alpha] of slabs) {
      if (hi <= lo0 || lo >= hi0) continue;
      clipCalls += 1;
      // A slab that contains the cell's whole visible range needs no depth cut.
      const flat = projectClippedPolygon(visible, projection, screen, lo <= lo0 ? SURROUND_NEAR_DEPTH : lo, hi >= hi0 ? Infinity : hi);
      if (flat) polygons.push({ flat, color: cell.color, alpha: cell.alpha * alpha });
    }
  }
  return { polygons, clipCalls };
}
