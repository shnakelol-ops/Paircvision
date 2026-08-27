import { describe, expect, it } from "vitest";

import { getPlaybackEaseProgress, interpolatePath } from "./routeFollowInterpolation";

describe("getPlaybackEaseProgress", () => {
  it("returns the smoothstep curve t²(3−2t)", () => {
    expect(getPlaybackEaseProgress(0)).toBeCloseTo(0);
    expect(getPlaybackEaseProgress(0.25)).toBeCloseTo(0.25 * 0.25 * (3 - 2 * 0.25));
    expect(getPlaybackEaseProgress(0.5)).toBeCloseTo(0.5);
    expect(getPlaybackEaseProgress(0.75)).toBeCloseTo(0.75 * 0.75 * (3 - 2 * 0.75));
    expect(getPlaybackEaseProgress(1)).toBeCloseTo(1);
  });

  it("clamps out-of-range progress", () => {
    expect(getPlaybackEaseProgress(-1)).toBe(0);
    expect(getPlaybackEaseProgress(2)).toBe(1);
  });

  it("is not linear away from the endpoints (eases in/out)", () => {
    // At t=0.25 the eased value trails the linear value (ease-in);
    // this is exactly the character route-follow was missing before the fix.
    expect(getPlaybackEaseProgress(0.25)).toBeLessThan(0.25);
    expect(getPlaybackEaseProgress(0.75)).toBeGreaterThan(0.75);
  });
});

describe("interpolatePath", () => {
  const straightPath = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
  ];

  it("falls back to a plain lerp when the destination has no stored path", () => {
    const from = { x: 0, y: 0 };
    const to = { x: 10, y: 0 };
    expect(interpolatePath(from, to, 0.5)).toEqual({ x: 5, y: 0 });
  });

  it("walks a stored path proportionally by arc length", () => {
    const from = { x: 0, y: 0 };
    const to = { x: 10, y: 0, path: straightPath };
    expect(interpolatePath(from, to, 0)).toEqual({ x: 0, y: 0 });
    expect(interpolatePath(from, to, 0.5)).toEqual({ x: 5, y: 0 });
    expect(interpolatePath(from, to, 1)).toEqual({ x: 10, y: 0 });
  });

  it("keeps route geometry (stored path points) unchanged regardless of progress curve used by the caller", () => {
    // Feeding the eased progress in (as playback now does) must not require
    // touching the stored path itself — same points, different progress input.
    const from = { x: 0, y: 0 };
    const to = { x: 10, y: 0, path: straightPath };
    const eased = getPlaybackEaseProgress(0.25);
    const point = interpolatePath(from, to, eased);
    expect(point.x).toBeCloseTo(10 * eased);
    expect(point.y).toBe(0);
  });
});

describe("interpolatePath backward-start fix", () => {
  // A Draw Route whose first stored point sits behind Phase A — the
  // realistic case where the coach's initial finger-selection touch landed
  // off-centre rather than dead on the player (a plausible, common touch
  // offset well within the player's selection radius, and — importantly —
  // a valid in-pitch normalized coordinate; an out-of-range x would get
  // silently clamped by clampNormalizedValue and mask the very defect this
  // fixture exists to exercise). The remaining points (50,50) and (70,50)
  // are the actual drawn route, unaffected by the fix.
  const phaseA = { x: 30, y: 50 };
  const offCentreFirstTouch = { x: 27, y: 50 };
  const routeRest = [
    { x: 50, y: 50 },
    { x: 70, y: 50 },
  ];
  const phaseB = { x: 70, y: 50, path: [offCentreFirstTouch, ...routeRest] };

  it("does not travel backwards: x is monotonically non-decreasing across the whole segment", () => {
    // Proven to fail against the pre-fix implementation (x dips from 30.0 to
    // 27.7 at progress=0.05) — this is a genuine regression test, not a
    // vacuous one.
    let previousX = -Infinity;
    for (let progress = 0; progress <= 1.0001; progress += 0.05) {
      const point = interpolatePath(phaseA, phaseB, Math.min(1, progress));
      expect(point.x).toBeGreaterThanOrEqual(previousX - 1e-9);
      previousX = point.x;
    }
  });

  it("starts at progress=0 exactly at Phase A, not the off-centre first touch", () => {
    expect(interpolatePath(phaseA, phaseB, 0)).toEqual({ x: 30, y: 50 });
  });

  it("still ends at progress=1 exactly at Phase B", () => {
    expect(interpolatePath(phaseA, phaseB, 1)).toEqual({ x: 70, y: 50 });
  });

  it("preserves the drawn route after the first point: the fix only replaces path[0]", () => {
    // Effective walked path after the fix is [phaseA(30,50), (50,50), (70,50)]
    // — two 20-unit segments, total arc length 40. At progress=0.5 the walk
    // should land exactly on (50,50), which is routeRest[0] bit-for-bit —
    // proving that point was never touched by the fix (only the discarded
    // off-centre first sample was).
    expect(interpolatePath(phaseA, phaseB, 0.5)).toEqual({ x: 50, y: 50 });
  });

  it("leaves an already-aligned route (first point already at Phase A) behaving as before", () => {
    const alreadyAlignedPath = [
      { x: 30, y: 50 },
      { x: 50, y: 50 },
      { x: 70, y: 50 },
    ];
    const to = { x: 70, y: 50, path: alreadyAlignedPath };
    expect(interpolatePath(phaseA, to, 0)).toEqual({ x: 30, y: 50 });
    expect(interpolatePath(phaseA, to, 0.5)).toEqual({ x: 50, y: 50 });
    expect(interpolatePath(phaseA, to, 1)).toEqual({ x: 70, y: 50 });
  });
});
