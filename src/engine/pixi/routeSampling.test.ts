import { describe, expect, it } from "vitest";

import { sampleRoutePoints } from "./createTacticalPadLiteSurface";
import type { RoutePoint } from "./movement/basicRouteFollow";

// Flat Catmull-Rom tension of 1 is the textbook conversion from Catmull-Rom
// to cubic-Bezier control points: c1 = p1 + (p2-p0)/6, c2 = p2 - (p3-p1)/6.
// Used here to independently predict what sampleRoutePoints should now
// produce, without depending on any internal helper of the module under test.
function flatTensionBezierMidpoint(p0: RoutePoint, p1: RoutePoint, p2: RoutePoint, p3: RoutePoint): RoutePoint {
  const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
  const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
  const t = 0.5;
  const u = 1 - t;
  return {
    x: u * u * u * p1.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p2.x,
    y: u * u * u * p1.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p2.y,
  };
}

describe("sampleRoutePoints — flat Catmull-Rom tension (matches Tactical Play)", () => {
  it("uses tension 1 at a sharp local turn — no adaptive reduction", () => {
    // A sharp ~90 degree turn: previously routeCornerTensionScale would have
    // scaled this corner's tension well below 1 (down toward its 0.28 floor).
    // With flat tension, the sampled curve must match the textbook tension=1
    // Bezier construction exactly, not some reduced value.
    const p0: RoutePoint = { x: 0, y: 0 };
    const p1: RoutePoint = { x: 10, y: 0 };
    const p2: RoutePoint = { x: 10, y: 10 };
    const p3: RoutePoint = { x: 0, y: 10 };

    const sampled = sampleRoutePoints([p0, p1, p2, p3]);

    // BASIC_ROUTE_SAMPLES_PER_SEGMENT = 16, so segment [p1,p2]'s own midpoint
    // (t=0.5 on that segment) is not necessarily a single array index once
    // segments are concatenated and re-deduped; instead, find the sampled
    // point closest to the independently-predicted flat-tension midpoint of
    // the [p1,p2] segment and require it to land on it almost exactly. If the
    // adaptive scale were still active, the true curve midpoint would sit
    // measurably closer to the straight chord (5, 5) — a much smaller offset
    // than the flat-tension prediction below.
    const expected = flatTensionBezierMidpoint(p0, p1, p2, p3);
    const distances = sampled.map((point) => Math.hypot(point.x - expected.x, point.y - expected.y));
    const closest = Math.min(...distances);
    expect(closest).toBeLessThan(0.05);

    // And that predicted point must itself be meaningfully off the straight
    // chord midpoint (5, 5) — otherwise this assertion would be vacuous.
    const straightChordMidpoint = { x: 5, y: 5 };
    const offsetFromChord = Math.hypot(expected.x - straightChordMidpoint.x, expected.y - straightChordMidpoint.y);
    expect(offsetFromChord).toBeGreaterThan(0.5);
  });

  it("starts exactly at the first input point and ends exactly at the last", () => {
    const points: RoutePoint[] = [
      { x: 12, y: 40 },
      { x: 30, y: 55 },
      { x: 48, y: 42 },
      { x: 65, y: 60 },
    ];
    const sampled = sampleRoutePoints(points);
    expect(sampled[0]).toEqual(points[0]);
    expect(sampled[sampled.length - 1]).toEqual(points[points.length - 1]);
  });

  it("leaves a straight route unchanged (collinear in, collinear out)", () => {
    const points: RoutePoint[] = [
      { x: 10, y: 20 },
      { x: 20, y: 20 },
      { x: 30, y: 20 },
      { x: 40, y: 20 },
    ];
    const sampled = sampleRoutePoints(points);
    expect(sampled.length).toBeGreaterThan(2);
    for (const point of sampled) {
      // Every sampled point must sit on y=20 (within float tolerance) — a
      // straight line run through Catmull-Rom at any tension stays straight,
      // so this also holds before/after the change; it guards against a
      // regression that bends straight routes.
      expect(point.y).toBeCloseTo(20, 6);
      expect(point.x).toBeGreaterThanOrEqual(10 - 1e-6);
      expect(point.x).toBeLessThanOrEqual(40 + 1e-6);
    }
  });

  it("produces a smooth, valid path for a normal curved run", () => {
    const points: RoutePoint[] = [
      { x: 15, y: 30 },
      { x: 25, y: 45 },
      { x: 40, y: 50 },
      { x: 55, y: 40 },
      { x: 65, y: 55 },
    ];
    const sampled = sampleRoutePoints(points);

    expect(sampled.length).toBeGreaterThan(points.length);
    for (const point of sampled) {
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
    }
    // The route's own waypoints are interpolated exactly (Catmull-Rom passes
    // through every input point) — each must appear in the sampled output.
    for (const waypoint of points) {
      const hit = sampled.some((point) => Math.hypot(point.x - waypoint.x, point.y - waypoint.y) < 1e-9);
      expect(hit).toBe(true);
    }
  });

  it("keeps a deliberate sharp V-turn recognisable and bounded (no overshoot loop)", () => {
    // A hard V: straight out, then a sharp turn back roughly the way it came.
    const points: RoutePoint[] = [
      { x: 0, y: 50 },
      { x: 20, y: 50 },
      { x: 22, y: 52 },
      { x: 5, y: 60 },
    ];
    const sampled = sampleRoutePoints(points);

    // The turn must still be visible: the path's maximum y must clear the
    // pre-turn y (50) by a real margin, not collapse back toward it.
    const maxY = Math.max(...sampled.map((point) => point.y));
    expect(maxY).toBeGreaterThan(55);

    // No overshoot loop: flat (tension=1) Catmull-Rom is the same setting
    // Tactical Play already ships, and bulges modestly (roughly 15-25% of
    // local segment scale) at a sharp corner rather than looping. Bound every
    // sampled point to a generous margin around the control polygon so a
    // genuine blow-up/self-intersection would fail this test.
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const margin = 15; // generous relative to the ~2-20 unit segment scale above
    const minX = Math.min(...xs) - margin;
    const maxX = Math.max(...xs) + margin;
    const minY = Math.min(...ys) - margin;
    const maxYBound = Math.max(...ys) + margin;
    for (const point of sampled) {
      expect(point.x).toBeGreaterThanOrEqual(minX);
      expect(point.x).toBeLessThanOrEqual(maxX);
      expect(point.y).toBeGreaterThanOrEqual(minY);
      expect(point.y).toBeLessThanOrEqual(maxYBound);
    }
  });
});
