import { describe, expect, it } from "vitest";

import { computePassPositionProgress } from "./pass-trajectory";

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
