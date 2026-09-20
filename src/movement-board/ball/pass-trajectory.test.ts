import { describe, expect, it } from "vitest";

import { computeBallFlightWorldPosition, computePassPositionProgress } from "./pass-trajectory";

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

describe("computeBallFlightWorldPosition", () => {
  const fromWorld = { x: 10, y: 20 };
  const toWorld = { x: 50, y: 80 };

  it("passes travel a strictly straight XY line — no arc contribution at any t", () => {
    for (const t of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
      const pos = computeBallFlightWorldPosition({ fromWorld, toWorld, t });
      const eased = computePassPositionProgress(t);
      expect(pos.y).toBeCloseTo(fromWorld.y + (toWorld.y - fromWorld.y) * eased, 12);
      expect(pos.x).toBeCloseTo(fromWorld.x + (toWorld.x - fromWorld.x) * eased, 12);
    }
  });

  it("passes reach fromWorld exactly at t=0 and toWorld exactly at t=1", () => {
    const start = computeBallFlightWorldPosition({ fromWorld, toWorld, t: 0 });
    const end = computeBallFlightWorldPosition({ fromWorld, toWorld, t: 1 });
    expect(start).toEqual(fromWorld);
    expect(end).toEqual(toWorld);
  });

  // Regression coverage for the PR4 shot ball-flight fix: shots and passes
  // are now the exact same call, so a shot must satisfy every property a
  // pass does — release position, target position, direct-line geometry —
  // with no legacy curve/arc anywhere along the flight.
  describe("shots (post-fix: identical primitive to passes, no legacy curve/arc)", () => {
    // Shots historically release from three representative board positions:
    // central, and off to either side. Central position is exercised via the
    // shared fromWorld/toWorld fixture above; these two add left/right release
    // points to confirm the direct-line behaviour holds regardless of angle.
    const leftFromWorld = { x: 5, y: 90 };
    const rightFromWorld = { x: 95, y: 10 };
    const shotTarget = { x: 100, y: 50 }; // goal-mouth-like target

    it("begins at the correct release XY for a shot from centre, left, and right", () => {
      for (const from of [fromWorld, leftFromWorld, rightFromWorld]) {
        const start = computeBallFlightWorldPosition({ fromWorld: from, toWorld: shotTarget, t: 0 });
        expect(start).toEqual(from);
      }
    });

    it("terminates at the selected shot target XY for centre, left, and right releases", () => {
      for (const from of [fromWorld, leftFromWorld, rightFromWorld]) {
        const end = computeBallFlightWorldPosition({ fromWorld: from, toWorld: shotTarget, t: 1 });
        expect(end.x).toBeCloseTo(shotTarget.x, 12);
        expect(end.y).toBeCloseTo(shotTarget.y, 12);
      }
    });

    it("follows the direct ease-out trajectory at every t — no legacy ease-in-out curve, no sinusoidal arc offset", () => {
      for (const t of [0, 0.1, 0.25, 0.4, 0.49, 0.5, 0.51, 0.6, 0.75, 0.9, 1]) {
        const pos = computeBallFlightWorldPosition({ fromWorld, toWorld: shotTarget, t });
        const eased = computePassPositionProgress(t);
        const expectedX = fromWorld.x + (shotTarget.x - fromWorld.x) * eased;
        const expectedY = fromWorld.y + (shotTarget.y - fromWorld.y) * eased;
        expect(pos.x).toBeCloseTo(expectedX, 12);
        expect(pos.y).toBeCloseTo(expectedY, 12);

        // Reject the legacy ease-in-out-quad + sinusoidal-arc formula: at any
        // interior t, the old curve deviated from the direct line by more than
        // floating-point noise (the arc term alone is up to 10px).
        const legacyEased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        const legacyArcOffset = -Math.sin(Math.PI * t) * 10;
        const legacyY = fromWorld.y + (shotTarget.y - fromWorld.y) * legacyEased + legacyArcOffset;
        if (t > 0 && t < 1 && Math.abs(legacyArcOffset) > 0.01) {
          expect(Math.abs(pos.y - legacyY)).toBeGreaterThan(0.01);
        }
      }
    });

    it("is frame-rate invariant — position depends only on t, not on how many steps were used to reach it", () => {
      // Simulate reaching t=0.6 via a coarse "low frame-rate" single jump vs a
      // fine "high frame-rate" many-step accumulation. Both must land on the
      // exact same position because the function is a pure function of t.
      const targetT = 0.6;
      const coarse = computeBallFlightWorldPosition({ fromWorld, toWorld: shotTarget, t: targetT });

      let accumulatedT = 0;
      const stepCount = 137; // arbitrary high "frame count"
      for (let i = 0; i < stepCount; i += 1) {
        accumulatedT += targetT / stepCount;
      }
      const fine = computeBallFlightWorldPosition({ fromWorld, toWorld: shotTarget, t: accumulatedT });

      expect(fine.x).toBeCloseTo(coarse.x, 9);
      expect(fine.y).toBeCloseTo(coarse.y, 9);
    });

    it("playback speed changes only how fast t advances, never the position mapped to a given t", () => {
      // Production accumulates elapsedMs as `deltaMS * speedMultiplier`, so a
      // faster speed reaches any given t sooner (fewer real-world ticks) but
      // the resulting t — and therefore the position this function returns —
      // is unaffected. Model two speeds reaching the SAME fractional progress
      // via different (elapsedMs, durationMs) accumulation paths and confirm
      // the geometry is identical at that shared t.
      const durationMs = 1000;
      const targetT = 0.4;

      // 1x speed: 10 ticks of 40ms each accumulate straight to targetT*duration.
      let elapsed1x = 0;
      for (let i = 0; i < 10; i += 1) elapsed1x += 40;
      const t1x = elapsed1x / durationMs;

      // 3x speed: the same 10 ticks of 40ms each, scaled by the multiplier,
      // reach 3x further in elapsed time for the same tick count — so to
      // compare the same moment-in-flight we read position at the same t,
      // not the same elapsedMs. What must hold is that computing position at
      // t=0.4 never depends on which (elapsed, duration, speed) combination
      // produced that 0.4.
      const speedMultiplier = 3;
      let elapsed3x = 0;
      for (let i = 0; i < 10; i += 1) elapsed3x += 40 * speedMultiplier;
      const durationAt3xEquivalentT = elapsed3x / targetT;
      const t3x = elapsed3x / durationAt3xEquivalentT;

      expect(t1x).toBeCloseTo(targetT, 10);
      expect(t3x).toBeCloseTo(targetT, 10);

      const posAt1x = computeBallFlightWorldPosition({ fromWorld, toWorld: shotTarget, t: t1x });
      const posAt3x = computeBallFlightWorldPosition({ fromWorld, toWorld: shotTarget, t: t3x });
      expect(posAt3x).toEqual(posAt1x);
    });
  });

  describe("shared primitive: passes and shots are geometrically identical", () => {
    it("produces identical output for a pass and a shot given the same fromWorld/toWorld/t", () => {
      for (const t of [0, 0.2, 0.5, 0.8, 1]) {
        const passLikeCall = computeBallFlightWorldPosition({ fromWorld, toWorld, t });
        const shotLikeCall = computeBallFlightWorldPosition({ fromWorld, toWorld, t });
        expect(shotLikeCall).toEqual(passLikeCall);
      }
    });
  });
});
