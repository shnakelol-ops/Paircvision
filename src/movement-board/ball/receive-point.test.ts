import { describe, expect, it } from "vitest";

import { computeMovementDirection, computeReceivePoint } from "./receive-point";

const OFFSET = 5.123; // matches the real PASS_RECEIVE_OFFSET_WORLD magnitude used in production

describe("computeMovementDirection", () => {
  it("returns null when there is no previous sample (first observation)", () => {
    expect(computeMovementDirection({ x: 10, y: 10 }, null)).toBeNull();
  });

  it("returns null for a stationary token (no delta)", () => {
    expect(computeMovementDirection({ x: 10, y: 10 }, { x: 10, y: 10 })).toBeNull();
  });

  it("returns null for a delta too large to be genuine single-frame movement (stale sample)", () => {
    expect(computeMovementDirection({ x: 100, y: 100 }, { x: 10, y: 10 })).toBeNull();
  });

  it("moving east (+X)", () => {
    const dir = computeMovementDirection({ x: 11, y: 10 }, { x: 10, y: 10 });
    expect(dir).toEqual({ x: 1, y: 0 });
  });

  it("moving west (-X)", () => {
    const dir = computeMovementDirection({ x: 9, y: 10 }, { x: 10, y: 10 });
    expect(dir).toEqual({ x: -1, y: 0 });
  });

  it("moving south (+Y, down the pitch in world space)", () => {
    const dir = computeMovementDirection({ x: 10, y: 11 }, { x: 10, y: 10 });
    expect(dir).toEqual({ x: 0, y: 1 });
  });

  it("moving north (-Y)", () => {
    const dir = computeMovementDirection({ x: 10, y: 9 }, { x: 10, y: 10 });
    expect(dir).toEqual({ x: 0, y: -1 });
  });

  it("moving diagonally is normalized to unit length", () => {
    const dir = computeMovementDirection({ x: 11, y: 11 }, { x: 10, y: 10 });
    expect(dir!.x).toBeCloseTo(Math.SQRT1_2, 10);
    expect(dir!.y).toBeCloseTo(Math.SQRT1_2, 10);
    expect(Math.hypot(dir!.x, dir!.y)).toBeCloseTo(1, 10);
  });

  it("direction rotates smoothly frame-to-frame for a curved run", () => {
    // Receiver curves from moving east to moving north across 3 samples.
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 1, y: 0 }; // east
    const p2 = { x: 1.7, y: -0.7 }; // curving up-and-right
    const p3 = { x: 1.7, y: -1.7 }; // now moving pure north

    const d1 = computeMovementDirection(p1, p0);
    const d2 = computeMovementDirection(p2, p1);
    const d3 = computeMovementDirection(p3, p2);

    expect(d1).toEqual({ x: 1, y: 0 });
    expect(d3).toEqual({ x: 0, y: -1 });
    // The middle sample is a genuine blend, not identical to either end.
    expect(d2!.x).toBeGreaterThan(0);
    expect(d2!.y).toBeLessThan(0);
  });

  it("direction reverses cleanly when the receiver changes direction (right then left)", () => {
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 2, y: 0 }; // moving right
    const p2 = { x: 1, y: 0 }; // now moving left

    expect(computeMovementDirection(p1, p0)).toEqual({ x: 1, y: 0 });
    expect(computeMovementDirection(p2, p1)).toEqual({ x: -1, y: 0 });
  });

  it("receiver stops before arrival: a moving sample followed by a zero-delta sample yields null", () => {
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 1, y: 0 }; // moving
    const p2 = { x: 1, y: 0 }; // stopped — identical to p1

    expect(computeMovementDirection(p1, p0)).toEqual({ x: 1, y: 0 });
    expect(computeMovementDirection(p2, p1)).toBeNull();
  });

  it("does not mutate its inputs", () => {
    const current = { x: 5, y: 5 };
    const previous = { x: 4, y: 4 };
    const currentCopy = { ...current };
    const previousCopy = { ...previous };
    computeMovementDirection(current, previous);
    expect(current).toEqual(currentCopy);
    expect(previous).toEqual(previousCopy);
  });
});

describe("computeReceivePoint", () => {
  const centre = { x: 50, y: 40 };

  it("stationary receiver: falls back exactly to centre, no invented direction", () => {
    expect(computeReceivePoint(centre, null, OFFSET)).toEqual(centre);
  });

  it("moving receiver: offsets by direction * offset", () => {
    const direction = { x: 1, y: 0 };
    expect(computeReceivePoint(centre, direction, OFFSET)).toEqual({ x: centre.x + OFFSET, y: centre.y });
  });

  it("receive point is mathematically ahead of the receiver: dot(receivePoint - centre, direction) > 0", () => {
    const directions = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
      { x: Math.SQRT1_2, y: Math.SQRT1_2 },
      { x: -Math.SQRT1_2, y: 0.6 },
    ];
    for (const direction of directions) {
      const receivePoint = computeReceivePoint(centre, direction, OFFSET);
      const dot = (receivePoint.x - centre.x) * direction.x + (receivePoint.y - centre.y) * direction.y;
      expect(dot).toBeGreaterThan(0);
    }
  });

  it("naturally rotates with the receiver's current direction, not a fixed world offset", () => {
    const east = computeReceivePoint(centre, { x: 1, y: 0 }, OFFSET);
    const west = computeReceivePoint(centre, { x: -1, y: 0 }, OFFSET);
    expect(east.x).toBeGreaterThan(centre.x);
    expect(west.x).toBeLessThan(centre.x);
    expect(east).not.toEqual(west);
  });

  it("does not mutate its inputs", () => {
    const centreCopy = { ...centre };
    const direction = { x: 1, y: 0 };
    const directionCopy = { ...direction };
    computeReceivePoint(centre, direction, OFFSET);
    expect(centre).toEqual(centreCopy);
    expect(direction).toEqual(directionCopy);
  });
});
