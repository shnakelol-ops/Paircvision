import { describe, expect, it } from "vitest";
import {
  getPlaybackEaseProgress,
  interpolatePath,
  resolvePhaseSegmentDurationMs,
  resolveSegmentMaxMovementDistance,
} from "./routeFollowInterpolation";
import {
  compileSlatePlaybackTimeline,
  locateSlateTimelinePosition,
  PICKUP_CONVERGENCE_TIME_CONSTANT_MS,
  POSSESSION_PASS_MAX_DURATION_MS,
  POSSESSION_PASS_MIN_DURATION_MS,
  resolvePickupRemainingFraction,
  resolvePossessionPassDurationMs,
  sampleSlatePlaybackTimeline,
  type SlatePlaybackKind,
  type TimelineSnapshot,
} from "./slatePlaybackTimeline";
import { resolveContinuityProgress } from "./slatePlayerContinuity";

type Ball = TimelineSnapshot["football"][number];

const ball = (overrides: Partial<Ball> & { id?: string }): Ball => ({
  id: "ball-1",
  x: 50,
  y: 50,
  attachedPlayerId: null,
  isFree: true,
  ...overrides,
});

// A three-phase board exercising every ball transition the engine handles:
// carried by p1 → holder switch to p2 → released into space along a drawn
// path → picked up by p3. p1 also follows a freehand route in phase 1.
const START: TimelineSnapshot = {
  players: [
    { id: "p1", x: 20, y: 50 },
    { id: "p2", x: 60, y: 40 },
    { id: "p3", x: 80, y: 70 },
  ],
  football: [ball({ x: 22.5, y: 44.9, attachedPlayerId: "p1", isFree: false })],
};
const PHASE_1: TimelineSnapshot = {
  players: [
    {
      id: "p1",
      x: 35,
      y: 30,
      path: [
        { x: 20, y: 50 },
        { x: 24, y: 41 },
        { x: 30, y: 34 },
        { x: 35, y: 30 },
      ],
    },
    { id: "p2", x: 62, y: 45 },
    { id: "p3", x: 80, y: 70 },
  ],
  football: [ball({ x: 37.5, y: 24.9, attachedPlayerId: "p1", isFree: false })],
};
const PHASE_2: TimelineSnapshot = {
  players: [
    { id: "p1", x: 40, y: 32 },
    { id: "p2", x: 70, y: 50 },
    { id: "p3", x: 78, y: 66 },
  ],
  football: [ball({ x: 72.5, y: 44.9, attachedPlayerId: "p2", isFree: false })],
};
const PHASE_3: TimelineSnapshot = {
  players: [
    { id: "p1", x: 40, y: 32 },
    { id: "p2", x: 70, y: 50 },
    { id: "p3", x: 74, y: 60 },
  ],
  football: [
    ball({
      x: 85,
      y: 30,
      path: [
        { x: 72.5, y: 44.9 },
        { x: 80, y: 40 },
        { x: 85, y: 30 },
      ],
    }),
  ],
};
const PHASE_4: TimelineSnapshot = {
  players: PHASE_3.players,
  football: [ball({ x: 76.5, y: 54.9, attachedPlayerId: "p3", isFree: false })],
};
const BOARD = [START, PHASE_1, PHASE_2, PHASE_3, PHASE_4];

/**
 * The frame-stepped engine on main (createTacticalPadLiteSurface stepPlayback
 * before the timeline), ported verbatim minus Pixi: per-segment elapsed ms,
 * durations already divided by playback speed, the same boundary carry, and
 * the same per-frame speed-change rescale. Attached balls are reported by
 * holder only — their rendered point (and the old lag-follow) belongs to the
 * surface and is the one intended difference.
 */
function createLegacyEngine(
  path: TimelineSnapshot[],
  kind: SlatePlaybackKind,
  speed: number,
  // Stage 1 (player continuity) only changes how far along its walk a
  // player is; injecting that share keeps every other part of the old loop
  // (geometry, durations, frame slicing, speed handling) as the reference.
  playerShare?: (segment: number, playerId: string, progress: number) => number,
) {
  let multiplier = speed;
  let segment = 0;
  let elapsed = 0;
  let playing = true;
  const maxDistances = path.slice(0, -1).map((from, index) => resolveSegmentMaxMovementDistance(from, path[index + 1]!));
  const legacyPossessionDuration = (from: TimelineSnapshot, to: TimelineSnapshot, mult: number) => {
    let maxBallDistance = 0;
    for (const toBall of to.football) {
      const fromBall = from.football.find((point) => point.id === toBall.id);
      if (!fromBall) continue;
      maxBallDistance = Math.max(maxBallDistance, Math.hypot(toBall.x - fromBall.x, toBall.y - fromBall.y));
    }
    return Math.max(900, Math.min(1800, (1200 * (maxBallDistance / 14)) / Math.max(0.01, mult)));
  };
  const duration = (index: number, mult: number) =>
    kind === "possession-pass"
      ? legacyPossessionDuration(path[index]!, path[index + 1]!, mult)
      : resolvePhaseSegmentDurationMs(maxDistances[index] ?? 0, mult);
  let frame: { players: Map<string, { x: number; y: number }>; balls: Map<string, string> } = {
    players: new Map(),
    balls: new Map(),
  };
  const render = (progress: number) => {
    const eased = getPlaybackEaseProgress(progress);
    const from = path[segment]!;
    const to = path[segment + 1]!;
    for (const toPoint of to.players) {
      const fromPoint = from.players.find((entry) => entry.id === toPoint.id);
      if (!fromPoint) continue;
      const share = playerShare ? playerShare(segment, toPoint.id, progress) : eased;
      frame.players.set(
        toPoint.id,
        toPoint.path?.length
          ? interpolatePath(fromPoint, toPoint, share)
          : { x: fromPoint.x + (toPoint.x - fromPoint.x) * share, y: fromPoint.y + (toPoint.y - fromPoint.y) * share },
      );
    }
    for (const toBall of to.football) {
      const fromBall = from.football.find((point) => point.id === toBall.id) ?? null;
      const target = toBall.isFree ? null : toBall.attachedPlayerId ?? null;
      const source = fromBall?.isFree ? null : fromBall?.attachedPlayerId ?? null;
      if (target) {
        if (source != null && source !== target && fromBall) {
          const x = fromBall.x + (toBall.x - fromBall.x) * eased;
          const y = fromBall.y + (toBall.y - fromBall.y) * eased;
          frame.balls.set(toBall.id, `switch:${x.toFixed(9)},${y.toFixed(9)}`);
          continue;
        }
        frame.balls.set(toBall.id, `held:${target}`);
        continue;
      }
      const point = interpolatePath(fromBall, toBall, eased);
      frame.balls.set(toBall.id, `free:${point.x.toFixed(9)},${point.y.toFixed(9)}`);
    }
  };
  return {
    get playing() {
      return playing;
    },
    get frame() {
      return frame;
    },
    setSpeed(next: number) {
      const prevDuration = kind === "possession-pass" ? 1200 / multiplier : duration(segment, multiplier);
      const progress = prevDuration > 0 ? Math.max(0, Math.min(1, elapsed / prevDuration)) : 0;
      multiplier = next;
      const nextDuration = kind === "possession-pass" ? 1200 / multiplier : duration(segment, multiplier);
      elapsed = Math.max(0, Math.min(nextDuration, progress * nextDuration));
    },
    step(deltaMs: number) {
      frame = { players: new Map(frame.players), balls: new Map(frame.balls) };
      let remaining = deltaMs;
      while (remaining > 0 && playing) {
        const segmentDuration = duration(segment, multiplier);
        const stepMs = Math.min(remaining, Math.max(0, segmentDuration - elapsed));
        elapsed += stepMs;
        remaining -= stepMs;
        const progress = Math.max(0, Math.min(1, elapsed / segmentDuration));
        render(progress);
        if (progress >= 1) {
          segment += 1;
          elapsed = 0;
          if (segment >= path.length - 1) {
            playing = false;
            return;
          }
          if (remaining <= 0) remaining = 0.0001;
        }
      }
    },
  };
}

function describeSample(path: TimelineSnapshot[], timelineMs: number, kind: SlatePlaybackKind = "default") {
  const sample = sampleSlatePlaybackTimeline(compileSlatePlaybackTimeline(path, kind), timelineMs);
  const players = new Map(sample.players.map((entry) => [entry.id, { x: entry.x, y: entry.y }] as const));
  const balls = new Map(
    sample.balls.map((entry) => {
      if (entry.kind === "attached" || entry.kind === "pickup") return [entry.id, `held:${entry.attachedPlayerId}`] as const;
      const tag = entry.kind === "holder-switch" ? "switch" : "free";
      return [entry.id, `${tag}:${entry.x.toFixed(9)},${entry.y.toFixed(9)}`] as const;
    }),
  );
  return { sample, players, balls };
}

function expectFramesMatch(
  legacy: { players: Map<string, { x: number; y: number }>; balls: Map<string, string> },
  timeline: { players: Map<string, { x: number; y: number }>; balls: Map<string, string> },
  // Stage 2 (direction-aware carry) starts a pass/release from the passer's
  // presented carry side, so for boards with a carried ball only the ball's
  // kind is compared here (its positions are covered by
  // slateCarryPresentation.test.ts).
  { ballCoordinates = true }: { ballCoordinates?: boolean } = {},
) {
  expect([...timeline.players.keys()].sort()).toEqual([...legacy.players.keys()].sort());
  for (const [id, point] of legacy.players) {
    const sampled = timeline.players.get(id)!;
    expect(Math.abs(sampled.x - point.x)).toBeLessThan(1e-4);
    expect(Math.abs(sampled.y - point.y)).toBeLessThan(1e-4);
  }
  for (const [id, value] of legacy.balls) {
    const sampled = timeline.balls.get(id)!;
    if (value.startsWith("held:")) {
      expect(sampled).toBe(value);
      continue;
    }
    const [tag, coords] = value.split(":");
    const [sampledTag, sampledCoords] = sampled.split(":");
    expect(sampledTag).toBe(tag);
    if (!ballCoordinates) continue;
    const [x, y] = coords!.split(",").map(Number);
    const [sx, sy] = sampledCoords!.split(",").map(Number);
    expect(Math.abs(sx! - x!)).toBeLessThan(1e-4);
    expect(Math.abs(sy! - y!)).toBeLessThan(1e-4);
  }
}

// Deterministic pseudo-random frame deltas (jittery 30–144Hz frames).
function frameDeltas(count: number, seed: number): number[] {
  let state = seed;
  const deltas: number[] = [];
  for (let index = 0; index < count; index += 1) {
    state = (state * 1664525 + 1013904223) % 4294967296;
    deltas.push(6.9 + (state / 4294967296) * 26.4);
  }
  return deltas;
}

describe("compileSlatePlaybackTimeline", () => {
  it("uses the existing distance-aware duration for every phase segment, laid end to end", () => {
    const timeline = compileSlatePlaybackTimeline(BOARD);
    expect(timeline.segments).toHaveLength(BOARD.length - 1);
    let expectedStart = 0;
    timeline.segments.forEach((segment, index) => {
      const expected = resolvePhaseSegmentDurationMs(resolveSegmentMaxMovementDistance(BOARD[index]!, BOARD[index + 1]!), 1);
      expect(segment.durationMs).toBe(expected);
      expect(segment.startMs).toBe(expectedStart);
      expectedStart += expected;
    });
    expect(timeline.totalDurationMs).toBe(expectedStart);
  });

  it("keeps the 900–1800ms tap-to-pass window at 1×", () => {
    const short = resolvePossessionPassDurationMs(START, { ...START, football: [ball({ x: 24, y: 45 })] });
    const long = resolvePossessionPassDurationMs(START, { ...START, football: [ball({ x: 95, y: 95 })] });
    const mid = resolvePossessionPassDurationMs(START, { ...START, football: [ball({ x: 22.5 + 14, y: 44.9 })] });
    expect(short).toBe(POSSESSION_PASS_MIN_DURATION_MS);
    expect(long).toBe(POSSESSION_PASS_MAX_DURATION_MS);
    expect(mid).toBeCloseTo(1200, 6);
  });

  it("returns an empty, already-complete timeline for fewer than two snapshots", () => {
    const timeline = compileSlatePlaybackTimeline([START]);
    expect(timeline.totalDurationMs).toBe(0);
    expect(locateSlateTimelinePosition(timeline, 0).isComplete).toBe(true);
  });
});

describe("locateSlateTimelinePosition", () => {
  const timeline = compileSlatePlaybackTimeline(BOARD);
  const [first, second] = timeline.segments;

  it("assigns a boundary to the later segment at progress 0", () => {
    expect(locateSlateTimelinePosition(timeline, second!.startMs)).toEqual({
      segmentIndex: 1,
      progress: 0,
      isComplete: false,
    });
  });

  it("reports linear progress inside a segment", () => {
    const position = locateSlateTimelinePosition(timeline, first!.durationMs * 0.25);
    expect(position.segmentIndex).toBe(0);
    expect(position.progress).toBeCloseTo(0.25, 12);
  });

  it("clamps before the start and completes at or after the end", () => {
    expect(locateSlateTimelinePosition(timeline, -50)).toEqual({ segmentIndex: 0, progress: 0, isComplete: false });
    expect(locateSlateTimelinePosition(timeline, Number.NaN)).toEqual({ segmentIndex: 0, progress: 0, isComplete: false });
    expect(locateSlateTimelinePosition(timeline, timeline.totalDurationMs + 1)).toEqual({
      segmentIndex: BOARD.length - 2,
      progress: 1,
      isComplete: true,
    });
  });
});

describe("sampleSlatePlaybackTimeline", () => {
  const timeline = compileSlatePlaybackTimeline(BOARD);

  it("lands exactly on every authored snapshot at each phase boundary", () => {
    timeline.segments.forEach((segment, index) => {
      const sample = sampleSlatePlaybackTimeline(timeline, segment.startMs);
      for (const player of sample.players) {
        const authored = BOARD[index]!.players.find((entry) => entry.id === player.id)!;
        expect(player.x).toBeCloseTo(authored.x, 9);
        expect(player.y).toBeCloseTo(authored.y, 9);
      }
    });
  });

  it("classifies each ball transition the way the old engine animated it", () => {
    const kindAt = (index: number) =>
      sampleSlatePlaybackTimeline(timeline, timeline.segments[index]!.startMs + 1).balls[0]!.kind;
    expect(kindAt(0)).toBe("attached");
    expect(kindAt(1)).toBe("holder-switch");
    expect(kindAt(2)).toBe("free");
    expect(kindAt(3)).toBe("pickup");
  });

  it("is a pure function of timeline position", () => {
    const target = timeline.totalDurationMs * 0.61;
    const direct = sampleSlatePlaybackTimeline(timeline, target);
    let accumulated = 0;
    for (const delta of frameDeltas(400, 7)) {
      if (accumulated + delta > target) break;
      accumulated += delta;
      sampleSlatePlaybackTimeline(timeline, accumulated);
    }
    expect(sampleSlatePlaybackTimeline(timeline, target)).toEqual(direct);
    // A pause is simply not advancing: re-sampling the same position after
    // any amount of wall time changes nothing.
    expect(sampleSlatePlaybackTimeline(timeline, target)).toEqual(direct);
  });

  it("does not mutate the snapshots it was compiled from", () => {
    const before = JSON.stringify(BOARD);
    for (let ms = 0; ms <= timeline.totalDurationMs; ms += 37) sampleSlatePlaybackTimeline(timeline, ms);
    expect(JSON.stringify(BOARD)).toBe(before);
  });
});

describe("pickup convergence (replaces the frame-dependent lag-follow)", () => {
  it("matches one 60fps lag-follow frame and then decays exponentially in timeline time", () => {
    expect(resolvePickupRemainingFraction(1000 / 60)).toBeCloseTo(0.72, 12);
    expect(resolvePickupRemainingFraction(0)).toBe(1);
    expect(resolvePickupRemainingFraction(PICKUP_CONVERGENCE_TIME_CONSTANT_MS)).toBeCloseTo(Math.exp(-1), 12);
    expect(resolvePickupRemainingFraction(500)).toBeLessThan(1e-4);
  });

  it("gives the same pickup position however the frames were sliced", () => {
    const timeline = compileSlatePlaybackTimeline(BOARD);
    const at = timeline.segments[3]!.startMs + 120;
    const pickup = sampleSlatePlaybackTimeline(timeline, at).balls[0]!;
    expect(pickup.kind).toBe("pickup");
    if (pickup.kind !== "pickup") return;
    expect(pickup.fromX).toBe(PHASE_3.football[0]!.x);
    expect(pickup.remainingFraction).toBeCloseTo(Math.exp(-120 / PICKUP_CONVERGENCE_TIME_CONSTANT_MS), 12);
  });
});

// The share each player walks per segment under Stage 1 player continuity.
function continuityShare(path: TimelineSnapshot[]) {
  const timeline = compileSlatePlaybackTimeline(path);
  return (segment: number, playerId: string, progress: number) => {
    const slopes = timeline.playerSlopes[segment]?.get(playerId);
    return slopes ? resolveContinuityProgress(progress, slopes) : getPlaybackEaseProgress(progress);
  };
}

describe("equivalence with the frame-stepped engine on main", () => {
  it("exercises continuity on the reference board (some players carry speed through boundaries)", () => {
    const timeline = compileSlatePlaybackTimeline(BOARD);
    expect(timeline.playerSlopes.some((segment) => segment.size > 0)).toBe(true);
  });

  for (const speed of [1, 0.25, 0.5, 1.5]) {
    it(`matches every frame of a jittery-frame-rate playback at ${speed}×`, () => {
      const legacy = createLegacyEngine(BOARD, "default", speed, continuityShare(BOARD));
      let timelineMs = 0;
      let frames = 0;
      for (const delta of frameDeltas(5000, 11 + speed * 100)) {
        legacy.step(delta);
        if (!legacy.playing) break;
        timelineMs += delta * speed;
        expectFramesMatch(legacy.frame, describeSample(BOARD, timelineMs), { ballCoordinates: false });
        frames += 1;
      }
      expect(legacy.playing).toBe(false);
      expect(frames).toBeGreaterThan(50);
    });
  }

  it("matches a phase playback across repeated mid-segment speed changes", () => {
    const legacy = createLegacyEngine(BOARD, "default", 1, continuityShare(BOARD));
    let speed = 1;
    let timelineMs = 0;
    const speeds = [0.25, 1.5, 0.5, 1, 1.25];
    frameDeltas(4000, 3).forEach((delta, index) => {
      if (!legacy.playing) return;
      if (index > 0 && index % 23 === 0) {
        speed = speeds[(index / 23) % speeds.length]!;
        legacy.setSpeed(speed);
      }
      legacy.step(delta);
      if (!legacy.playing) return;
      timelineMs += delta * speed;
      expectFramesMatch(legacy.frame, describeSample(BOARD, timelineMs), { ballCoordinates: false });
    });
    expect(legacy.playing).toBe(false);
  });

  it("matches a tap-to-pass at 1× frame for frame", () => {
    const passTarget: TimelineSnapshot = {
      players: START.players,
      football: [ball({ x: 62.5, y: 34.9, path: [{ x: 22.5, y: 44.9 }, { x: 62.5, y: 34.9 }] })],
    };
    const path = [START, passTarget];
    const legacy = createLegacyEngine(path, "possession-pass", 1);
    let timelineMs = 0;
    for (const delta of frameDeltas(1000, 5)) {
      legacy.step(delta);
      if (!legacy.playing) break;
      timelineMs += delta;
      expectFramesMatch(legacy.frame, describeSample(path, timelineMs, "possession-pass"));
    }
    expect(legacy.playing).toBe(false);
  });

  it("keeps tap-to-pass progress continuous through a mid-pass speed change (main jumped)", () => {
    const passTarget: TimelineSnapshot = {
      players: START.players,
      football: [ball({ x: 62.5, y: 34.9, path: [{ x: 22.5, y: 44.9 }, { x: 62.5, y: 34.9 }] })],
    };
    const timeline = compileSlatePlaybackTimeline([START, passTarget], "possession-pass");
    const before = sampleSlatePlaybackTimeline(timeline, 600);
    // Changing speed only changes how fast timelineMs advances afterwards;
    // the position at the moment of the change is untouched.
    const after = sampleSlatePlaybackTimeline(timeline, 600 + 0 * 0.25);
    expect(after).toEqual(before);

    const legacy = createLegacyEngine([START, passTarget], "possession-pass", 1);
    legacy.step(600);
    const legacyBefore = legacy.frame.balls.get("ball-1");
    legacy.setSpeed(0.25);
    legacy.step(1e-6);
    expect(legacy.frame.balls.get("ball-1")).not.toBe(legacyBefore);
  });
});
