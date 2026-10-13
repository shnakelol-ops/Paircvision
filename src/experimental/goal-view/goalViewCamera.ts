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

// Configuration C ("DSS-inspired"): reproduces the DSS Coaching reference's
// proportions — far endline 52% of the near endline's width, halfway line 34%
// of the way down from the far end. A gentler, more tactical perspective than
// a dramatic behind-the-goal camera. All four values stay slider-adjustable.
export const DEFAULT_GOAL_VIEW_CAMERA: GoalViewCameraParams = {
  heightUnits: 112,
  distanceBehindUnits: 92,
  lookAtUnits: 80,
  nearCropUnits: 30,
};

/**
 * Interactive orbit (prototype). Presentation-only camera state: it never
 * touches board coordinates, tokens, phases or saved plays.
 *
 * The camera orbits the point it already aims at — the pitch centre for
 * Camera C (lookAtUnits 80 of 160) — at a constant eye distance, so the
 * selected end's view is the yaw-0 member of the orbit:
 *  - yawDeg: rotation of the camera around the pitch, in the selected end's
 *    frame (0 = that end's view, 180 = the opposite end, 90/270 = touchlines).
 *  - elevationDeg: camera angle above the turf; null keeps the base camera's
 *    own angle (Camera C ≈ 33.1°) exactly.
 *  - zoom: multiplies the base framing. Framing never depends on yaw or
 *    elevation, so the pitch does not "breathe" while rotating.
 */
export type GoalViewOrbit = {
  yawDeg: number;
  elevationDeg: number | null;
  zoom: number;
};

export const DEFAULT_GOAL_VIEW_ORBIT: GoalViewOrbit = { yawDeg: 0, elevationDeg: null, zoom: 1 };

/** Tilt and zoom limits. Below ~20° players overlap heavily and the far pitch is undersampled. */
export const GOAL_VIEW_ORBIT_LIMITS = {
  minElevationDeg: 20,
  maxElevationDeg: 75,
  minZoom: 0.6,
  maxZoom: 2,
} as const;

export function normalizeYawDeg(yawDeg: number): number {
  const y = yawDeg % 360;
  return y < 0 ? y + 360 : y;
}

export function clampOrbit(orbit: GoalViewOrbit): GoalViewOrbit {
  const L = GOAL_VIEW_ORBIT_LIMITS;
  return {
    yawDeg: normalizeYawDeg(Number.isFinite(orbit.yawDeg) ? orbit.yawDeg : 0),
    elevationDeg:
      orbit.elevationDeg == null || !Number.isFinite(orbit.elevationDeg)
        ? null
        : Math.min(L.maxElevationDeg, Math.max(L.minElevationDeg, orbit.elevationDeg)),
    zoom: Math.min(L.maxZoom, Math.max(L.minZoom, Number.isFinite(orbit.zoom) ? orbit.zoom : 1)),
  };
}

/** True when the orbit changes nothing: the existing fixed-end view is used exactly. */
export function isIdentityOrbit(orbit: GoalViewOrbit | null | undefined): boolean {
  return !orbit || (normalizeYawDeg(orbit.yawDeg) === 0 && orbit.elevationDeg == null && orbit.zoom === 1);
}

/** The base camera's own elevation angle (Camera C ≈ 33.07°). */
export function baseElevationDeg(camera: GoalViewCameraParams): number {
  return (Math.atan2(camera.heightUnits, camera.distanceBehindUnits + camera.lookAtUnits) * 180) / Math.PI;
}

/**
 * Same look-at point and eye distance as `camera`, at a new elevation. Exact
 * identity when elevationDeg is null.
 */
export function cameraAtElevation(camera: GoalViewCameraParams, elevationDeg: number | null): GoalViewCameraParams {
  if (elevationDeg == null) return camera;
  const eyeDistance = Math.hypot(camera.heightUnits, camera.distanceBehindUnits + camera.lookAtUnits);
  const e = (elevationDeg * Math.PI) / 180;
  return {
    ...camera,
    heightUnits: eyeDistance * Math.sin(e),
    distanceBehindUnits: eyeDistance * Math.cos(e) - camera.lookAtUnits,
  };
}

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

/**
 * Metres per world unit along the pitch: the board's endlines are 156 units
 * apart (x = 2 … 158) and represent a 145 m GAA pitch.
 */
export const GOAL_VIEW_METRES_PER_UNIT = 145 / 156;
const m = (metres: number) => metres / GOAL_VIEW_METRES_PER_UNIT;

/**
 * GAA goal in world units, from the playing-rules dimensions: uprights 6.5 m
 * apart, crossbar 2.5 m above the ground, uprights at least 7 m high (so they
 * extend well above the crossbar). The net is attached to the crossbar and
 * runs back to the ground behind the goal line.
 */
export const GOAL_VIEW_GOAL = {
  /** Endline offset from each board edge (gaa-goal-markings LEFT/RIGHT_ENDLINE_X). */
  endlineInset: 2,
  halfWidth: m(6.5 / 2),
  crossbarHeight: m(2.5),
  postHeight: m(7),
  netDepthGround: m(2),
  netDepthCrossbar: m(1),
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
  /** Orbit in effect (clamped), or null for the plain fixed-end view. */
  readonly orbit: GoalViewOrbit | null;
  /** Camera yaw in radians (0 without an orbit). */
  readonly yawRad: number;
  /**
   * Screen px per board unit along the camera's own ground axes at (a, b):
   * across = camera-right, along = camera-forward. Equals groundScale when
   * there is no orbit.
   */
  cameraGroundScale: (a: number, b: number) => { across: number; along: number };
  /** Distance towards the camera along its ground axis: larger = nearer. Equals b without an orbit. */
  depthOf: (a: number, b: number) => number;
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
  options: { paddingPx?: number; orbit?: GoalViewOrbit | null } = {},
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

  // Orbit: the framing (k, ox, oy) above always comes from the BASE camera,
  // so it is independent of yaw and elevation (no zoom breathing). The orbit
  // camera aims at the same point from the same distance, so that point stays
  // at (ox, oy) with the same scale. Without an orbit this is the old code path.
  const orbit = isIdentityOrbit(options.orbit) ? null : clampOrbit(options.orbit!);
  const view = orbit ? cameraAtElevation(camera, orbit.elevationDeg) : camera;
  const viewBasis = orbit ? cameraBasis(view) : basis;
  const yawRad = orbit ? (orbit.yawDeg * Math.PI) / 180 : 0;
  const cosY = Math.cos(yawRad);
  const sinY = Math.sin(yawRad);
  const kView = orbit ? k * orbit.zoom : k;
  const centreA = W / 2;
  const centreB = L - camera.lookAtUnits;
  const rotateYaw = yawRad !== 0;

  const project = (a: number, b: number, h = 0): Vec2 | null => {
    let pa = a;
    let pb = b;
    if (rotateYaw) {
      // Rotating the pitch by −yaw about the aim point ≡ orbiting the camera by +yaw.
      const da = a - centreA;
      const db = b - centreB;
      pa = centreA + da * cosY + db * sinY;
      pb = centreB - da * sinY + db * cosY;
    }
    const p = projectRaw(view, viewBasis, pa, pb, h);
    return p ? { x: p.x * kView + ox, y: p.y * kView + oy } : null;
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

  // Camera eye on the ground plane (board frame). Without an orbit it sits at
  // (W/2, L + D); with one, the base position orbited by +yaw about the aim point.
  const eyeReach = view.distanceBehindUnits + view.lookAtUnits;
  const eyeA = orbit ? centreA - eyeReach * sinY : W / 2;
  const eyeB = orbit ? centreB + eyeReach * cosY : L + camera.distanceBehindUnits;

  const groundShadowOf = (a: number, b: number, h: number): BoardPoint => {
    // The ray camera→P meets h=0 at t = H / (H - h); clamp so points at/above
    // camera height stay finite.
    const H = view.heightUnits;
    const t = H / Math.max(1e-3, H - h);
    return { a: eyeA + t * (a - eyeA), b: eyeB + t * (b - eyeB) };
  };

  // Camera axes on the ground (board frame): right = (cos, sin), towards the
  // camera = (−sin, cos). Yaw 0: right = +a, towards camera = +b.
  const cameraGroundScale = (a: number, b: number) => {
    if (!orbit) return groundScale(a, b);
    const e = 0.5;
    const p = must(project(a, b));
    const pr = must(project(a + e * cosY, b + e * sinY));
    const pn = must(project(a - e * sinY, b + e * cosY));
    return {
      across: Math.hypot(pr.x - p.x, pr.y - p.y) / e,
      along: Math.hypot(pn.x - p.x, pn.y - p.y) / e,
    };
  };

  const depthOf = (a: number, b: number) =>
    orbit ? (b - centreB) * cosY - (a - centreA) * sinY : b;

  return { camera, screen, project, corners, groundScale, groundShadowOf, orbit, yawRad, cameraGroundScale, depthOf };
}

/**
 * One fixed zoom (≤ 1) at which the whole pitch and both goals stay on screen
 * at EVERY yaw for the given tilt. Used by the explicit "Fit pitch" control:
 * the zoom is chosen once, then stays constant while rotating (no breathing).
 * Portrait side views otherwise crop the goals at Camera C's framing.
 */
export function wholePitchFitZoom(
  camera: GoalViewCameraParams,
  screen: { width: number; height: number },
  elevationDeg: number | null,
  paddingPx = 12,
): number {
  const W = GOAL_VIEW_BOARD_WIDTH;
  const L = GOAL_VIEW_BOARD_LENGTH;
  const G = GOAL_VIEW_GOAL;
  const points: Array<[number, number, number]> = [[0, 0, 0], [W, 0, 0], [W, L, 0], [0, L, 0]];
  for (const b of [G.endlineInset, L - G.endlineInset]) {
    for (const a of [W / 2 - G.halfWidth, W / 2 + G.halfWidth]) points.push([a, b, G.postHeight]);
  }
  const limit = (anchor: number, value: number, max: number) => {
    const d = value - anchor;
    if (Math.abs(d) < 1e-9) return Infinity;
    return d > 0 ? (max - paddingPx - anchor) / d : (paddingPx - anchor) / d;
  };
  let zoom = 1;
  for (let yaw = 0; yaw < 360; yaw += 5) {
    const p = createGoalViewProjection(camera, screen, { orbit: { yawDeg: yaw, elevationDeg, zoom: 1 } });
    const anchor = p.project(W / 2, L - camera.lookAtUnits);
    if (!anchor) continue;
    for (const [a, b, h] of points) {
      const q = p.project(a, b, h);
      if (!q) continue;
      zoom = Math.min(zoom, limit(anchor.x, q.x, screen.width), limit(anchor.y, q.y, screen.height));
    }
  }
  return Math.max(GOAL_VIEW_ORBIT_LIMITS.minZoom, Math.min(1, zoom));
}
