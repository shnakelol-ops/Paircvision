import { describe, expect, it } from "vitest";

import {
  computeSharedDelta,
  orderMembersForGuide,
  translateShape,
  type ShapePoint,
} from "./shapeLockTranslation";

function makePositions(entries: Array<[string, ShapePoint]>): Map<string, ShapePoint> {
  return new Map(entries);
}

function pairwiseDistances(positions: ReadonlyMap<string, ShapePoint>): number[] {
  const ids = [...positions.keys()].sort();
  const result: number[] = [];
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const a = positions.get(ids[i])!;
      const b = positions.get(ids[j])!;
      result.push(Math.hypot(a.x - b.x, a.y - b.y));
    }
  }
  return result;
}

describe("computeSharedDelta", () => {
  it("moves every member by the same delta when nothing hits a bound", () => {
    const start = makePositions([
      ["a", { x: 20, y: 30 }],
      ["b", { x: 25, y: 35 }],
      ["c", { x: 30, y: 40 }],
    ]);
    // Drag anchor 'a' from (20,30) to (28,26): delta (+8,-4).
    const delta = computeSharedDelta(start, { x: 20, y: 30 }, { x: 28, y: 26 });
    expect(delta).toEqual({ dx: 8, dy: -4 });

    const moved = translateShape(start, delta);
    expect(moved.get("b")).toEqual({ x: 33, y: 31 });
    expect(moved.get("c")).toEqual({ x: 38, y: 36 });
  });

  it("preserves relative spacing after a linked translation", () => {
    const start = makePositions([
      ["a", { x: 10, y: 10 }],
      ["b", { x: 40, y: 12 }],
      ["c", { x: 25, y: 38 }],
    ]);
    const before = pairwiseDistances(start);
    const delta = computeSharedDelta(start, { x: 10, y: 10 }, { x: 55, y: 47 });
    const moved = translateShape(start, delta);
    const after = pairwiseDistances(moved);
    for (let i = 0; i < before.length; i += 1) {
      expect(after[i]).toBeCloseTo(before[i], 10);
    }
  });

  it("clamps the shared delta at the boundary without distorting the shape", () => {
    const start = makePositions([
      ["a", { x: 90, y: 50 }],
      ["b", { x: 95, y: 50 }], // b is closest to the right edge (100)
    ]);
    const before = pairwiseDistances(start);
    // Try to drag anchor 'a' far past the right edge.
    const delta = computeSharedDelta(start, { x: 90, y: 50 }, { x: 200, y: 50 });
    // Shared dx is capped so 'b' stops exactly at the edge: 100 - 95 = 5.
    expect(delta.dx).toBe(5);
    expect(delta.dy).toBe(0);

    const moved = translateShape(start, delta);
    expect(moved.get("b")).toEqual({ x: 100, y: 50 });
    expect(moved.get("a")).toEqual({ x: 95, y: 50 });
    // Spacing unchanged despite hitting the boundary.
    expect(pairwiseDistances(moved)).toEqual(before);
  });

  it("clamps against the near edge symmetrically", () => {
    const start = makePositions([
      ["a", { x: 10, y: 8 }], // a closest to the top edge (0) in y
      ["b", { x: 30, y: 20 }],
    ]);
    const delta = computeSharedDelta(start, { x: 10, y: 8 }, { x: 10, y: -50 });
    expect(delta.dy).toBe(-8); // 0 - 8
    const moved = translateShape(start, delta);
    expect(moved.get("a")!.y).toBe(0);
    expect(moved.get("b")!.y).toBe(12);
  });

  it("recomputes from live positions so a fine-tuned member defines the next drag", () => {
    // Fine-tune 'b' individually to a new spot, then start a fresh group drag.
    const afterFineTune = makePositions([
      ["a", { x: 20, y: 20 }],
      ["b", { x: 30, y: 40 }],
    ]);
    const delta = computeSharedDelta(afterFineTune, { x: 20, y: 20 }, { x: 25, y: 25 });
    const moved = translateShape(afterFineTune, delta);
    // The new spacing (from the fine-tuned position) is carried through.
    expect(moved.get("a")).toEqual({ x: 25, y: 25 });
    expect(moved.get("b")).toEqual({ x: 35, y: 45 });
  });
});

describe("orderMembersForGuide", () => {
  it("returns all points including interior ones (3-1-3-style shape)", () => {
    const points: ShapePoint[] = [
      { x: 10, y: 10 },
      { x: 50, y: 10 },
      { x: 90, y: 10 },
      { x: 50, y: 30 }, // interior middle player
      { x: 10, y: 50 },
      { x: 50, y: 50 },
      { x: 90, y: 50 },
    ];
    const ordered = orderMembersForGuide(points);
    expect(ordered).toHaveLength(points.length);
    // Every original point is still present.
    for (const p of points) {
      expect(ordered).toContainEqual(p);
    }
  });

  it("is deterministic and invariant under translation", () => {
    const points: ShapePoint[] = [
      { x: 10, y: 10 },
      { x: 40, y: 15 },
      { x: 25, y: 45 },
      { x: 5, y: 30 },
    ];
    const a = orderMembersForGuide(points);
    const b = orderMembersForGuide(points);
    expect(a).toEqual(b);

    const shifted = points.map((p) => ({ x: p.x + 12, y: p.y - 7 }));
    const orderedShifted = orderMembersForGuide(shifted);
    // Same cyclic order after translating the whole shape.
    expect(orderedShifted).toEqual(a.map((p) => ({ x: p.x + 12, y: p.y - 7 })));
  });

  it("passes small selections through unchanged", () => {
    const two: ShapePoint[] = [
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ];
    expect(orderMembersForGuide(two)).toEqual(two);
  });
});
