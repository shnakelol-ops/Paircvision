import { describe, expect, it } from "vitest";
import { resolvePhaseSegmentDurationMs, resolveSegmentMaxMovementDistance } from "./routeFollowInterpolation";
import { SLATE_CARRY_RADIUS_WORLD } from "./slateCarryPresentation";
import {
  compileSlatePlaybackTimeline,
  isPassOnlyPhase,
  PASS_ONLY_PHASE_SETTLE_MS,
  passFlightKey,
  sampleSlatePlaybackTimeline,
  type SlatePlaybackTimeline,
  type TimelineSnapshot,
} from "./slatePlaybackTimeline";
import { measurePlayerWalk, resolveContinuityProgress } from "./slatePlayerContinuity";

/**
 * Phase-flow behaviour: pass-only phase timing (R1) and the boundary speed a
 * continuing player carries between phases (R2). Everything here is a
 * deterministic function of the compiled timeline.
 */

const SX = 1.6;
const R = SLATE_CARRY_RADIUS_WORLD;

type Point = { x: number; y: number };
type Ball = TimelineSnapshot["football"][number];

const held = (holder: string, at: Point): Ball => ({
  id: "ball",
  x: at.x + 4 / SX,
  y: at.y - 3.2,
  attachedPlayerId: holder,
  isFree: false,
});
const loose = (at: Point, path?: Point[]): Ball => ({
  id: "ball",
  x: at.x,
  y: at.y,
  attachedPlayerId: null,
  isFree: true,
  ...(path ? { path } : {}),
});

/** Phase snapshots: each player follows its own track; `balls[i]` places the ball in phase i. */
function board(
  tracks: Record<string, Point[]>,
  balls: (string | ((players: Record<string, Point>) => Ball) | null)[],
): TimelineSnapshot[] {
  return balls.map((ballAt, index) => {
    const byId: Record<string, Point> = {};
    const players = Object.entries(tracks).map(([id, track]) => {
      const point = track[Math.min(index, track.length - 1)]!;
      byId[id] = point;
      return { id, x: point.x, y: point.y };
    });
    const football =
      ballAt == null ? [] : typeof ballAt === "string" ? [held(ballAt, byId[ballAt]!)] : [ballAt(byId)];
    return { players, football };
  });
}

/** The duration every phase had before pass-only timing: movement demand, raised to fit any pass. */
function legacyDuration(timeline: SlatePlaybackTimeline, index: number, passFloorMs = 0): number {
  return Math.max(
    resolvePhaseSegmentDurationMs(resolveSegmentMaxMovementDistance(timeline.path[index]!, timeline.path[index + 1]!), 1),
    passFloorMs,
  );
}

const dist = (a: Point, b: Point) => Math.hypot((a.x - b.x) * SX, a.y - b.y);
const ballAt = (timeline: SlatePlaybackTimeline, ms: number) => sampleSlatePlaybackTimeline(timeline, ms).balls[0]!;
const playerAt = (timeline: SlatePlaybackTimeline, id: string, ms: number) =>
  sampleSlatePlaybackTimeline(timeline, ms).players.find((entry) => entry.id === id)!;
const flightOf = (timeline: SlatePlaybackTimeline, segment: number) =>
  timeline.passFlights.get(passFlightKey(segment, "ball"))!;
const flightMs = (timeline: SlatePlaybackTimeline, segment: number) => {
  const flight = flightOf(timeline, segment);
  return flight.arrivalMs - flight.launchMs;
};
const segmentEnd = (timeline: SlatePlaybackTimeline, index: number) =>
  timeline.segments[index]!.startMs + timeline.segments[index]!.durationMs;

describe("pass-only phase detection", () => {
  const square = { a: [{ x: 40, y: 40 }], b: [{ x: 52, y: 40 }] };

  it("a pass between stationary players is pass-only", () => {
    const path = board(square, ["a", "b"]);
    expect(isPassOnlyPhase(path[0]!, path[1]!)).toBe(true);
  });

  it("a pass while any player walks is not pass-only", () => {
    const path = board({ ...square, c: [{ x: 70, y: 70 }, { x: 74, y: 70 }] }, ["a", "b"]);
    expect(isPassOnlyPhase(path[0]!, path[1]!)).toBe(false);
  });

  it("a phase where nothing moves (a deliberate hold) is not pass-only", () => {
    const path = board(square, ["a", "a"]);
    expect(isPassOnlyPhase(path[0]!, path[1]!)).toBe(false);
  });

  it("a Free Ball phase (released into space, or picked up) is not pass-only", () => {
    const released = board(square, ["a", () => loose({ x: 46, y: 50 })]);
    expect(isPassOnlyPhase(released[0]!, released[1]!)).toBe(false);
    const pickedUp = board(square, [() => loose({ x: 46, y: 50 }), "b"]);
    expect(isPassOnlyPhase(pickedUp[0]!, pickedUp[1]!)).toBe(false);
  });

  it("a ball that appears or disappears between phases is not pass-only", () => {
    const path = board(square, ["a", "b"]);
    expect(isPassOnlyPhase(path[0]!, { ...path[1]!, football: [...path[1]!.football, { ...held("a", { x: 40, y: 40 }), id: "ball-2" }] })).toBe(false);
    expect(isPassOnlyPhase({ ...path[0]!, football: [...path[0]!.football, { ...held("b", { x: 52, y: 40 }), id: "ball-2" }] }, path[1]!)).toBe(false);
  });
});

describe("pass-only phase timing", () => {
  for (const [label, to] of [
    ["short", { x: 30, y: 50 }],
    ["medium", { x: 55, y: 50 }],
    ["long", { x: 80, y: 50 }],
  ] as const) {
    it(`${label} pass: lasts its flight plus the settle, never longer than before`, () => {
      const timeline = compileSlatePlaybackTimeline(board({ a: [{ x: 20, y: 50 }], b: [to] }, ["a", "b"]));
      const segment = timeline.segments[0]!;
      const legacy = legacyDuration(timeline, 0);
      expect(segment.durationMs).toBeCloseTo(Math.min(legacy, flightMs(timeline, 0) + PASS_ONLY_PHASE_SETTLE_MS), 9);
      expect(segment.durationMs).toBeLessThanOrEqual(legacy);
    });
  }

  it("stationary receiver: the ball lands at their carry distance, then rests there through the settle", () => {
    const timeline = compileSlatePlaybackTimeline(board({ a: [{ x: 20, y: 50 }], b: [{ x: 45, y: 40 }] }, ["a", "b"]));
    const flight = flightOf(timeline, 0);
    const end = segmentEnd(timeline, 0);
    expect(end - flight.arrivalMs).toBeCloseTo(PASS_ONLY_PHASE_SETTLE_MS, 9);
    const receiver = timeline.path[1]!.players.find((entry) => entry.id === "b")!;
    for (let ms = 0; ms <= end; ms += 10) {
      // The receiver never moves during a pass-only phase.
      const at = playerAt(timeline, "b", ms);
      expect(at.x).toBe(receiver.x);
      expect(at.y).toBe(receiver.y);
    }
    expect(dist(flight.end, receiver)).toBeCloseTo(R, 6);
    for (let ms = flight.arrivalMs; ms < end; ms += 10) {
      const ball = ballAt(timeline, ms);
      expect(ball.kind).toBe("attached");
      expect(dist(ball, flight.end)).toBeLessThan(1e-9);
    }
  });

  it("rapid consecutive passes (rondo): every reception rests for the settle, each pass leaves from where the last landed", () => {
    const square = { a: [{ x: 42, y: 42 }], b: [{ x: 54, y: 42 }], c: [{ x: 54, y: 58 }], d: [{ x: 42, y: 58 }] };
    const timeline = compileSlatePlaybackTimeline(board(square, ["a", "b", "c", "d", "a", "c"]));
    expect(timeline.segments).toHaveLength(5);
    let legacyTotal = 0;
    timeline.segments.forEach((segment, index) => {
      const flight = flightOf(timeline, index);
      expect(flight.launchMs).toBe(segment.startMs);
      expect(segmentEnd(timeline, index) - flight.arrivalMs).toBeCloseTo(PASS_ONLY_PHASE_SETTLE_MS, 9);
      if (index > 0) expect(dist(flight.start, flightOf(timeline, index - 1).end)).toBeLessThan(1e-9);
      legacyTotal += legacyDuration(timeline, index);
    });
    // Before: 5 × 1200ms, mostly motionless. After: under half of that.
    expect(legacyTotal).toBe(6000);
    expect(timeline.totalDurationMs).toBeLessThan(legacyTotal / 2);
  });

  it("run → pass-only → run: the runner stops at both boundaries exactly as before, for less time", () => {
    const path = board(
      { a: [{ x: 40, y: 50 }, { x: 47, y: 50 }, { x: 47, y: 50 }, { x: 47, y: 50 }], b: [{ x: 50, y: 62 }, { x: 50, y: 62 }, { x: 50, y: 62 }, { x: 57, y: 62 }] },
      ["a", "a", "b", "b"],
    );
    const timeline = compileSlatePlaybackTimeline(path);
    expect(timeline.segments[0]!.durationMs).toBe(legacyDuration(timeline, 0));
    expect(timeline.segments[2]!.durationMs).toBe(legacyDuration(timeline, 2));
    expect(timeline.segments[1]!.durationMs).toBeCloseTo(flightMs(timeline, 1) + PASS_ONLY_PHASE_SETTLE_MS, 9);
    expect(timeline.segments[1]!.durationMs).toBeLessThan(legacyDuration(timeline, 1) / 2);
    // Movement phases keep their smoothstep start and stop (no slopes: a deliberate stop).
    expect(timeline.playerSlopes.every((segment) => segment.size === 0)).toBe(true);
    // Authored positions land exactly at every boundary.
    timeline.segments.forEach((segment, index) => {
      for (const authored of path[index + 1]!.players) {
        const at = playerAt(timeline, authored.id, segment.startMs + segment.durationMs - 1e-9);
        expect(at.x).toBeCloseTo(authored.x, 6);
        expect(at.y).toBeCloseTo(authored.y, 6);
      }
    });
  });

  it("a phase where nothing moves keeps its full duration (deliberate hold)", () => {
    const path = board({ a: [{ x: 40, y: 50 }], b: [{ x: 50, y: 62 }] }, ["a", "a", "b"]);
    const timeline = compileSlatePlaybackTimeline(path);
    expect(timeline.segments[0]!.durationMs).toBe(1200);
  });

  it("a pass to a running receiver is not pass-only and keeps its existing timing", () => {
    const path = board({ a: [{ x: 20, y: 50 }], b: [{ x: 55, y: 70 }, { x: 60, y: 40 }] }, ["a", "b"]);
    const timeline = compileSlatePlaybackTimeline(path);
    const floor = resolvePhaseSegmentDurationMs(resolveSegmentMaxMovementDistance(path[0]!, path[1]!), 1);
    expect(timeline.segments[0]!.durationMs).toBeGreaterThanOrEqual(floor);
    expect(flightOf(timeline, 0).arrivalMs).toBeLessThan(timeline.segments[0]!.durationMs);
  });

  it("Free Ball phases are untouched: same durations and the same ball positions", () => {
    const route = [{ x: 22.5, y: 46.8 }, { x: 35, y: 55 }, { x: 46, y: 50 }];
    const path = board({ a: [{ x: 20, y: 50 }], b: [{ x: 52, y: 40 }] }, ["a", () => loose({ x: 46, y: 50 }, route), "b"]);
    const timeline = compileSlatePlaybackTimeline(path);
    timeline.segments.forEach((segment, index) => expect(segment.durationMs).toBe(legacyDuration(timeline, index)));
    expect(ballAt(timeline, timeline.segments[0]!.durationMs / 2).kind).toBe("free");
    expect(ballAt(timeline, timeline.segments[1]!.startMs + 1).kind).toBe("pickup");
  });

  it("tap-to-pass (possession-pass playback) is unchanged: exactly its flight", () => {
    const path = board({ a: [{ x: 20, y: 50 }], b: [{ x: 45, y: 40 }] }, ["a", () => loose({ x: 45, y: 43 })]);
    const timeline = compileSlatePlaybackTimeline(path, "possession-pass", undefined, { tapPassReceiverId: "b" });
    const flight = [...timeline.passFlights.values()][0]!;
    expect(timeline.totalDurationMs).toBeCloseTo(Math.max(1, flight.arrivalMs - flight.launchMs), 9);
  });

  it("is deterministic, and identical however the playback is paused, resumed or sped up", () => {
    const square = { a: [{ x: 42, y: 42 }], b: [{ x: 54, y: 42 }], c: [{ x: 54, y: 58 }] };
    const path = board(square, ["a", "b", "c"]);
    const first = compileSlatePlaybackTimeline(path);
    const second = compileSlatePlaybackTimeline(path);
    expect(second.segments).toEqual(first.segments);
    // The surface advances timeline ms by realMs × speed; any slicing lands on the same frames.
    for (const speed of [0.25, 0.5, 0.75, 1, 1.25, 1.5]) {
      let timelineMs = 0;
      for (const realDelta of [16.7, 33.4, 0, 0, 8.3, 50, 16.7]) {
        timelineMs += realDelta * speed;
        expect(sampleSlatePlaybackTimeline(second, timelineMs)).toEqual(sampleSlatePlaybackTimeline(first, timelineMs));
      }
    }
  });
});

describe("boundary speed between phases", () => {
  /** World speed (units per 1× ms) of a player over [ms, ms + 1]. */
  const speedAt = (timeline: SlatePlaybackTimeline, id: string, ms: number) =>
    dist(playerAt(timeline, id, ms), playerAt(timeline, id, ms + 1));
  const averageSpeed = (timeline: SlatePlaybackTimeline, id: string, index: number) => {
    const from = timeline.path[index]!.players.find((entry) => entry.id === id)!;
    const to = timeline.path[index + 1]!.players.find((entry) => entry.id === id)!;
    return measurePlayerWalk(from, to)!.worldLength / timeline.segments[index]!.durationMs;
  };
  /** Speed profile of the previous rule (boundary speed = slower average) for a straight run. */
  const legacyProfile = (timeline: SlatePlaybackTimeline, id: string) => {
    const speeds: number[] = [];
    timeline.segments.forEach((segment, index) => {
      const v = averageSpeed(timeline, id, index);
      const boundary = (other: number | undefined) => (other === undefined ? 0 : Math.min(v, averageSpeed(timeline, id, other)));
      const slopes = {
        alpha: boundary(index > 0 ? index - 1 : undefined) / v,
        beta: boundary(index < timeline.segments.length - 1 ? index + 1 : undefined) / v,
      };
      const length = v * segment.durationMs;
      for (let ms = 0; ms < segment.durationMs; ms += 1) {
        const share =
          resolveContinuityProgress((ms + 1) / segment.durationMs, slopes) - resolveContinuityProgress(ms / segment.durationMs, slopes);
        speeds.push(share * length);
      }
    });
    return speeds;
  };
  const profile = (timeline: SlatePlaybackTimeline, id: string) => {
    const speeds: number[] = [];
    for (let ms = 0; ms < timeline.totalDurationMs - 1; ms += 1) speeds.push(speedAt(timeline, id, ms));
    return speeds;
  };
  const peakAcceleration = (speeds: number[]) => {
    let peak = 0;
    for (let index = 1; index < speeds.length; index += 1) peak = Math.max(peak, Math.abs(speeds[index]! - speeds[index - 1]!));
    return peak;
  };
  const run = (steps: number[], y = 50): Point[] => {
    const track: Point[] = [{ x: 30, y }];
    for (const step of steps) track.push({ x: track[track.length - 1]!.x + step, y });
    return track;
  };
  const holders = (count: number) => Array.from({ length: count }, () => null);

  it("speeding up across a boundary no longer slows down into it first (6 → 15 → 6 units)", () => {
    const timeline = compileSlatePlaybackTimeline(board({ p: run([6, 15, 6]) }, holders(4)));
    const speeds = profile(timeline, "p");
    const legacy = legacyProfile(timeline, "p");
    const firstPeak = timeline.segments[0]!.durationMs / 2;
    const fastMiddle = timeline.segments[1]!.startMs + timeline.segments[1]!.durationMs / 2;
    // From mid-phase 1 to mid-phase 2 the speed only rises…
    for (let ms = firstPeak + 1; ms < fastMiddle; ms += 1) expect(speeds[ms]!).toBeGreaterThanOrEqual(speeds[ms - 1]! - 1e-9);
    // …where the previous rule dipped before surging.
    const legacyBoundary = legacy[timeline.segments[1]!.startMs]!;
    expect(Math.max(...legacy.slice(0, timeline.segments[1]!.startMs))).toBeGreaterThan(legacyBoundary * 1.2);
    // Smaller speed swings: lower peak speed and lower peak acceleration.
    expect(Math.max(...speeds)).toBeLessThan(Math.max(...legacy));
    expect(peakAcceleration(speeds)).toBeLessThan(peakAcceleration(legacy));
  });

  it("confined training grid: short steps stay continuous and land exactly on every phase", () => {
    const path = board({ p: run([3, 3, 3]), q: run([2, 5, 2], 56) }, holders(4));
    const timeline = compileSlatePlaybackTimeline(path);
    for (const id of ["p", "q"]) {
      for (const index of [1, 2]) {
        const boundary = timeline.segments[index]!.startMs;
        const before = speedAt(timeline, id, boundary - 1);
        const after = speedAt(timeline, id, boundary);
        expect(before).toBeGreaterThan(0);
        expect(Math.abs(after - before) / before).toBeLessThan(0.01);
      }
    }
    timeline.segments.forEach((segment, index) => {
      for (const authored of path[index + 1]!.players) {
        const at = sampleSlatePlaybackTimeline(timeline, segment.startMs + segment.durationMs - 1e-9).players.find(
          (entry) => entry.id === authored.id,
        )!;
        expect(at.x).toBeCloseTo(authored.x, 6);
        expect(at.y).toBeCloseTo(authored.y, 6);
      }
    });
  });

  it("several players moving different distances at once: each keeps its own continuous profile, never backwards", () => {
    const path = board(
      {
        a: run([6, 6, 6], 30),
        b: run([4, 20, 4], 50),
        c: [{ x: 10, y: 80 }, { x: 10, y: 80 }, { x: 50, y: 80 }, { x: 50, y: 80 }],
      },
      holders(4),
    );
    const timeline = compileSlatePlaybackTimeline(path);
    // c's sprint lengthens phase 2 for everyone.
    expect(timeline.segments[1]!.durationMs).toBeGreaterThan(timeline.segments[0]!.durationMs);
    for (const id of ["a", "b"]) {
      const speeds = profile(timeline, id);
      for (const index of [1, 2]) {
        const boundary = timeline.segments[index]!.startMs;
        const before = speedAt(timeline, id, boundary - 1);
        expect(Math.abs(speedAt(timeline, id, boundary) - before) / before).toBeLessThan(0.01);
        expect(before).toBeCloseTo(Math.sqrt(averageSpeed(timeline, id, index - 1) * averageSpeed(timeline, id, index)), 3);
      }
      let previousX = -Infinity;
      for (let ms = 0; ms <= timeline.totalDurationMs; ms += 5) {
        const x = playerAt(timeline, id, ms).x;
        expect(x).toBeGreaterThanOrEqual(previousX - 1e-9);
        previousX = x;
      }
      expect(peakAcceleration(speeds)).toBeLessThanOrEqual(peakAcceleration(legacyProfile(timeline, id)) + 1e-9);
    }
    // c stands, sprints, stands: deliberate starts and stops stay eased to zero.
    expect(timeline.playerSlopes.every((segment) => !segment.has("c"))).toBe(true);
  });

  it("deliberate stops are preserved: a stationary phase and a reversal both stop the player", () => {
    const stationary = compileSlatePlaybackTimeline(
      board({ p: [{ x: 40, y: 50 }, { x: 44, y: 50 }, { x: 44, y: 50 }, { x: 48, y: 50 }] }, holders(4)),
    );
    expect(stationary.playerSlopes.every((segment) => segment.size === 0)).toBe(true);
    const reversal = compileSlatePlaybackTimeline(
      board({ p: [{ x: 40, y: 50 }, { x: 46, y: 50 }, { x: 41, y: 50 }] }, holders(3)),
    );
    const boundary = reversal.segments[1]!.startMs;
    expect(speedAt(reversal, "p", boundary - 1)).toBeLessThan(1e-4);
    expect(speedAt(reversal, "p", boundary)).toBeLessThan(1e-4);
  });
});
