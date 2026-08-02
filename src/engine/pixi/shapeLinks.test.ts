import { describe, expect, it } from "vitest";

import {
  computeChainTetherSegments,
  computeTetherSegment,
  tensionToWidthScale,
  type ShapePoint,
} from "./shapeLinks";

describe("computeTetherSegment", () => {
  it("has tension 1 when live distance equals rest distance", () => {
    const from: ShapePoint = { x: 0, y: 0 };
    const to: ShapePoint = { x: 10, y: 0 };
    const segment = computeTetherSegment(from, to, 10, 1);
    expect(segment.tension).toBeCloseTo(1, 10);
  });

  it("reports tension > 1 when the live distance has stretched beyond rest", () => {
    const from: ShapePoint = { x: 0, y: 0 };
    const to: ShapePoint = { x: 20, y: 0 };
    const segment = computeTetherSegment(from, to, 10, 1);
    expect(segment.tension).toBeGreaterThan(1);
  });

  it("reports tension < 1 when the live distance has compressed below rest", () => {
    const from: ShapePoint = { x: 0, y: 0 };
    const to: ShapePoint = { x: 5, y: 0 };
    const segment = computeTetherSegment(from, to, 10, 1);
    expect(segment.tension).toBeLessThan(1);
  });

  it("clamps extreme tension so a segment never vanishes or explodes", () => {
    const from: ShapePoint = { x: 0, y: 0 };
    const farApart = computeTetherSegment(from, { x: 1000, y: 0 }, 10, 1);
    expect(farApart.tension).toBeLessThanOrEqual(2);
    const nearlyCoincident = computeTetherSegment(from, { x: 0.001, y: 0 }, 10, 1);
    expect(nearlyCoincident.tension).toBeGreaterThanOrEqual(0.5);
  });

  it("places the control point on the perpendicular bisector of the segment", () => {
    const from: ShapePoint = { x: 0, y: 0 };
    const to: ShapePoint = { x: 10, y: 0 };
    const segment = computeTetherSegment(from, to, 10, 2);
    // Midpoint x is unchanged; sag is applied purely along the perpendicular (y) axis
    // for a horizontal segment.
    expect(segment.control.x).toBeCloseTo(5, 10);
    expect(Math.abs(segment.control.y)).toBeGreaterThan(0);
  });

  it("sags more when compressed than when stretched, for the same base sag", () => {
    const from: ShapePoint = { x: 0, y: 0 };
    const stretched = computeTetherSegment(from, { x: 15, y: 0 }, 10, 2);
    const compressed = computeTetherSegment(from, { x: 6, y: 0 }, 10, 2);
    expect(Math.abs(compressed.control.y)).toBeGreaterThan(Math.abs(stretched.control.y));
  });

  it("never influences the input points themselves", () => {
    const from: ShapePoint = { x: 3, y: 4 };
    const to: ShapePoint = { x: 9, y: 2 };
    const segment = computeTetherSegment(from, to, 5, 1);
    expect(segment.from).toBe(from);
    expect(segment.to).toBe(to);
    expect(from).toEqual({ x: 3, y: 4 });
    expect(to).toEqual({ x: 9, y: 2 });
  });
});

describe("tensionToWidthScale", () => {
  it("is 1 at resting tension", () => {
    expect(tensionToWidthScale(1)).toBeCloseTo(1, 10);
  });

  it("thins the band when stretched", () => {
    expect(tensionToWidthScale(2)).toBeLessThan(1);
  });

  it("thickens the band when compressed", () => {
    expect(tensionToWidthScale(0.5)).toBeGreaterThan(1);
  });

  it("clamps out-of-range tension before scaling", () => {
    expect(tensionToWidthScale(50)).toBeCloseTo(tensionToWidthScale(2), 10);
    expect(tensionToWidthScale(-3)).toBeCloseTo(tensionToWidthScale(0.5), 10);
  });
});

describe("computeChainTetherSegments", () => {
  it("builds n-1 segments for a chain of n members", () => {
    const live: ShapePoint[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
    ];
    const rest: ShapePoint[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
    ];
    const segments = computeChainTetherSegments(live, rest, 1);
    expect(segments).toHaveLength(2);
    expect(segments[0].from).toEqual(live[0]);
    expect(segments[0].to).toEqual(live[1]);
    expect(segments[1].from).toEqual(live[1]);
    expect(segments[1].to).toEqual(live[2]);
  });

  it("returns no segments for fewer than two members", () => {
    expect(computeChainTetherSegments([{ x: 0, y: 0 }], [{ x: 0, y: 0 }], 1)).toHaveLength(0);
    expect(computeChainTetherSegments([], [], 1)).toHaveLength(0);
  });

  it("skips a pair when either member has no resolvable rest position", () => {
    const live: ShapePoint[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
    ];
    // Middle rest position missing (e.g. a stale/unresolved member).
    const rest: ShapePoint[] = [{ x: 0, y: 0 }, undefined as unknown as ShapePoint, { x: 20, y: 0 }];
    const segments = computeChainTetherSegments(live, rest, 1);
    expect(segments).toHaveLength(0);
  });

  it("keeps relative spacing translation-invariant (both members moved together)", () => {
    const rest: ShapePoint[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    // Both members translated by the same amount — spacing between them is
    // unchanged, so tension should still read as resting (1), regardless of
    // how far the whole unit has moved down the pitch.
    const liveTranslated: ShapePoint[] = [
      { x: 50, y: 30 },
      { x: 60, y: 30 },
    ];
    const segments = computeChainTetherSegments(liveTranslated, rest, 1);
    expect(segments[0].tension).toBeCloseTo(1, 10);
  });
});
