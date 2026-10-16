import { describe, expect, it } from "vitest";

import {
  DEFAULT_GOAL_VIEW_CAMERA,
  DEFAULT_GOAL_VIEW_ORBIT,
  GOAL_VIEW_BOARD_LENGTH as L,
  GOAL_VIEW_BOARD_WIDTH as W,
  GOAL_VIEW_ORBIT_LIMITS,
  baseElevationDeg,
  cameraAtElevation,
  clampOrbit,
  createGoalViewProjection,
  isIdentityOrbit,
  cameraForDistance,
  DEFAULT_GOAL_VIEW_DISTANCE,
  wholePitchFitZoom,
  worldToBoard,
  type GoalViewOrbit,
} from "./goalViewCamera";
import { buildGoalGeometry, type Point3 } from "./goalViewGoalGeometry";
import { IDLE_ORBIT_GESTURE, ORBIT_GESTURE, orbitGestureDown, orbitGestureMove, orbitGestureUp } from "./goalViewOrbitGesture";

const CAMERA = DEFAULT_GOAL_VIEW_CAMERA;
const SCREENS = [
  { width: 390, height: 700 },
  { width: 360, height: 520 },
  { width: 780, height: 300 },
];
const TEST_YAWS = [0, 45, 90, 135, 180, 270, 360];
const SAMPLES: Array<[number, number, number]> = [
  [0, 0, 0], [W, L, 0], [50, 80, 0], [12.5, 140, 0], [88, 7, 0], [50, 2, 7.5], [46.5, 158, 2.7],
];
const orbitAt = (yawDeg: number, elevationDeg: number | null = null, zoom = 1): GoalViewOrbit => ({ yawDeg, elevationDeg, zoom });
const goalPoints = (): Point3[] =>
  (["far", "near"] as const).flatMap((end) => {
    const g = buildGoalGeometry(end);
    return [...g.uprights, g.crossbar, ...g.netLines].flatMap((s) => [s.from, s.to]).concat(g.netPanels.flat());
  });

describe("orbit camera: existing Left End / Right End are preserved exactly", () => {
  it.each(SCREENS)("identity orbits reproduce the fixed-end projection bit for bit (%o)", (screen) => {
    const base = createGoalViewProjection(CAMERA, screen);
    for (const orbit of [DEFAULT_GOAL_VIEW_ORBIT, orbitAt(0), orbitAt(360), orbitAt(-720), null]) {
      const p = createGoalViewProjection(CAMERA, screen, { orbit });
      expect(p.orbit).toBeNull();
      expect(p.corners).toEqual(base.corners);
      for (const [a, b, h] of SAMPLES) {
        expect(p.project(a, b, h)).toEqual(base.project(a, b, h));
        expect(p.groundShadowOf(a, b, h)).toEqual(base.groundShadowOf(a, b, h));
        expect(p.cameraGroundScale(a, b)).toEqual(base.groundScale(a, b));
        expect(p.depthOf(a, b)).toBe(b);
      }
    }
  });

  it("Reset Camera state is the identity orbit, and a full 360° turn lands back on it", () => {
    expect(isIdentityOrbit(DEFAULT_GOAL_VIEW_ORBIT)).toBe(true);
    expect(isIdentityOrbit(clampOrbit(orbitAt(360)))).toBe(true);
    expect(isIdentityOrbit(orbitAt(1))).toBe(false);
    expect(isIdentityOrbit(orbitAt(0, 40))).toBe(false);
    expect(isIdentityOrbit(orbitAt(0, null, 1.2))).toBe(false);
  });

  it("orbiting the Left End camera by 180° gives the Right End view", () => {
    const screen = SCREENS[0];
    const left = createGoalViewProjection(CAMERA, screen, { orbit: orbitAt(180) });
    const right = createGoalViewProjection(CAMERA, screen);
    for (const p of [{ x: 0, y: 0 }, { x: 160, y: 100 }, { x: 80, y: 50 }, { x: 120, y: 15 }, { x: 33, y: 71 }]) {
      const l = worldToBoard("left-end", p);
      const r = worldToBoard("right-end", p);
      const ls = left.project(l.a, l.b)!;
      const rs = right.project(r.a, r.b)!;
      expect(ls.x).toBeCloseTo(rs.x, 6);
      expect(ls.y).toBeCloseTo(rs.y, 6);
    }
  });

  it("Camera C's own elevation maps back onto Camera C", () => {
    const c = cameraAtElevation(CAMERA, baseElevationDeg(CAMERA));
    expect(c.heightUnits).toBeCloseTo(CAMERA.heightUnits, 9);
    expect(c.distanceBehindUnits).toBeCloseTo(CAMERA.distanceBehindUnits, 9);
    expect(baseElevationDeg(CAMERA)).toBeCloseTo(33.07, 2);
  });
});

describe("orbit camera: geometry at every angle", () => {
  const elevations = [GOAL_VIEW_ORBIT_LIMITS.minElevationDeg, null, 45, 60, GOAL_VIEW_ORBIT_LIMITS.maxElevationDeg];

  it("no zoom breathing: the aim point stays put at the same scale for every yaw and tilt", () => {
    for (const screen of SCREENS) {
      const base = createGoalViewProjection(CAMERA, screen);
      const anchor = base.project(W / 2, L - CAMERA.lookAtUnits)!;
      const scale = base.groundScale(W / 2, L - CAMERA.lookAtUnits).across;
      for (let yaw = 0; yaw < 360; yaw += 15) {
        for (const elevation of elevations) {
          const p = createGoalViewProjection(CAMERA, screen, { orbit: orbitAt(yaw, elevation) });
          const q = p.project(W / 2, L - CAMERA.lookAtUnits)!;
          expect(q.x).toBeCloseTo(anchor.x, 6);
          expect(q.y).toBeCloseTo(anchor.y, 6);
          expect(p.cameraGroundScale(W / 2, L - CAMERA.lookAtUnits).across).toBeCloseTo(scale, 6);
        }
      }
    }
  });

  it("zoom scales about the aim point only", () => {
    const screen = SCREENS[0];
    const a = createGoalViewProjection(CAMERA, screen, { orbit: orbitAt(90, null, 1) });
    const b = createGoalViewProjection(CAMERA, screen, { orbit: orbitAt(90, null, 1.5) });
    const c = a.project(W / 2, L - CAMERA.lookAtUnits)!;
    const pa = a.project(10, 20)!;
    const pb = b.project(10, 20)!;
    expect(pb.x - c.x).toBeCloseTo((pa.x - c.x) * 1.5, 6);
    expect(pb.y - c.y).toBeCloseTo((pa.y - c.y) * 1.5, 6);
  });

  it("the whole pitch and both goals stay in front of the camera within the tilt limits", () => {
    const points = [...goalPoints(), [0, 0, 0], [W, 0, 0], [W, L, 0], [0, L, 0]] as Point3[];
    for (let yaw = 0; yaw < 360; yaw += 5) {
      for (let elevation = GOAL_VIEW_ORBIT_LIMITS.minElevationDeg; elevation <= GOAL_VIEW_ORBIT_LIMITS.maxElevationDeg; elevation += 5) {
        const p = createGoalViewProjection(CAMERA, SCREENS[0], { orbit: orbitAt(yaw, elevation) });
        for (const point of points) expect(p.project(...point)).not.toBeNull();
        for (const corner of p.corners) expect(Number.isFinite(corner.x) && Number.isFinite(corner.y)).toBe(true);
      }
    }
  });

  it.each(TEST_YAWS)("yaw %i°: each goal's ground decal lands exactly under the upright goal on screen", (yaw) => {
    for (const elevation of elevations) {
      const p = createGoalViewProjection(CAMERA, SCREENS[0], { orbit: orbitAt(yaw, elevation) });
      for (const [a, b, h] of goalPoints()) {
        const direct = p.project(a, b, h)!;
        const shadow = p.groundShadowOf(a, b, h);
        const viaGround = p.project(shadow.a, shadow.b, 0)!;
        expect(viaGround.x).toBeCloseTo(direct.x, 5);
        expect(viaGround.y).toBeCloseTo(direct.y, 5);
      }
    }
  });

  it.each(TEST_YAWS)("yaw %i°: the orbit view is the fixed view of the rotated scene (no new distortion)", (yaw) => {
    const centre = { a: W / 2, b: L - CAMERA.lookAtUnits };
    const r = (yaw * Math.PI) / 180;
    const rotate = (a: number, b: number) => ({
      a: centre.a + (a - centre.a) * Math.cos(r) - (b - centre.b) * Math.sin(r),
      b: centre.b + (a - centre.a) * Math.sin(r) + (b - centre.b) * Math.cos(r),
    });
    for (const elevation of elevations) {
      const fixed = createGoalViewProjection(CAMERA, SCREENS[0], { orbit: orbitAt(0, elevation, 1.0001) });
      const orbit = createGoalViewProjection(CAMERA, SCREENS[0], { orbit: orbitAt(yaw, elevation, 1.0001) });
      for (const [a, b, h] of SAMPLES) {
        const q = rotate(a, b);
        const expected = fixed.project(a, b, h)!;
        const actual = orbit.project(q.a, q.b, h)!;
        expect(actual.x).toBeCloseTo(expected.x, 6);
        expect(actual.y).toBeCloseTo(expected.y, 6);
      }
    }
  });

  it.each(TEST_YAWS)("yaw %i°: turning a token by the camera yaw keeps its number upright on screen", (yaw) => {
    for (const elevation of elevations) {
      const p = createGoalViewProjection(CAMERA, SCREENS[0], { orbit: orbitAt(yaw, elevation) });
      // Texture "up" (0, −1) after a Pixi rotation by yawRad: (sin, −cos).
      const up = { a: Math.sin(p.yawRad), b: -Math.cos(p.yawRad) };
      const lean = (a: number, b: number) => {
        const s0 = p.project(a, b)!;
        const s1 = p.project(a + up.a, b + up.b)!;
        expect(s1.y).toBeLessThan(s0.y); // always points up the screen
        return Math.atan2(s1.x - s0.x, -(s1.y - s0.y));
      };
      // Exactly vertical at the aim point.
      expect(Math.abs(lean(W / 2, L - CAMERA.lookAtUnits))).toBeLessThan(1e-9);
      // Elsewhere the perspective lean is the same as the fixed view shows at
      // the same camera-relative spot (checked via the equivalence test above).
      for (const [a, b] of [[30, 60], [70, 110], [50, 30], [5, 5], [95, 155]]) lean(a, b);
    }
  });

  it.each(TEST_YAWS)("yaw %i°: depth order puts nearer players later (lower on screen)", (yaw) => {
    const p = createGoalViewProjection(CAMERA, SCREENS[0], { orbit: orbitAt(yaw) });
    // Two players on the camera's ground axis through the aim point.
    const towardsCamera = { a: -Math.sin(p.yawRad), b: Math.cos(p.yawRad) };
    const c = { a: W / 2, b: L - CAMERA.lookAtUnits };
    const near = { a: c.a + towardsCamera.a * 30, b: c.b + towardsCamera.b * 30 };
    const far = { a: c.a - towardsCamera.a * 30, b: c.b - towardsCamera.b * 30 };
    expect(p.depthOf(near.a, near.b)).toBeGreaterThan(p.depthOf(far.a, far.b));
    expect(p.project(near.a, near.b)!.y).toBeGreaterThan(p.project(far.a, far.b)!.y);
  });

  it("billboard stretch is computed along the camera's own axes at side views", () => {
    const side = createGoalViewProjection(CAMERA, SCREENS[0], { orbit: orbitAt(90) });
    const s = side.cameraGroundScale(W / 2, L / 2);
    // Ground is foreshortened along the viewing direction, not across it.
    expect(s.across / s.along).toBeGreaterThan(1.5);
  });
});

describe("orbit gesture", () => {
  const down = (x = 100, y = 100, orbit = DEFAULT_GOAL_VIEW_ORBIT) => orbitGestureDown(IDLE_ORBIT_GESTURE, { id: 1, x, y }, orbit);

  it("taps and tiny movements never move the camera", () => {
    const s = down();
    expect(orbitGestureMove(s, { id: 1, x: 103, y: 102 }, CAMERA).orbit).toBeNull();
    expect(orbitGestureUp(s, { id: 1 })).toEqual(IDLE_ORBIT_GESTURE);
  });

  it("horizontal drag rotates with the finger: the near end moves the way the finger moves", () => {
    const { orbit } = orbitGestureMove(down(), { id: 1, x: 140, y: 100 }, CAMERA);
    expect(orbit!.yawDeg).toBeCloseTo(40 * ORBIT_GESTURE.yawDegPerPx, 9);
    expect(orbit!.elevationDeg).toBeNull(); // pure horizontal drag keeps Camera C's tilt exactly
    const before = createGoalViewProjection(CAMERA, SCREENS[0]).project(W / 2, L - 10)!;
    const after = createGoalViewProjection(CAMERA, SCREENS[0], { orbit }).project(W / 2, L - 10)!;
    expect(after.x).toBeGreaterThan(before.x);
  });

  it("dragging down raises the camera, dragging up lowers it, within limits", () => {
    const base = baseElevationDeg(CAMERA);
    expect(orbitGestureMove(down(), { id: 1, x: 100, y: 140 }, CAMERA).orbit!.elevationDeg).toBeCloseTo(base + 10, 9);
    expect(orbitGestureMove(down(), { id: 1, x: 100, y: 60 }, CAMERA).orbit!.elevationDeg).toBeCloseTo(base - 10, 9);
    expect(orbitGestureMove(down(), { id: 1, x: 100, y: 5000 }, CAMERA).orbit!.elevationDeg).toBe(GOAL_VIEW_ORBIT_LIMITS.maxElevationDeg);
    expect(orbitGestureMove(down(), { id: 1, x: 100, y: -5000 }, CAMERA).orbit!.elevationDeg).toBe(GOAL_VIEW_ORBIT_LIMITS.minElevationDeg);
  });

  it("yaw wraps all the way round", () => {
    const { orbit } = orbitGestureMove(down(0, 0, orbitAt(350)), { id: 1, x: 40, y: 0 }, CAMERA);
    expect(orbit!.yawDeg).toBeCloseTo(10, 9);
  });

  it("a second finger stops the drag without a jump; other pointers are ignored", () => {
    let s = down();
    s = orbitGestureDown(s, { id: 2, x: 300, y: 300 }, DEFAULT_GOAL_VIEW_ORBIT);
    expect(orbitGestureMove(s, { id: 1, x: 200, y: 100 }, CAMERA).orbit).toBeNull();
    expect(orbitGestureMove(s, { id: 2, x: 400, y: 300 }, CAMERA).orbit).toBeNull();
    expect(orbitGestureUp(s, { id: 2 })).toEqual(IDLE_ORBIT_GESTURE);
    expect(orbitGestureMove(down(), { id: 9, x: 400, y: 100 }, CAMERA).orbit).toBeNull();
  });
});

describe("Fit pitch (one fixed zoom for every angle)", () => {
  const W2 = W / 2;
  const tops: Point3[] = [];
  for (const b of [2, L - 2]) for (const a of [W2 - 3.5, W2 + 3.5]) tops.push([a, b, 7.5]);

  it.each([
    { width: 360, height: 560 },
    { width: 375, height: 600 },
    { width: 390, height: 640 },
  ])("portrait %o: whole pitch and both goals stay on screen at every yaw, with one zoom", (screen) => {
    for (const elevation of [null, 25, 50, 75]) {
      const zoom = wholePitchFitZoom(CAMERA, screen, elevation);
      expect(zoom).toBeLessThan(1);
      expect(zoom).toBeGreaterThanOrEqual(GOAL_VIEW_ORBIT_LIMITS.minZoom);
      for (let yaw = 0; yaw < 360; yaw += 10) {
        const p = createGoalViewProjection(CAMERA, screen, { orbit: orbitAt(yaw, elevation, zoom) });
        for (const point of [[0, 0, 0], [W, 0, 0], [W, L, 0], [0, L, 0], ...tops] as Point3[]) {
          const q = p.project(...point)!;
          expect(q.x).toBeGreaterThanOrEqual(11);
          expect(q.x).toBeLessThanOrEqual(screen.width - 11);
          expect(q.y).toBeGreaterThanOrEqual(11);
          expect(q.y).toBeLessThanOrEqual(screen.height - 11);
        }
      }
    }
  });

  it("never zooms in", () => {
    expect(wholePitchFitZoom(CAMERA, { width: 2000, height: 2000 }, null)).toBeLessThanOrEqual(1);
  });
});

describe("camera distance presets (Left End / Right End on portrait phones)", () => {
  // Real portrait canvas sizes of both boards at 360 / 375 / 390 px wide.
  const PORTRAIT = [
    { width: 352, height: 563 },
    { width: 367, height: 587 },
    { width: 382, height: 611 },
  ];
  const WIDE = cameraForDistance("wide");
  const BALANCED = cameraForDistance("balanced");
  const NEAR = cameraForDistance("near");
  const allPoints = (): Point3[] => [[0, 0, 0], [W, 0, 0], [W, L, 0], [0, L, 0], ...goalPoints()];
  const centreScale = (p: ReturnType<typeof createGoalViewProjection>) => p.groundScale(W / 2, L - CAMERA.lookAtUnits).across;

  it("exact values recovered from history: Balanced = original Camera C (nearCrop 30), Wide = 0, Near = 65", () => {
    expect(BALANCED).toBe(DEFAULT_GOAL_VIEW_CAMERA);
    expect(DEFAULT_GOAL_VIEW_CAMERA).toEqual({ heightUnits: 112, distanceBehindUnits: 92, lookAtUnits: 80, nearCropUnits: 30 });
    expect(WIDE).toEqual({ ...DEFAULT_GOAL_VIEW_CAMERA, nearCropUnits: 0 });
    expect(NEAR).toEqual({ ...DEFAULT_GOAL_VIEW_CAMERA, nearCropUnits: 65 });
    expect(DEFAULT_GOAL_VIEW_DISTANCE).toBe("balanced");
  });

  it.each(PORTRAIT)("%o: Wide shows the whole pitch and both goals (posts and nets)", (screen) => {
    const p = createGoalViewProjection(WIDE, screen);
    for (const point of allPoints()) {
      const q = p.project(...point)!;
      expect(q.x).toBeGreaterThanOrEqual(0);
      expect(q.x).toBeLessThanOrEqual(screen.width);
      expect(q.y).toBeGreaterThanOrEqual(0);
      expect(q.y).toBeLessThanOrEqual(screen.height);
    }
  });

  it.each(PORTRAIT)("%o: Wide 0.846×, Balanced 1×, Near ≈1.18× — equal steps", (screen) => {
    const b = centreScale(createGoalViewProjection(BALANCED, screen));
    const wide = centreScale(createGoalViewProjection(WIDE, screen)) / b;
    const near = centreScale(createGoalViewProjection(NEAR, screen)) / b;
    expect(wide).toBeCloseTo(0.846, 2);
    expect(near).toBeCloseTo(1 / wide, 2);
  });

  it.each(PORTRAIT)("%o: Fit Pitch keeps the same on-screen size at every distance", (screen) => {
    const fitScale = (cam: typeof BALANCED) =>
      centreScale(createGoalViewProjection(cam, screen, { orbit: orbitAt(0, null, wholePitchFitZoom(cam, screen, null)) }));
    expect(fitScale(WIDE)).toBeCloseTo(fitScale(BALANCED), 6);
    expect(fitScale(NEAR)).toBeCloseTo(fitScale(BALANCED), 6);
  });

  it.each(PORTRAIT)("%o: Fit Pitch from Near still shows the whole pitch and both goals at every yaw", (screen) => {
    const zoom = wholePitchFitZoom(NEAR, screen, null);
    for (let yaw = 0; yaw < 360; yaw += 15) {
      const p = createGoalViewProjection(NEAR, screen, { orbit: orbitAt(yaw, null, zoom) });
      for (const point of [[0, 0, 0], [W, 0, 0], [W, L, 0], [0, L, 0]] as Point3[]) {
        const q = p.project(...point)!;
        expect(q.x).toBeGreaterThanOrEqual(0);
        expect(q.x).toBeLessThanOrEqual(screen.width);
        expect(q.y).toBeGreaterThanOrEqual(0);
        expect(q.y).toBeLessThanOrEqual(screen.height);
      }
    }
  });

  it("elevation and perspective proportions are identical at every distance (framing only)", () => {
    const screen = PORTRAIT[2];
    const proportions = [WIDE, BALANCED, NEAR].map((cam) => {
      expect(baseElevationDeg(cam)).toBeCloseTo(baseElevationDeg(BALANCED), 12);
      const p = createGoalViewProjection(cam, screen);
      const y = (b: number) => p.project(W / 2, b)!.y;
      return {
        farOverNear: (p.project(W, 0)!.x - p.project(0, 0)!.x) / (p.project(W, L)!.x - p.project(0, L)!.x),
        halfwayDown: (y(L / 2) - y(0)) / (y(L) - y(0)),
      };
    });
    for (const q of proportions) {
      expect(q.farOverNear).toBeCloseTo(proportions[1].farOverNear, 12);
      expect(q.halfwayDown).toBeCloseTo(proportions[1].halfwayDown, 12);
    }
  });

  it.each(["wide", "near"] as const)("%s: no zoom breathing while rotating (aim point fixed, scale constant)", (d) => {
    const cam = cameraForDistance(d);
    const screen = PORTRAIT[1];
    const base = createGoalViewProjection(cam, screen);
    const anchor = base.project(W / 2, L - cam.lookAtUnits)!;
    for (let yaw = 0; yaw < 360; yaw += 30) {
      const p = createGoalViewProjection(cam, screen, { orbit: orbitAt(yaw, 45) });
      const q = p.project(W / 2, L - cam.lookAtUnits)!;
      expect(q.x).toBeCloseTo(anchor.x, 6);
      expect(q.y).toBeCloseTo(anchor.y, 6);
      expect(p.cameraGroundScale(W / 2, L - cam.lookAtUnits).across).toBeCloseTo(centreScale(base), 6);
    }
  });
});
