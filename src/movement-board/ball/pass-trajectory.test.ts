import { describe, expect, it } from "vitest";

import { computePassEffectiveTarget, computePassPositionProgress } from "./pass-trajectory";

describe("computePassEffectiveTarget", () => {
  const targetAtStart = { x: 20, y: 50 };
  const liveTarget = { x: 60, y: 10 };

  it("t=0 resolves exactly to the position captured at pass start", () => {
    expect(computePassEffectiveTarget(targetAtStart, liveTarget, 0)).toEqual(targetAtStart);
  });

  it("t=1 resolves exactly to the live receiver position (arrival guarantee)", () => {
    expect(computePassEffectiveTarget(targetAtStart, liveTarget, 1)).toEqual(liveTarget);
  });

  it("t=1 is exact even when float rounding could otherwise introduce drift", () => {
    const trickyStart = { x: 0.123456789, y: 12.345678901234 };
    const trickyLive = { x: 87.654321, y: 5.6789012345678 };
    expect(computePassEffectiveTarget(trickyStart, trickyLive, 1)).toEqual(trickyLive);
  });

  it("t>1 (clamped elapsed/duration edge case) still resolves exactly to the live position", () => {
    expect(computePassEffectiveTarget(targetAtStart, liveTarget, 1.2)).toEqual(liveTarget);
  });

  it("live-target influence increases monotonically as t grows from 0 to 1", () => {
    const distanceFromStart = (t: number) => {
      const effective = computePassEffectiveTarget(targetAtStart, liveTarget, t);
      return Math.hypot(effective.x - targetAtStart.x, effective.y - targetAtStart.y);
    };

    const samples = [0, 0.25, 0.5, 0.75, 1].map(distanceFromStart);
    for (let i = 1; i < samples.length; i += 1) {
      expect(samples[i]).toBeGreaterThan(samples[i - 1]);
    }
  });

  it("t=0.25/0.5/0.75 stay weighted toward the start position (t² blend, not linear)", () => {
    // t² means at the flight's midpoint (t=0.5) live influence is only 25%,
    // not 50% — this is what keeps the early/mid flight visually direct.
    const at025 = computePassEffectiveTarget(targetAtStart, liveTarget, 0.25);
    const at05 = computePassEffectiveTarget(targetAtStart, liveTarget, 0.5);
    const at075 = computePassEffectiveTarget(targetAtStart, liveTarget, 0.75);

    expect(at025).toEqual({
      x: targetAtStart.x + (liveTarget.x - targetAtStart.x) * 0.0625,
      y: targetAtStart.y + (liveTarget.y - targetAtStart.y) * 0.0625,
    });
    expect(at05).toEqual({
      x: targetAtStart.x + (liveTarget.x - targetAtStart.x) * 0.25,
      y: targetAtStart.y + (liveTarget.y - targetAtStart.y) * 0.25,
    });
    expect(at075).toEqual({
      x: targetAtStart.x + (liveTarget.x - targetAtStart.x) * 0.5625,
      y: targetAtStart.y + (liveTarget.y - targetAtStart.y) * 0.5625,
    });
  });

  it("returns identical target when start and live positions match (stationary receiver)", () => {
    const stationary = { x: 30, y: 30 };
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      expect(computePassEffectiveTarget(stationary, stationary, t)).toEqual(stationary);
    }
  });

  it("does not mutate either input point", () => {
    const start = { x: 5, y: 5 };
    const live = { x: 90, y: 90 };
    const startCopy = { ...start };
    const liveCopy = { ...live };

    computePassEffectiveTarget(start, live, 0.5);

    expect(start).toEqual(startCopy);
    expect(live).toEqual(liveCopy);
  });
});

describe("computePassPositionProgress", () => {
  // Ease-out-quad (2t - t^2): fastest at release, decelerating into arrival
  // — investigation finding was that the prior ease-in-out curve made the
  // ball appear to hesitate at the passer's foot and trail the receiver
  // through the first ~30% of the flight regardless of target-blend choice.
  it("locks the exact ease-out-quad values at t=0/.25/.5/.75/1", () => {
    expect(computePassPositionProgress(0)).toBe(0);
    expect(computePassPositionProgress(0.25)).toBeCloseTo(0.4375, 10);
    expect(computePassPositionProgress(0.5)).toBeCloseTo(0.75, 10);
    expect(computePassPositionProgress(0.75)).toBeCloseTo(0.9375, 10);
    expect(computePassPositionProgress(1)).toBe(1);
  });

  it("passProgress(0) = 0 and passProgress(1) = 1 — the arrival-guarantee invariant", () => {
    expect(computePassPositionProgress(0)).toBe(0);
    expect(computePassPositionProgress(1)).toBe(1);
  });

  it("is monotonically increasing across the flight (no reversal/wobble)", () => {
    const samples = [0, 0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 1].map(computePassPositionProgress);
    for (let i = 1; i < samples.length; i += 1) {
      expect(samples[i]).toBeGreaterThan(samples[i - 1]);
    }
  });

  it("progresses faster than elapsed time early (immediate departure), slower late (decelerating arrival)", () => {
    // Distinguishes this from linear (progress === t) and from the old
    // ease-in-out curve (which is *slower* than t for t<0.5).
    expect(computePassPositionProgress(0.25)).toBeGreaterThan(0.25);
    expect(computePassPositionProgress(0.75)).toBeGreaterThan(0.75);
  });

  it("differs from the old ease-in-out curve at the same t (confirms the swap took effect)", () => {
    const oldEaseInOut = (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);
    for (const t of [0.1, 0.25, 0.4, 0.6, 0.75, 0.9]) {
      expect(computePassPositionProgress(t)).not.toBeCloseTo(oldEaseInOut(t), 5);
    }
  });
});
