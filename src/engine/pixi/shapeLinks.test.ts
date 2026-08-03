import { describe, expect, it } from "vitest";

import {
  computeChainTetherSegments,
  computeTetherSegment,
  computeUnitTension,
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

  it("still draws every segment when a member's rest position is unresolved", () => {
    const live: ShapePoint[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
    ];
    // Middle rest position missing (e.g. a stale/unresolved member). The
    // chain's connectivity is a live-position concern only, so both segments
    // still draw — just at the neutral resting tension, since no rest pair
    // is resolvable at all to derive a real reading from.
    const rest: ShapePoint[] = [{ x: 0, y: 0 }, undefined as unknown as ShapePoint, { x: 20, y: 0 }];
    const segments = computeChainTetherSegments(live, rest, 1);
    expect(segments).toHaveLength(2);
    expect(segments[0].tension).toBeCloseTo(1, 10);
    expect(segments[1].tension).toBeCloseTo(1, 10);
  });

  it("only omits a segment when one of its own live points is unresolved", () => {
    const live: ShapePoint[] = [{ x: 0, y: 0 }, undefined as unknown as ShapePoint, { x: 20, y: 0 }];
    const rest: ShapePoint[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
    ];
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

  it("propagates one shared tension across the whole chain rather than per pair", () => {
    const rest: ShapePoint[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
    ];
    // The first pair stretched to double its rest distance and the second
    // pair collapsed to zero — a per-pair model would show very different
    // tension for each segment. The whole unit should read as one
    // consistent tension instead: here, total live length (20) equals total
    // rest length (20), so both segments should read exactly resting (1).
    const live: ShapePoint[] = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 0 },
    ];
    const segments = computeChainTetherSegments(live, rest, 1);
    expect(segments).toHaveLength(2);
    expect(segments[0].tension).toBeCloseTo(segments[1].tension, 10);
    expect(segments[0].tension).toBeCloseTo(1, 10);
  });

  it("adds exactly one closing segment (last back to first) when closed", () => {
    // The 4-5-6-7 square from the spec: an open chain gives 3 segments
    // (4-5, 5-6, 6-7); closing it adds exactly one more (7-4) and nothing else.
    const square: ShapePoint[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const open = computeChainTetherSegments(square, square, 1, false);
    expect(open).toHaveLength(3);

    const closed = computeChainTetherSegments(square, square, 1, true);
    expect(closed).toHaveLength(4);
    // The first 3 segments are unchanged; the 4th is the new closing edge.
    expect(closed[0].from).toEqual(square[0]);
    expect(closed[0].to).toEqual(square[1]);
    expect(closed[1].from).toEqual(square[1]);
    expect(closed[1].to).toEqual(square[2]);
    expect(closed[2].from).toEqual(square[2]);
    expect(closed[2].to).toEqual(square[3]);
    expect(closed[3].from).toEqual(square[3]);
    expect(closed[3].to).toEqual(square[0]);
  });

  it("does not close a chain of fewer than 3 members (a 2-member loop is meaningless)", () => {
    const pair: ShapePoint[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    const segments = computeChainTetherSegments(pair, pair, 1, true);
    expect(segments).toHaveLength(1);
  });

  it("defaults to an open chain when closed is omitted", () => {
    const live: ShapePoint[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ];
    expect(computeChainTetherSegments(live, live, 1)).toHaveLength(2);
  });

  it("includes the closing pair in the shared tension reading", () => {
    const rest: ShapePoint[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ];
    // Every pair (including the closing 3rd-back-to-1st edge) has doubled in
    // live distance, so the whole loop should read as uniformly stretched.
    const live: ShapePoint[] = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 20 },
    ];
    const segments = computeChainTetherSegments(live, rest, 1, true);
    expect(segments).toHaveLength(3);
    for (const segment of segments) {
      expect(segment.tension).toBeCloseTo(2, 10);
    }
  });
});

describe("computeUnitTension", () => {
  it("is 1 when total live length equals total rest length", () => {
    const rest: ShapePoint[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
    ];
    const live: ShapePoint[] = [
      { x: 0, y: 0 },
      { x: 15, y: 0 },
      { x: 20, y: 0 },
    ];
    expect(computeUnitTension(live, rest)).toBeCloseTo(1, 10);
  });

  it("is greater than 1 when the whole chain has stretched overall", () => {
    const rest: ShapePoint[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
    ];
    const live: ShapePoint[] = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 40, y: 0 },
    ];
    expect(computeUnitTension(live, rest)).toBeGreaterThan(1);
  });

  it("defaults to 1 (resting) when no rest pair is resolvable", () => {
    const live: ShapePoint[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    const rest: ShapePoint[] = [{ x: 0, y: 0 }, undefined as unknown as ShapePoint];
    expect(computeUnitTension(live, rest)).toBe(1);
  });

  it("clamps like a single segment would", () => {
    const rest: ShapePoint[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    const live: ShapePoint[] = [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
    ];
    expect(computeUnitTension(live, rest)).toBeLessThanOrEqual(2);
  });
});
