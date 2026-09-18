import { describe, expect, it } from "vitest";

import { computeBallFlightWorldPosition, computePassPositionProgress, computeShotPositionProgress } from "./pass-trajectory";

describe("computePassPositionProgress", () => {
  it("starts at 0 and ends at 1", () => {
    expect(computePassPositionProgress(0)).toBe(0);
    expect(computePassPositionProgress(1)).toBe(1);
  });

  it("matches 2t - t^2 at representative points", () => {
    expect(computePassPositionProgress(0.25)).toBeCloseTo(2 * 0.25 - 0.25 * 0.25, 10);
    expect(computePassPositionProgress(0.5)).toBeCloseTo(0.75, 10);
    expect(computePassPositionProgress(0.75)).toBeCloseTo(2 * 0.75 - 0.75 * 0.75, 10);
  });

  it("has immediate positive departure velocity (derivative 2 - 2t at t=0 is 2)", () => {
    const dt = 0.001;
    const instantaneousVelocity = (computePassPositionProgress(dt) - computePassPositionProgress(0)) / dt;
    expect(instantaneousVelocity).toBeGreaterThan(1.9);
  });

  it("decelerates monotonically toward arrival with no late velocity spike", () => {
    const samples = 20;
    const velocities: number[] = [];
    for (let i = 0; i < samples; i += 1) {
      const t0 = i / samples;
      const t1 = (i + 1) / samples;
      velocities.push(computePassPositionProgress(t1) - computePassPositionProgress(t0));
    }
    for (let i = 1; i < velocities.length; i += 1) {
      expect(velocities[i]!).toBeLessThanOrEqual(velocities[i - 1]! + 1e-9);
    }
  });

  it("clamps values outside [0, 1]", () => {
    expect(computePassPositionProgress(-0.5)).toBe(0);
    expect(computePassPositionProgress(1.5)).toBe(1);
  });
});

describe("computeShotPositionProgress", () => {
  it("matches the original ease-in-out-quad formula exactly (shot behaviour must not change)", () => {
    for (const t of [0, 0.1, 0.25, 0.4, 0.49, 0.5, 0.51, 0.6, 0.75, 0.9, 1]) {
      const expected = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      expect(computeShotPositionProgress(t)).toBeCloseTo(expected, 12);
    }
  });
});

describe("computeBallFlightWorldPosition", () => {
  const fromWorld = { x: 10, y: 20 };
  const toWorld = { x: 50, y: 80 };

  it("passes travel a strictly straight XY line — no arc contribution at any t", () => {
    for (const t of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
      const pos = computeBallFlightWorldPosition({ fromWorld, toWorld, t, isShot: false, shotArcHeightPx: 10 });
      const eased = computePassPositionProgress(t);
      // y must land exactly on the straight lerp — no -sin(pi*t)*arc term at all.
      expect(pos.y).toBeCloseTo(fromWorld.y + (toWorld.y - fromWorld.y) * eased, 12);
      expect(pos.x).toBeCloseTo(fromWorld.x + (toWorld.x - fromWorld.x) * eased, 12);
    }
  });

  it("passes reach fromWorld exactly at t=0 and toWorld exactly at t=1", () => {
    const start = computeBallFlightWorldPosition({ fromWorld, toWorld, t: 0, isShot: false, shotArcHeightPx: 10 });
    const end = computeBallFlightWorldPosition({ fromWorld, toWorld, t: 1, isShot: false, shotArcHeightPx: 10 });
    expect(start).toEqual(fromWorld);
    expect(end).toEqual(toWorld);
  });

  it("shots keep their original arc, unchanged, at the original magnitude", () => {
    const t = 0.5; // arc peaks here: -sin(pi*0.5)*height = -height
    const shotArcHeightPx = 10;
    const pos = computeBallFlightWorldPosition({ fromWorld, toWorld, t, isShot: true, shotArcHeightPx });
    const eased = computeShotPositionProgress(t);
    const expectedY = fromWorld.y + (toWorld.y - fromWorld.y) * eased - Math.sin(Math.PI * t) * shotArcHeightPx;
    expect(pos.y).toBeCloseTo(expectedY, 12);
    expect(pos.y).not.toBeCloseTo(fromWorld.y + (toWorld.y - fromWorld.y) * eased, 3); // arc must be present
  });

  it("shots reach fromWorld exactly at t=0 and toWorld exactly at t=1 (arc vanishes at the endpoints)", () => {
    const shotArcHeightPx = 10;
    const start = computeBallFlightWorldPosition({ fromWorld, toWorld, t: 0, isShot: true, shotArcHeightPx });
    const end = computeBallFlightWorldPosition({ fromWorld, toWorld, t: 1, isShot: true, shotArcHeightPx });
    expect(start).toEqual(fromWorld);
    expect(end.x).toBeCloseTo(toWorld.x, 12);
    expect(end.y).toBeCloseTo(toWorld.y, 12);
  });
});
