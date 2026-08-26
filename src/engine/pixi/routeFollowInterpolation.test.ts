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
