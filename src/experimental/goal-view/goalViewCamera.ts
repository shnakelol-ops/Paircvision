// EXPERIMENTAL — Goal View prototype (internal only, /internal/goal-view).
//
// Pure, framework-free camera maths for an elevated behind-the-goal view of
// the existing 160×100 Tactical Sequence world. No PixiJS, no DOM: everything
// here is unit-testable.
//
// Frames
// ------
// world  — the shell's own world units: x ∈ [0,160] goal-to-goal, y ∈ [0,100]
//          touchline-to-touchline (y down). Never changed by this module.
// board  — the same pitch re-expressed from the camera's point of view:
//          a ∈ [0,100] across (left→right as the camera sees it),
//          b ∈ [0,160] along, with b = 0 the FAR end and b = 160 the NEAR end
//          (the end the camera stands behind).
// screen — CSS pixels of the canvas.
//
// A pinhole camera looking at a plane is an exact homography, so projecting
// the four board corners is all a PerspectiveMesh needs to reproduce the same
// mapping for every pixel of the flat board texture.

export const GOAL_VIEW_BOARD_WIDTH = 100;
export const GOAL_VIEW_BOARD_LENGTH = 160;

export type GoalViewEnd = "left-end" | "right-end";
export type GoalViewMode = "top-down" | GoalViewEnd;

export type Vec2 = { x: number; y: number };
export type BoardPoint = { a: number; b: number };

export type GoalViewCameraParams = {
  /** Camera height above the turf, in world units (≈0.9 m each). */
  heightUnits: number;
  /** Horizontal distance of the camera behind the near board edge. */
  distanceBehindUnits: number;
  /** Point on the pitch centre line the camera aims at, measured from the near edge. */
  lookAtUnits: number;
  /**
   * Fit the screen width to the pitch width this far in from the near edge
   * instead of the near edge itself, letting the near corners run off-screen
   * (broadcast-style framing). 0 = whole pitch always visible.
   */
  nearCropUnits: number;
};

export const DEFAULT_GOAL_VIEW_CAMERA: GoalViewCameraParams = {
  heightUnits: 90,
  distanceBehindUnits: 26,
  lookAtUnits: 80,
  nearCropUnits: 20,
};

/**
 * Quarter-turn count the shell must be set to so its existing token/ball
 * counter-rotation keeps numbers upright in the board frame. Matches
 * engine/pixi/orientation.ts conventions: 1 puts the left goal at the top
 * (camera behind the RIGHT goal), 3 puts the left goal at the bottom.
 */
export function quarterTurnsForMode(mode: GoalViewMode): 0 | 1 | 3 {
  if (mode === "left-end") return 3;
  if (mode === "right-end") return 1;
  return 0;
}

export function worldToBoard(end: GoalViewEnd, point: Vec2): BoardPoint {
  return end === "left-end"
    ? { a: point.y, b: GOAL_VIEW_BOARD_LENGTH - point.x }
    : { a: GOAL_VIEW_BOARD_WIDTH - point.y, b: point.x };
}

export function boardToWorld(end: GoalViewEnd, point: BoardPoint): Vec2 {
  return end === "left-end"
    ? { x: GOAL_VIEW_BOARD_LENGTH - point.b, y: point.a }
    : { x: point.b, y: GOAL_VIEW_BOARD_WIDTH - point.a };
}

/**
 * Affine world→texture matrix (Pixi Matrix field order a,b,c,d,tx,ty where
 * x' = a·x + c·y + tx, y' = b·x + d·y + ty). Texture pixels = board units × scale.
 */
export function worldToTextureMatrix(
  end: GoalViewEnd,
  scale: number,
): { a: number; b: number; c: number; d: number; tx: number; ty: number } {
  return end === "left-end"
    ? { a: 0, b: -scale, c: scale, d: 0, tx: 0, ty: GOAL_VIEW_BOARD_LENGTH * scale }
    : { a: 0, b: scale, c: -scale, d: 0, tx: GOAL_VIEW_BOARD_WIDTH * scale, ty: 0 };
}

/** Real-world GAA goal approximated in world units (1 unit ≈ 0.9 m). */
export const GOAL_VIEW_GOAL = {
  /** Endline offset from each board edge (gaa-goal-markings LEFT/RIGHT_ENDLINE_X). */
  endlineInset: 2,
  halfWidth: 3.6,
  crossbarHeight: 2.8,
  postHeight: 7.8,
  netDepthGround: 2.2,
  netDepthCrossbar: 1.0,
} as const;

export type GoalViewProjection = {
  readonly camera: GoalViewCameraParams;
  readonly screen: { width: number; height: number };
  /** Projects a board point at height h (units) to screen pixels; null if behind the camera. */
  project: (a: number, b: number, h?: number) => Vec2 | null;
  /** Texture corners TL, TR, BR, BL (board (0,0),(100,0),(100,160),(0,160)) in screen pixels. */
  corners: readonly [Vec2, Vec2, Vec2, Vec2];
  /** Screen-pixels per board unit along a (across) and b (along) at a ground point. */
  groundScale: (a: number, b: number) => { across: number; along: number };
  /** Ground point (board frame) whose screen position matches the 3D point (a, b, h). */
  groundShadowOf: (a: number, b: number, h: number) => BoardPoint;
};

type Basis = { cos: number; sin: number };

function cameraBasis(camera: GoalViewCameraParams): Basis {
  const theta = Math.atan2(camera.heightUnits, camera.distanceBehindUnits + camera.lookAtUnits);
  return { cos: Math.cos(theta), sin: Math.sin(theta) };
}

/** Unscaled image-plane projection; null when the point is at/behind the camera plane. */
function projectRaw(
  camera: GoalViewCameraParams,
  basis: Basis,
  a: number,
  b: number,
  h: number,
): Vec2 | null {
  const x = a - GOAL_VIEW_BOARD_WIDTH / 2;
  const yRel = h - camera.heightUnits;
  const z = GOAL_VIEW_BOARD_LENGTH - b + camera.distanceBehindUnits;
  const zc = z * basis.cos - yRel * basis.sin;
  if (zc <= 1e-6) return null;
  const yc = yRel * basis.cos + z * basis.sin;
  return { x: x / zc, y: -yc / zc };
}

export function createGoalViewProjection(
  camera: GoalViewCameraParams,
  screen: { width: number; height: number },
  options: { paddingPx?: number } = {},
): GoalViewProjection {
  const basis = cameraBasis(camera);
  const padding = options.paddingPx ?? 12;
  const L = GOAL_VIEW_BOARD_LENGTH;
  const W = GOAL_VIEW_BOARD_WIDTH;
  const G = GOAL_VIEW_GOAL;

  // Fit: the far end (including the far goal's posts) and the near edge must
  // be visible vertically. Horizontally, the width is taken at the crop line
  // (the near edge when nearCropUnits = 0). The near goal may crop at the
  // bottom — it is the closest object to camera.
  const cropB = L - Math.max(0, Math.min(L * 0.75, camera.nearCropUnits));
  const xPoints: Vec2[] = [];
  const yPoints: Vec2[] = [];
  const push = (into: Vec2[], a: number, b: number, h = 0) => {
    const p = projectRaw(camera, basis, a, b, h);
    if (p) into.push(p);
  };
  push(xPoints, 0, 0);
  push(xPoints, W, 0);
  push(xPoints, 0, cropB);
  push(xPoints, W, cropB);
  push(yPoints, W / 2, L);
  push(yPoints, W / 2 - G.halfWidth, G.endlineInset, G.postHeight);
  push(yPoints, 0, 0);
  const minX = Math.min(...xPoints.map((p) => p.x));
  const maxX = Math.max(...xPoints.map((p) => p.x));
  const minY = Math.min(...yPoints.map((p) => p.y));
  const maxY = Math.max(...yPoints.map((p) => p.y));
  const availW = Math.max(1, screen.width - padding * 2);
  const availH = Math.max(1, screen.height - padding * 2);
  const k = Math.min(availW / Math.max(1e-9, maxX - minX), availH / Math.max(1e-9, maxY - minY));
  const ox = (screen.width - (maxX - minX) * k) / 2 - minX * k;
  const oy = (screen.height - (maxY - minY) * k) / 2 - minY * k;

  const project = (a: number, b: number, h = 0): Vec2 | null => {
    const p = projectRaw(camera, basis, a, b, h);
    return p ? { x: p.x * k + ox, y: p.y * k + oy } : null;
  };

  const must = (p: Vec2 | null): Vec2 => p ?? { x: Number.NaN, y: Number.NaN };
  const corners = [
    must(project(0, 0)),
    must(project(W, 0)),
    must(project(W, L)),
    must(project(0, L)),
  ] as const;

  const groundScale = (a: number, b: number) => {
    const e = 0.5;
    const p = must(project(a, b));
    const pa = must(project(a + e, b));
    const pb = must(project(a, b + e));
    return {
      across: Math.hypot(pa.x - p.x, pa.y - p.y) / e,
      along: Math.hypot(pb.x - p.x, pb.y - p.y) / e,
    };
  };

  const groundShadowOf = (a: number, b: number, h: number): BoardPoint => {
    // Camera sits at board (W/2, L + D, H). The ray camera→P meets h=0 at
    // t = H / (H - h); clamp so points at/above camera height stay finite.
    const H = camera.heightUnits;
    const t = H / Math.max(1e-3, H - h);
    const ca = W / 2;
    const cb = L + camera.distanceBehindUnits;
    return { a: ca + t * (a - ca), b: cb + t * (b - cb) };
  };

  return { camera, screen, project, corners, groundScale, groundShadowOf };
}
