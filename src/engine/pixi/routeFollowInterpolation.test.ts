import { describe, expect, it } from "vitest";

import {
  getPlaybackEaseProgress,
  interpolatePath,
  PHASE_SEGMENT_MAX_DURATION_MS,
  PHASE_SEGMENT_SHORT_DISTANCE_THRESHOLD,
  resolveMovementDistance,
  resolvePhaseSegmentDurationMs,
  resolveSegmentMaxMovementDistance,
} from "./routeFollowInterpolation";

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

describe("resolveMovementDistance", () => {
  it("uses straight-line displacement when there is no stored route", () => {
    expect(resolveMovementDistance({ x: 0, y: 0 }, { x: 10, y: 0 })).toBe(10);
    expect(resolveMovementDistance({ x: 30, y: 50 }, { x: 70, y: 50 })).toBe(40);
  });

  it("uses the actual route arc length — materially longer than the chord — when a Draw Route exists", () => {
    const from = { x: 0, y: 0 };
    const to = {
      x: 20,
      y: 0,
      path: [
        { x: 0, y: 0 },
        { x: 10, y: 15 },
        { x: 20, y: 0 },
      ],
    };
    const straightLineDisplacement = 20;
    const expectedArcLength = 2 * Math.hypot(10, 15); // ~36.06
    const distance = resolveMovementDistance(from, to);
    expect(distance).toBeCloseTo(expectedArcLength, 6);
    expect(distance).toBeGreaterThan(straightLineDisplacement);
  });

  it("falls back to straight-line distance for a one-point or degenerate route", () => {
    expect(resolveMovementDistance({ x: 0, y: 0 }, { x: 10, y: 0, path: [{ x: 5, y: 5 }] })).toBe(10);
    // Every stored point identical (zero arc length) — falls back safely.
    expect(
      resolveMovementDistance(
        { x: 0, y: 0 },
        {
          x: 10,
          y: 0,
          path: [
            { x: 5, y: 5 },
            { x: 5, y: 5 },
          ],
        },
      ),
    ).toBe(10);
  });
});

describe("resolveSegmentMaxMovementDistance", () => {
  it("returns the longest mover among several players", () => {
    const fromSnapshot = {
      players: [
        { id: "short", x: 0, y: 0 },
        { id: "medium", x: 0, y: 0 },
        { id: "long", x: 0, y: 0 },
      ],
      football: [],
    };
    const toSnapshot = {
      players: [
        { id: "short", x: 4, y: 0 },
        { id: "medium", x: 18, y: 0 },
        { id: "long", x: 55, y: 0 },
      ],
      football: [],
    };
    expect(resolveSegmentMaxMovementDistance(fromSnapshot, toSnapshot)).toBe(55);
  });

  it("a free ball moving farther than every player determines the max", () => {
    const fromSnapshot = {
      players: [{ id: "p1", x: 0, y: 0 }],
      football: [{ id: "ball", x: 0, y: 0, isFree: true, attachedPlayerId: null }],
    };
    const toSnapshot = {
      players: [{ id: "p1", x: 5, y: 0 }],
      football: [{ id: "ball", x: 60, y: 0, isFree: true, attachedPlayerId: null }],
    };
    expect(resolveSegmentMaxMovementDistance(fromSnapshot, toSnapshot)).toBe(60);
  });

  it("excludes a ball attached to the same holder for the whole segment (redundant with the holder's own distance)", () => {
    const fromSnapshot = {
      players: [{ id: "p1", x: 0, y: 0 }],
      football: [{ id: "ball", x: 0, y: 0, isFree: false, attachedPlayerId: "p1" }],
    };
    const toSnapshot = {
      players: [{ id: "p1", x: 3, y: 0 }],
      // Synthetic large ball-position gap to isolate the exclusion rule —
      // an attached ball's raw snapshot coordinates are not what drives its
      // rendering (it just follows the holder's hand every frame), so this
      // must not leak into the segment's timing.
      football: [{ id: "ball", x: 80, y: 0, isFree: false, attachedPlayerId: "p1" }],
    };
    expect(resolveSegmentMaxMovementDistance(fromSnapshot, toSnapshot)).toBe(3);
  });

  it("includes a ball that switches holders mid-segment (a possession change captured as an ordinary phase edit)", () => {
    const fromSnapshot = {
      players: [
        { id: "p1", x: 0, y: 0 },
        { id: "p2", x: 50, y: 0 },
      ],
      football: [{ id: "ball", x: 0, y: 0, isFree: false, attachedPlayerId: "p1" }],
    };
    const toSnapshot = {
      players: [
        { id: "p1", x: 2, y: 0 },
        { id: "p2", x: 52, y: 0 },
      ],
      football: [{ id: "ball", x: 50, y: 0, isFree: false, attachedPlayerId: "p2" }],
    };
    expect(resolveSegmentMaxMovementDistance(fromSnapshot, toSnapshot)).toBe(50);
  });

  it("ignores entries missing from either snapshot and returns 0 when nothing moves", () => {
    const snapshot = { players: [{ id: "p1", x: 10, y: 10 }], football: [] };
    expect(resolveSegmentMaxMovementDistance(snapshot, snapshot)).toBe(0);
  });
});

describe("resolvePhaseSegmentDurationMs", () => {
  // Approved curve: distance <= 20 keeps the flat 1200ms baseline; beyond
  // that, +20ms per extra normalized unit, capped at 2800ms — then, only
  // then, playback speed is applied.

  it("short movement (D=4) stays at the 1200ms baseline at 1x", () => {
    expect(resolvePhaseSegmentDurationMs(4, 1)).toBe(1200);
  });

  it("normal movement (D=18) stays at the 1200ms baseline at 1x", () => {
    expect(resolvePhaseSegmentDurationMs(18, 1)).toBe(1200);
  });

  it("exactly at the threshold (D=20) still stays at the 1200ms baseline at 1x", () => {
    expect(resolvePhaseSegmentDurationMs(PHASE_SEGMENT_SHORT_DISTANCE_THRESHOLD, 1)).toBe(1200);
    expect(resolvePhaseSegmentDurationMs(20, 1)).toBe(1200);
  });

  it("long movement (D=40) reaches 1600ms at 1x", () => {
    expect(resolvePhaseSegmentDurationMs(40, 1)).toBe(1600);
  });

  it("longer movement (D=55) reaches 1900ms at 1x", () => {
    expect(resolvePhaseSegmentDurationMs(55, 1)).toBe(1900);
  });

  it("very long movement (D=70) reaches 2200ms at 1x", () => {
    expect(resolvePhaseSegmentDurationMs(70, 1)).toBe(2200);
  });

  it("hits the 2800ms safety ceiling at D=100, and stays there beyond it", () => {
    expect(resolvePhaseSegmentDurationMs(100, 1)).toBe(PHASE_SEGMENT_MAX_DURATION_MS);
    expect(resolvePhaseSegmentDurationMs(100, 1)).toBe(2800);
    expect(resolvePhaseSegmentDurationMs(150, 1)).toBe(2800);
    expect(resolvePhaseSegmentDurationMs(1000, 1)).toBe(2800);
    expect(resolvePhaseSegmentDurationMs(Number.MAX_SAFE_INTEGER, 1)).toBe(2800);
  });

  it("short < normal-at-threshold < long < very-long, monotonically, at 1x", () => {
    const short = resolvePhaseSegmentDurationMs(4, 1);
    const atThreshold = resolvePhaseSegmentDurationMs(20, 1);
    const long = resolvePhaseSegmentDurationMs(55, 1);
    const veryLong = resolvePhaseSegmentDurationMs(70, 1);
    expect(short).toBe(atThreshold); // both within the flat 0-20 band
    expect(atThreshold).toBeLessThan(long);
    expect(long).toBeLessThan(veryLong);
  });

  it("Draw Route duration is driven by actual arc length, not the shorter straight-line chord", () => {
    // from (0,0) to (20,0): straight-line chord = 20 exactly. The stored
    // route detours via (0,11) and (20,11): arc length = 11+20+11 = 42
    // exactly, deliberately matching the audit's own "~20 chord / ~42 arc"
    // illustration.
    const from = { x: 0, y: 0 };
    const to = {
      x: 20,
      y: 0,
      path: [
        { x: 0, y: 0 },
        { x: 0, y: 11 },
        { x: 20, y: 11 },
        { x: 20, y: 0 },
      ],
    };
    const straightLineChord = 20;
    const distance = resolveMovementDistance(from, to);
    expect(distance).toBe(42);
    expect(distance).toBeGreaterThan(straightLineChord);

    const duration = resolvePhaseSegmentDurationMs(distance, 1);
    // 1200 + 20*(42-20) = 1640ms — not 1200ms, which is what the shorter
    // chord distance (20) would have produced.
    expect(duration).toBe(1640);
    expect(duration).not.toBe(1200);
  });

  it("longest mover among several players determines the one shared phase duration", () => {
    const fromSnapshot = {
      players: [
        { id: "short", x: 0, y: 0 },
        { id: "medium", x: 0, y: 0 },
        { id: "long", x: 0, y: 0 },
      ],
      football: [],
    };
    const toSnapshot = {
      players: [
        { id: "short", x: 4, y: 0 },
        { id: "medium", x: 18, y: 0 },
        { id: "long", x: 55, y: 0 },
      ],
      football: [],
    };
    const maxDistance = resolveSegmentMaxMovementDistance(fromSnapshot, toSnapshot);
    expect(maxDistance).toBe(55);
    expect(resolvePhaseSegmentDurationMs(maxDistance, 1)).toBe(1900); // the long mover's duration, not the short/medium ones' 1200ms
  });

  it("a free ball moving farther than every player determines the shared phase duration", () => {
    const fromSnapshot = {
      players: [{ id: "p1", x: 0, y: 0 }],
      football: [{ id: "ball", x: 0, y: 0, isFree: true, attachedPlayerId: null }],
    };
    const toSnapshot = {
      players: [{ id: "p1", x: 5, y: 0 }],
      football: [{ id: "ball", x: 70, y: 0, isFree: true, attachedPlayerId: null }],
    };
    const maxDistance = resolveSegmentMaxMovementDistance(fromSnapshot, toSnapshot);
    expect(maxDistance).toBe(70); // the ball's distance, not the player's 5
    expect(resolvePhaseSegmentDurationMs(maxDistance, 1)).toBe(2200);
  });

  it("an attached ball never inflates the shared duration beyond its holder's own movement", () => {
    const fromSnapshot = {
      players: [{ id: "p1", x: 0, y: 0 }],
      football: [{ id: "ball", x: 0, y: 0, isFree: false, attachedPlayerId: "p1" }],
    };
    const toSnapshot = {
      players: [{ id: "p1", x: 4, y: 0 }],
      // Ball snapshot coordinates far away — irrelevant, since it's carried
      // by p1 the whole segment and must not double-count or override p1's
      // own (short) movement demand.
      football: [{ id: "ball", x: 90, y: 0, isFree: false, attachedPlayerId: "p1" }],
    };
    const maxDistance = resolveSegmentMaxMovementDistance(fromSnapshot, toSnapshot);
    expect(maxDistance).toBe(4);
    expect(resolvePhaseSegmentDurationMs(maxDistance, 1)).toBe(1200); // still the short-movement baseline
  });

  it("applies the speed multiplier AFTER the distance curve and safety ceiling", () => {
    // D=55 -> 1900ms base at 1x (from the curve, not re-derived here).
    expect(resolvePhaseSegmentDurationMs(55, 1)).toBe(1900);
    expect(resolvePhaseSegmentDurationMs(55, 0.25)).toBeCloseTo(7600, 6);
    expect(resolvePhaseSegmentDurationMs(55, 0.5)).toBeCloseTo(3800, 6);
    expect(resolvePhaseSegmentDurationMs(55, 1.5)).toBeCloseTo(1266.6667, 3);
  });

  it("a ceiling-clamped movement still scales with speed instead of being re-capped", () => {
    // D=100 clamps to 2800ms at 1x — slow motion must still take 4x longer,
    // not stay pinned at 2800ms.
    expect(resolvePhaseSegmentDurationMs(100, 0.25)).toBeCloseTo(11200, 6);
    expect(resolvePhaseSegmentDurationMs(100, 1)).toBe(2800);
    expect(resolvePhaseSegmentDurationMs(100, 1.5)).toBeCloseTo(1866.6667, 3);
  });

  it("no movement returns the current 1200ms baseline (divided by speed), never 0 or NaN", () => {
    expect(resolvePhaseSegmentDurationMs(0, 1)).toBe(1200);
    const duration = resolvePhaseSegmentDurationMs(0, 1);
    expect(Number.isFinite(duration)).toBe(true);
    expect(duration).toBeGreaterThan(0);
  });

  it("treats a non-finite or negative distance as zero movement rather than propagating NaN/Infinity", () => {
    for (const badDistance of [Number.NaN, -5, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const duration = resolvePhaseSegmentDurationMs(badDistance, 1);
      expect(Number.isFinite(duration)).toBe(true);
      expect(duration).toBe(1200);
    }
  });
});
