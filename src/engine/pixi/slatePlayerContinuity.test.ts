import { describe, expect, it } from "vitest";
import type { NormalizedPoint } from "../shared/normalization";
import { getPlaybackEaseProgress, interpolatePath } from "./routeFollowInterpolation";
import {
  compileSlatePlaybackTimeline,
  sampleSlatePlaybackTimeline,
  type SlatePlaybackTimeline,
  type TimelineSnapshot,
} from "./slatePlaybackTimeline";
import {
  measurePlayerWalk,
  PLAYER_CONTINUITY_REVERSAL_THRESHOLD_DEGREES,
  resolveContinuityProgress,
  resolveTurnDegrees,
} from "./slatePlayerContinuity";

type Waypoint = { x: number; y: number; path?: NormalizedPoint[] };

/** A board where each player id follows its own list of phase positions. */
function board(tracks: Record<string, Waypoint[]>): TimelineSnapshot[] {
  const phaseCount = Math.max(...Object.values(tracks).map((track) => track.length));
  return Array.from({ length: phaseCount }, (_, index) => ({
    players: Object.entries(tracks).map(([id, track]) => {
      const point = track[Math.min(index, track.length - 1)]!;
      return { id, x: point.x, y: point.y, ...(point.path && index > 0 ? { path: point.path } : {}) };
    }),
    football: [],
  }));
}

const WORLD = { x: 1.6, y: 1 };

function worldPoint(timeline: SlatePlaybackTimeline, id: string, ms: number) {
  const player = sampleSlatePlaybackTimeline(timeline, ms).players.find((entry) => entry.id === id)!;
  return { x: player.x * WORLD.x, y: player.y * WORLD.y };
}

/** World speed (world units per 1× ms) just before / just after a timeline moment. */
function speedAround(timeline: SlatePlaybackTimeline, id: string, ms: number) {
  const h = 0.5;
  const a = worldPoint(timeline, id, ms - 2 * h);
  const b = worldPoint(timeline, id, ms - h);
  const c = worldPoint(timeline, id, ms + h);
  const d = worldPoint(timeline, id, ms + 2 * h);
  return {
    before: Math.hypot(b.x - a.x, b.y - a.y) / h,
    after: Math.hypot(d.x - c.x, d.y - c.y) / h,
  };
}

function boundaryMs(timeline: SlatePlaybackTimeline, index: number): number {
  return timeline.segments[index]!.startMs;
}

/** Average world speed of a player over segment `index`. */
function averageSpeed(timeline: SlatePlaybackTimeline, id: string, index: number): number {
  const segment = timeline.segments[index]!;
  const from = timeline.path[index]!.players.find((entry) => entry.id === id)!;
  const to = timeline.path[index + 1]!.players.find((entry) => entry.id === id)!;
  const walk = measurePlayerWalk(from, to);
  return walk ? walk.worldLength / segment.durationMs : 0;
}

function expectContinuous(timeline: SlatePlaybackTimeline, id: string, index: number) {
  const { before, after } = speedAround(timeline, id, boundaryMs(timeline, index));
  expect(before).toBeGreaterThan(0.2 * averageSpeed(timeline, id, index));
  expect(Math.abs(after - before) / before).toBeLessThan(0.01);
}

function expectStopped(timeline: SlatePlaybackTimeline, id: string, index: number) {
  const { before, after } = speedAround(timeline, id, boundaryMs(timeline, index));
  // ~zero on both sides: a 1ms finite difference of an eased start/stop.
  expect(before).toBeLessThan(0.01 * Math.max(averageSpeed(timeline, id, index - 1), 1e-6) + 1e-6);
  expect(after).toBeLessThan(0.01 * Math.max(averageSpeed(timeline, id, index), 1e-6) + 1e-6);
}

describe("resolveContinuityProgress", () => {
  it("is exactly the old smoothstep when both boundary slopes are zero", () => {
    for (let u = 0; u <= 1; u += 0.01) {
      expect(resolveContinuityProgress(u, { alpha: 0, beta: 0 })).toBeCloseTo(getPlaybackEaseProgress(u), 12);
    }
  });

  it("hits the authored endpoints exactly and never runs backwards or past them", () => {
    for (const alpha of [0, 0.3, 1, 1.6, 2]) {
      for (const beta of [0, 0.5, 1, 1.6, 2]) {
        expect(resolveContinuityProgress(0, { alpha, beta })).toBe(0);
        expect(resolveContinuityProgress(1, { alpha, beta })).toBe(1);
        let previous = 0;
        for (let u = 0; u <= 1.0000001; u += 0.005) {
          const share = resolveContinuityProgress(u, { alpha, beta });
          expect(share).toBeGreaterThanOrEqual(previous - 1e-12);
          expect(share).toBeLessThanOrEqual(1 + 1e-12);
          previous = share;
        }
      }
    }
  });

  it("is linear (constant speed) when both slopes equal the segment average", () => {
    for (let u = 0; u <= 1; u += 0.05) {
      expect(resolveContinuityProgress(u, { alpha: 1, beta: 1 })).toBeCloseTo(u, 12);
    }
  });
});

describe("player continuity across phase boundaries", () => {
  it("straight run across four phases: one continuous speed through every boundary, eased only at the ends", () => {
    const timeline = compileSlatePlaybackTimeline(
      board({ p: [{ x: 10, y: 50 }, { x: 25, y: 50 }, { x: 40, y: 50 }, { x: 55, y: 50 }, { x: 70, y: 50 }] }),
    );
    for (const index of [1, 2, 3]) expectContinuous(timeline, "p", index);
    // Middle segments run at their average speed throughout (no dip).
    const mid = timeline.segments[2]!;
    const quarter = speedAround(timeline, "p", mid.startMs + mid.durationMs * 0.25).after;
    expect(quarter / averageSpeed(timeline, "p", 2)).toBeCloseTo(1, 2);
    // Still starts from and comes to rest.
    expect(speedAround(timeline, "p", 1).after).toBeLessThan(0.01 * averageSpeed(timeline, "p", 0));
    expect(speedAround(timeline, "p", timeline.totalDurationMs - 1).before).toBeLessThan(
      0.01 * averageSpeed(timeline, "p", 3),
    );
  });

  it("gentle direction change keeps speed", () => {
    const timeline = compileSlatePlaybackTimeline(
      board({ p: [{ x: 10, y: 50 }, { x: 30, y: 50 }, { x: 48, y: 43 }] }),
    );
    expectContinuous(timeline, "p", 1);
  });

  it("90° corner keeps on-screen (world) speed even though x is stretched 1.6×", () => {
    const timeline = compileSlatePlaybackTimeline(
      board({ p: [{ x: 10, y: 80 }, { x: 30, y: 80 }, { x: 30, y: 50 }] }),
    );
    expectContinuous(timeline, "p", 1);
  });

  it("~119° still carries speed; ~121° is a reversal and stops at the boundary", () => {
    const at = (degrees: number) => {
      // Second leg turns `degrees` away from the first (measured in world space).
      const radians = (degrees * Math.PI) / 180;
      const dx = Math.cos(radians) * 20;
      const dy = Math.sin(radians) * 20;
      return compileSlatePlaybackTimeline(
        board({ p: [{ x: 20, y: 50 }, { x: 52, y: 50 }, { x: 52 + dx / WORLD.x, y: 50 + dy / WORLD.y }] }),
      );
    };
    const gentle = at(119);
    const sharp = at(121);
    const turn = (timeline: SlatePlaybackTimeline) => {
      const [p0, p1, p2] = timeline.path.map((snapshot) => snapshot.players[0]!);
      return resolveTurnDegrees(measurePlayerWalk(p0!, p1!)!.endDirection, measurePlayerWalk(p1!, p2!)!.startDirection);
    };
    expect(turn(gentle)).toBeCloseTo(119, 6);
    expect(turn(sharp)).toBeCloseTo(121, 6);
    expect(PLAYER_CONTINUITY_REVERSAL_THRESHOLD_DEGREES).toBe(120);
    expectContinuous(gentle, "p", 1);
    expectStopped(sharp, "p", 1);
  });

  it("180° reversal stops at the boundary", () => {
    const timeline = compileSlatePlaybackTimeline(
      board({ p: [{ x: 20, y: 50 }, { x: 50, y: 50 }, { x: 30, y: 50 }] }),
    );
    expectStopped(timeline, "p", 1);
  });

  it("moving → stationary eases out exactly as before; stationary → moving eases in exactly as before", () => {
    const stops = compileSlatePlaybackTimeline(board({ p: [{ x: 20, y: 50 }, { x: 50, y: 50 }, { x: 50, y: 50 }] }));
    expectStopped(stops, "p", 1);
    expect(stops.playerSlopes[0]!.has("p")).toBe(false);

    const starts = compileSlatePlaybackTimeline(board({ p: [{ x: 20, y: 50 }, { x: 20, y: 50 }, { x: 50, y: 50 }] }));
    expectStopped(starts, "p", 1);
    expect(starts.playerSlopes[1]!.has("p")).toBe(false);
  });

  it("stationary → stationary stays put", () => {
    const timeline = compileSlatePlaybackTimeline(board({ p: [{ x: 20, y: 50 }, { x: 20, y: 50 }, { x: 20, y: 50 }] }));
    for (let ms = 0; ms <= timeline.totalDurationMs; ms += 50) {
      const point = sampleSlatePlaybackTimeline(timeline, ms).players[0]!;
      expect(point.x).toBe(20);
      expect(point.y).toBe(50);
    }
  });

  it("freehand routes across boundaries: same route geometry, continuous speed, never backwards", () => {
    const routeA: NormalizedPoint[] = [
      { x: 10, y: 70 },
      { x: 14, y: 64 },
      { x: 19, y: 60 },
      { x: 25, y: 58 },
      { x: 32, y: 57 },
    ];
    const routeB: NormalizedPoint[] = [
      { x: 32, y: 57 },
      { x: 39, y: 56.5 },
      { x: 45, y: 54 },
      { x: 50, y: 49 },
      { x: 53, y: 42 },
    ];
    const timeline = compileSlatePlaybackTimeline(
      board({ p: [{ x: 10, y: 70 }, { x: 32, y: 57, path: routeA }, { x: 53, y: 42, path: routeB }] }),
    );
    expectContinuous(timeline, "p", 1);
    for (const index of [0, 1]) {
      const from = timeline.path[index]!.players[0]!;
      const to = timeline.path[index + 1]!.players[0]!;
      const segment = timeline.segments[index]!;
      const slopes = timeline.playerSlopes[index]!.get("p")!;
      let previousShare = 0;
      for (let step = 0; step <= 100; step += 1) {
        const progress = step / 100;
        const sampled = sampleSlatePlaybackTimeline(timeline, segment.startMs + segment.durationMs * progress - (step === 100 ? 1e-9 : 0));
        const point = sampled.players[0]!;
        const share = resolveContinuityProgress(progress, slopes);
        // On the exact route interpolatePath walks.
        const expected = interpolatePath(from, to, share);
        expect(point.x).toBeCloseTo(expected.x, 6);
        expect(point.y).toBeCloseTo(expected.y, 6);
        expect(share).toBeGreaterThanOrEqual(previousShare - 1e-12);
        previousShare = share;
      }
    }
  });

  it("different players in the same phases get their own profiles", () => {
    const timeline = compileSlatePlaybackTimeline(
      board({
        runner: [{ x: 10, y: 20 }, { x: 30, y: 20 }, { x: 50, y: 20 }],
        stopper: [{ x: 10, y: 50 }, { x: 30, y: 50 }, { x: 30, y: 50 }],
        starter: [{ x: 10, y: 80 }, { x: 10, y: 80 }, { x: 30, y: 80 }],
        statue: [{ x: 80, y: 50 }, { x: 80, y: 50 }, { x: 80, y: 50 }],
        turner: [{ x: 60, y: 20 }, { x: 80, y: 20 }, { x: 62, y: 22 }],
      }),
    );
    expectContinuous(timeline, "runner", 1);
    expectStopped(timeline, "stopper", 1);
    expectStopped(timeline, "starter", 1);
    expectStopped(timeline, "turner", 1);
    // Everyone but the runner walks the plain smoothstep, exactly as before.
    for (const index of [0, 1]) {
      expect([...timeline.playerSlopes[index]!.keys()]).toEqual(["runner"]);
    }
  });

  it("authored phase positions stay exact for every player at every boundary", () => {
    const path = board({
      a: [{ x: 10, y: 20 }, { x: 30, y: 25 }, { x: 52, y: 22 }, { x: 70, y: 40 }],
      b: [{ x: 50, y: 70 }, { x: 40, y: 60 }, { x: 40, y: 60 }, { x: 20, y: 40 }],
    });
    const timeline = compileSlatePlaybackTimeline(path);
    timeline.segments.forEach((segment, index) => {
      for (const player of sampleSlatePlaybackTimeline(timeline, segment.startMs).players) {
        const authored = path[index]!.players.find((entry) => entry.id === player.id)!;
        expect(player.x).toBeCloseTo(authored.x, 9);
        expect(player.y).toBeCloseTo(authored.y, 9);
      }
    });
  });

  it("phases of different lengths: carries the slower segment's average speed, still continuous", () => {
    // Short hop then a long run (longer run → longer phase duration).
    const timeline = compileSlatePlaybackTimeline(
      board({ p: [{ x: 10, y: 50 }, { x: 18, y: 50 }, { x: 70, y: 50 }] }),
    );
    expectContinuous(timeline, "p", 1);
    const { before } = speedAround(timeline, "p", boundaryMs(timeline, 1));
    expect(before).toBeCloseTo(
      Math.min(averageSpeed(timeline, "p", 0), averageSpeed(timeline, "p", 1)),
      4,
    );
  });
});

describe("playback speed, pause/resume and phase transitions", () => {
  const timeline = compileSlatePlaybackTimeline(
    board({ p: [{ x: 10, y: 50 }, { x: 25, y: 50 }, { x: 40, y: 50 }, { x: 55, y: 50 }] }),
  );

  for (const speed of [0.25, 0.5, 1, 1.5]) {
    it(`stays continuous through boundaries at ${speed}× (real-time speed scales by ${speed})`, () => {
      // The surface advances timeline ms by realMs × speed.
      const realSpeedAround = (realMs: number) => {
        const h = 0.5;
        const p = (ms: number) => worldPoint(timeline, "p", ms * speed);
        const a = p(realMs - 2 * h);
        const b = p(realMs - h);
        const c = p(realMs + h);
        const d = p(realMs + 2 * h);
        return { before: Math.hypot(b.x - a.x, b.y - a.y) / h, after: Math.hypot(d.x - c.x, d.y - c.y) / h };
      };
      for (const index of [1, 2]) {
        const real = realSpeedAround(boundaryMs(timeline, index) / speed);
        const atOne = speedAround(timeline, "p", boundaryMs(timeline, index));
        expect(Math.abs(real.after - real.before) / real.before).toBeLessThan(0.01);
        expect(real.before / atOne.before).toBeCloseTo(speed, 2);
      }
    });
  }

  it("pause exactly on a boundary, then resume: same position, same velocity", () => {
    const boundary = boundaryMs(timeline, 1);
    const pausedAt = worldPoint(timeline, "p", boundary);
    // Paused: the timeline position does not advance however long real time runs.
    expect(worldPoint(timeline, "p", boundary)).toEqual(pausedAt);
    const authored = timeline.path[1]!.players[0]!;
    expect(pausedAt.x / WORLD.x).toBeCloseTo(authored.x, 9);
    const { before, after } = speedAround(timeline, "p", boundary);
    expect(after).toBeCloseTo(before, 3);
  });

  it("each phase transition hands over without a velocity jump for a continuing player", () => {
    const samples: number[] = [];
    for (let ms = 1; ms < timeline.totalDurationMs - 1; ms += 1) {
      const a = worldPoint(timeline, "p", ms);
      const b = worldPoint(timeline, "p", ms + 1);
      samples.push(Math.hypot(b.x - a.x, b.y - a.y));
    }
    let largestStep = 0;
    for (let index = 1; index < samples.length; index += 1) {
      largestStep = Math.max(largestStep, Math.abs(samples[index]! - samples[index - 1]!));
    }
    const peak = Math.max(...samples);
    // Per-ms speed change stays tiny relative to peak speed everywhere,
    // including at both boundaries.
    expect(largestStep / peak).toBeLessThan(0.02);
  });
});
