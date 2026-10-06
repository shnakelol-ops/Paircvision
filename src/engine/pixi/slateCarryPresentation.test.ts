import { describe, expect, it } from "vitest";
import type { NormalizedPoint } from "../shared/normalization";
import { resolveBallDrawRadius } from "./createTacticalPadLiteSurface";
import { resolveVisionV3DiscRadius } from "./createVisionV3PlayerToken";
import {
  buildCarryAngleTrack,
  CARRY_BALL_OVERLAP_FRACTION,
  CARRY_TURN_TIME_CONSTANT_MS,
  evaluateCarryAngle,
  resolveDefaultCarryAngle,
  resolvePresentedCarryDistance,
  resolvePresentedCarryPoint,
  SLATE_CARRY_RADIUS_WORLD,
} from "./slateCarryPresentation";
import {
  compileSlatePlaybackTimeline,
  resolveFinalCarryAngles,
  sampleSlatePlaybackTimeline,
  type SlatePlaybackTimeline,
  type SlateTimelineBallSample,
  type TimelineSnapshot,
} from "./slatePlaybackTimeline";

const DEG = Math.PI / 180;
const SX = 1.6;

type Ball = TimelineSnapshot["football"][number];
type Waypoint = { x: number; y: number; path?: NormalizedPoint[] };

/** Canonical (snapshot) carried point: holder + (4, −3.2) world. */
const canonical = (x: number, y: number) => ({ x: x + 4 / SX, y: y - 3.2 });
const held = (holder: string, at: { x: number; y: number }): Ball => ({
  id: "ball",
  ...canonical(at.x, at.y),
  attachedPlayerId: holder,
  isFree: false,
});
const loose = (x: number, y: number, path?: NormalizedPoint[]): Ball => ({
  id: "ball",
  x,
  y,
  attachedPlayerId: null,
  isFree: true,
  ...(path ? { path } : {}),
});

function board(tracks: Record<string, Waypoint[]>, balls: Ball[]): TimelineSnapshot[] {
  return balls.map((football, index) => ({
    players: Object.entries(tracks).map(([id, track]) => {
      const point = track[Math.min(index, track.length - 1)]!;
      return { id, x: point.x, y: point.y, ...(point.path && index > 0 ? { path: point.path } : {}) };
    }),
    football: [football],
  }));
}

function ballAt(timeline: SlatePlaybackTimeline, ms: number): SlateTimelineBallSample {
  return sampleSlatePlaybackTimeline(timeline, ms).balls[0]!;
}

function playerAt(timeline: SlatePlaybackTimeline, id: string, ms: number) {
  return sampleSlatePlaybackTimeline(timeline, ms).players.find((entry) => entry.id === id)!;
}

/** World angle of the ball relative to a player. */
function sideOf(timeline: SlatePlaybackTimeline, id: string, ms: number): number {
  const ball = ballAt(timeline, ms);
  const player = playerAt(timeline, id, ms);
  return Math.atan2(ball.y - player.y, (ball.x - player.x) * SX);
}

function worldDistance(a: NormalizedPoint, b: NormalizedPoint): number {
  return Math.hypot((a.x - b.x) * SX, a.y - b.y);
}

function angleGap(a: number, b: number): number {
  const turn = 2 * Math.PI;
  return Math.abs(((a - b + Math.PI) % turn + turn) % turn - Math.PI);
}

/** Largest ball jump (world units) between consecutive 1ms samples. */
function largestBallStep(timeline: SlatePlaybackTimeline, fromMs = 0, toMs = timeline.totalDurationMs - 1): number {
  let largest = 0;
  let previous = ballAt(timeline, fromMs);
  for (let ms = fromMs + 1; ms <= toMs; ms += 1) {
    const current = ballAt(timeline, ms);
    largest = Math.max(largest, worldDistance(previous, current));
    previous = current;
  }
  return largest;
}

describe("carry-angle track (critically damped turn)", () => {
  it("holds its angle with no direction events (a stationary holder keeps its side)", () => {
    const track = buildCarryAngleTrack(0, 1.2, []);
    for (const ms of [0, 50, 500, 5000]) expect(evaluateCarryAngle(track, ms)).toBe(1.2);
  });

  it("turns 90° without overshoot, ~90% done after 4τ", () => {
    const track = buildCarryAngleTrack(0, 0, [{ timeMs: 100, angle: 90 * DEG }]);
    let previous = 0;
    for (let ms = 100; ms <= 1200; ms += 5) {
      const angle = evaluateCarryAngle(track, ms);
      expect(angle).toBeGreaterThanOrEqual(previous - 1e-12);
      expect(angle).toBeLessThanOrEqual(90 * DEG + 1e-9);
      previous = angle;
    }
    expect(evaluateCarryAngle(track, 100 + 4 * CARRY_TURN_TIME_CONSTANT_MS) / (90 * DEG)).toBeGreaterThan(0.9);
  });

  it("swings a 180° reversal smoothly, within ~10° by 400ms", () => {
    const track = buildCarryAngleTrack(0, 0, [{ timeMs: 0, angle: Math.PI }]);
    expect(angleGap(evaluateCarryAngle(track, 400), Math.PI)).toBeLessThan(10 * DEG);
    let largestStep = 0;
    for (let ms = 1; ms <= 800; ms += 1) {
      largestStep = Math.max(largestStep, Math.abs(evaluateCarryAngle(track, ms) - evaluateCarryAngle(track, ms - 1)));
    }
    // Peak turn rate π/(τe) ≈ 0.78°/ms: a smooth swing, not a jump.
    expect(largestStep).toBeLessThan(0.9 * DEG);
  });

  it("always turns the short way round", () => {
    const track = buildCarryAngleTrack(0, 10 * DEG, [{ timeMs: 0, angle: -60 * DEG + 2 * Math.PI }]);
    const settled = evaluateCarryAngle(track, 2000);
    expect(settled).toBeCloseTo(-60 * DEG, 6);
  });

  it("is continuous through a retarget mid-turn (angle and rate carry over)", () => {
    const track = buildCarryAngleTrack(0, 0, [
      { timeMs: 0, angle: 90 * DEG },
      { timeMs: 120, angle: 0 },
    ]);
    expect(Math.abs(evaluateCarryAngle(track, 120.0001) - evaluateCarryAngle(track, 119.9999))).toBeLessThan(1e-4);
  });
});

describe("direction-aware carry during playback", () => {
  it("a straight run carries the ball ahead from the very first frame (no default→movement turn)", () => {
    const timeline = compileSlatePlaybackTimeline(
      board({ p: [{ x: 20, y: 50 }, { x: 40, y: 50 }, { x: 60, y: 50 }] }, [
        held("p", { x: 20, y: 50 }),
        held("p", { x: 40, y: 50 }),
        held("p", { x: 60, y: 50 }),
      ]),
    );
    for (const ms of [0, 200, 1000, 1700, timeline.totalDurationMs - 1]) {
      expect(sideOf(timeline, "p", ms)).toBeCloseTo(0, 6);
      expect(worldDistance(ballAt(timeline, ms), playerAt(timeline, "p", ms))).toBeCloseTo(SLATE_CARRY_RADIUS_WORLD, 6);
    }
  });

  it("90° corner: the ball turns smoothly to the new front", () => {
    const timeline = compileSlatePlaybackTimeline(
      board({ p: [{ x: 20, y: 70 }, { x: 40, y: 70 }, { x: 40, y: 40 }] }, [
        held("p", { x: 20, y: 70 }),
        held("p", { x: 40, y: 70 }),
        held("p", { x: 40, y: 40 }),
      ]),
    );
    const corner = timeline.segments[1]!.startMs;
    expect(sideOf(timeline, "p", corner - 1)).toBeCloseTo(0, 3);
    expect(angleGap(sideOf(timeline, "p", corner + 500), -90 * DEG)).toBeLessThan(2 * DEG);
    expect(largestBallStep(timeline)).toBeLessThan(0.2);
  });

  it("180° reversal: the ball swings round the player at the carry radius, never jumps", () => {
    const timeline = compileSlatePlaybackTimeline(
      board({ p: [{ x: 30, y: 50 }, { x: 55, y: 50 }, { x: 30, y: 50 }] }, [
        held("p", { x: 30, y: 50 }),
        held("p", { x: 55, y: 50 }),
        held("p", { x: 30, y: 50 }),
      ]),
    );
    const turn = timeline.segments[1]!.startMs;
    expect(sideOf(timeline, "p", turn - 1)).toBeCloseTo(0, 3);
    expect(angleGap(sideOf(timeline, "p", turn + 600), Math.PI)).toBeLessThan(3 * DEG);
    for (let ms = turn; ms < turn + 600; ms += 10) {
      expect(worldDistance(ballAt(timeline, ms), playerAt(timeline, "p", ms))).toBeCloseTo(SLATE_CARRY_RADIUS_WORLD, 6);
    }
    expect(largestBallStep(timeline)).toBeLessThan(0.2);
  });

  it("a holder who stops keeps the last direction; one who never moves keeps the canonical side", () => {
    const stops = compileSlatePlaybackTimeline(
      board({ p: [{ x: 20, y: 70 }, { x: 40, y: 50 }, { x: 40, y: 50 }] }, [
        held("p", { x: 20, y: 70 }),
        held("p", { x: 40, y: 50 }),
        held("p", { x: 40, y: 50 }),
      ]),
    );
    const runDirection = Math.atan2(-20, 20 * SX);
    expect(sideOf(stops, "p", stops.totalDurationMs - 1)).toBeCloseTo(runDirection, 6);

    const still = compileSlatePlaybackTimeline(
      board({ p: [{ x: 40, y: 50 }] }, [held("p", { x: 40, y: 50 }), held("p", { x: 40, y: 50 })]),
    );
    const ball = ballAt(still, 300);
    expect(ball.x).toBeCloseTo(canonical(40, 50).x, 9);
    expect(ball.y).toBeCloseTo(canonical(40, 50).y, 9);
  });

  it("a holder who starts moving later begins on that movement side (initialised from first movement)", () => {
    const timeline = compileSlatePlaybackTimeline(
      board({ p: [{ x: 40, y: 50 }, { x: 40, y: 50 }, { x: 40, y: 20 }] }, [
        held("p", { x: 40, y: 50 }),
        held("p", { x: 40, y: 50 }),
        held("p", { x: 40, y: 20 }),
      ]),
    );
    for (const ms of [0, 600, timeline.segments[1]!.startMs + 300]) {
      expect(sideOf(timeline, "p", ms)).toBeCloseTo(-90 * DEG, 6);
    }
  });

  it("freehand route: the ball follows the route's turns smoothly", () => {
    const route: NormalizedPoint[] = [
      { x: 20, y: 70 },
      { x: 28, y: 69 },
      { x: 35, y: 65 },
      { x: 40, y: 58 },
      { x: 42, y: 50 },
    ];
    const timeline = compileSlatePlaybackTimeline(
      board({ p: [{ x: 20, y: 70 }, { x: 42, y: 50, path: route }] }, [
        held("p", { x: 20, y: 70 }),
        held("p", { x: 42, y: 50 }),
      ]),
    );
    const early = sideOf(timeline, "p", 150);
    const late = sideOf(timeline, "p", timeline.totalDurationMs - 1);
    expect(angleGap(early, Math.atan2(-1, 8 * SX))).toBeLessThan(8 * DEG);
    expect(late).toBeLessThan(early - 40 * DEG);
    expect(largestBallStep(timeline)).toBeLessThan(0.2);
  });

  it("pickup: the ball converges onto the holder's presented side, starting toward where it lay", () => {
    const timeline = compileSlatePlaybackTimeline(
      board({ p: [{ x: 40, y: 50 }, { x: 60, y: 50 }] }, [loose(46, 44), held("p", { x: 60, y: 50 })]),
    );
    const start = ballAt(timeline, 0);
    expect(start.x).toBeCloseTo(46, 9);
    expect(start.y).toBeCloseTo(44, 9);
    const end = ballAt(timeline, timeline.totalDurationMs - 1);
    expect(end.kind).toBe("pickup");
    expect(worldDistance(end, playerAt(timeline, "p", timeline.totalDurationMs - 1))).toBeCloseTo(
      SLATE_CARRY_RADIUS_WORLD,
      3,
    );
    expect(sideOf(timeline, "p", timeline.totalDurationMs - 1)).toBeCloseTo(0, 2);
  });

  it("pass (holder switch): leaves from the passer's presented side and lands where the receiver's carry continues", () => {
    const timeline = compileSlatePlaybackTimeline(
      board(
        {
          a: [{ x: 20, y: 30 }, { x: 40, y: 30 }, { x: 45, y: 30 }, { x: 45, y: 30 }],
          b: [{ x: 60, y: 60 }, { x: 60, y: 60 }, { x: 60, y: 60 }, { x: 60, y: 80 }],
        },
        [held("a", { x: 20, y: 30 }), held("a", { x: 40, y: 30 }), held("b", { x: 60, y: 60 }), held("b", { x: 60, y: 80 })],
      ),
    );
    const passStart = timeline.segments[1]!.startMs;
    const passEnd = timeline.segments[2]!.startMs;
    // Continuous into the pass from the carry, and out of it into the receiver's carry.
    expect(worldDistance(ballAt(timeline, passStart - 0.001), ballAt(timeline, passStart))).toBeLessThan(0.01);
    expect(worldDistance(ballAt(timeline, passEnd - 0.001), ballAt(timeline, passEnd))).toBeLessThan(0.01);
    expect(ballAt(timeline, passStart).kind).toBe("holder-switch");
    expect(ballAt(timeline, passEnd).kind).toBe("attached");
    // Passer was running east, so the pass leaves from their east side.
    const leaving = ballAt(timeline, passStart);
    expect(leaving.x).toBeCloseTo(40 + SLATE_CARRY_RADIUS_WORLD / SX, 6);
    // Receiver then runs south (+y); the ball rotates round to that side.
    expect(angleGap(sideOf(timeline, "b", timeline.totalDurationMs - 1), 90 * DEG)).toBeLessThan(3 * DEG);
    expect(largestBallStep(timeline, 0, passStart - 1)).toBeLessThan(0.2);
    expect(largestBallStep(timeline, passEnd, timeline.totalDurationMs - 1)).toBeLessThan(0.2);
  });

  it("release into space leaves from the presented side and still ends on the authored point", () => {
    const timeline = compileSlatePlaybackTimeline(
      board({ a: [{ x: 20, y: 50 }, { x: 40, y: 70 }, { x: 40, y: 70 }] }, [
        held("a", { x: 20, y: 50 }),
        held("a", { x: 40, y: 70 }),
        loose(70, 40),
      ]),
    );
    const release = timeline.segments[1]!.startMs;
    expect(worldDistance(ballAt(timeline, release - 0.001), ballAt(timeline, release))).toBeLessThan(0.01);
    const end = ballAt(timeline, timeline.totalDurationMs - 0.001);
    expect(end.x).toBeCloseTo(70, 3);
    expect(end.y).toBeCloseTo(40, 3);
  });

  it("tap-to-pass leaves from the side the ball was drawn on when tapped", () => {
    const start: TimelineSnapshot = {
      players: [{ id: "a", x: 30, y: 50 }, { id: "b", x: 60, y: 50 }],
      football: [held("a", { x: 30, y: 50 })],
    };
    const target: TimelineSnapshot = { players: start.players, football: [loose(60 + 2.5, 50 - 3.2)] };
    const presentedAngle = 180 * DEG;
    const timeline = compileSlatePlaybackTimeline([start, target], "possession-pass", undefined, {
      initialAngleByBallId: new Map([["ball", presentedAngle]]),
    });
    const leaving = ballAt(timeline, 0);
    expect(leaving.x).toBeCloseTo(resolvePresentedCarryPoint({ x: 30, y: 50 }, presentedAngle).x, 9);
    // Without a retained side it is exactly the old canonical start.
    const plain = compileSlatePlaybackTimeline([start, target], "possession-pass");
    expect(ballAt(plain, 0).x).toBeCloseTo(start.football[0]!.x, 9);
  });

  it("keeps the final carry side for after playback", () => {
    const timeline = compileSlatePlaybackTimeline(
      board({ p: [{ x: 20, y: 50 }, { x: 20, y: 20 }] }, [held("p", { x: 20, y: 50 }), held("p", { x: 20, y: 20 })]),
    );
    expect(resolveFinalCarryAngles(timeline).get("ball")).toBeCloseTo(-90 * DEG, 6);
  });

  it("free balls (multi-ball) have no carry spans and are untouched", () => {
    const timeline = compileSlatePlaybackTimeline(
      board({ p: [{ x: 20, y: 50 }, { x: 40, y: 50 }] }, [loose(30, 30), loose(50, 30)]),
    );
    expect(timeline.carrySpans.size).toBe(0);
    expect(resolveFinalCarryAngles(timeline).size).toBe(0);
  });

  it("near the touchline the presented ball stays on the pitch", () => {
    const point = resolvePresentedCarryPoint({ x: 99, y: 1 }, -45 * DEG);
    expect(point.x).toBeLessThanOrEqual(100);
    expect(point.y).toBeGreaterThanOrEqual(0);
    // And the canonical default picks an on-pitch offset, as the snapshot does.
    expect(resolveDefaultCarryAngle({ x: 99, y: 1 })).toBeCloseTo(Math.atan2(3.2, -4), 9);
  });

  it("never changes the snapshots it was compiled from", () => {
    const path = board({ p: [{ x: 20, y: 50 }, { x: 40, y: 30 }] }, [held("p", { x: 20, y: 50 }), held("p", { x: 40, y: 30 })]);
    const before = JSON.stringify(path);
    const timeline = compileSlatePlaybackTimeline(path);
    for (let ms = 0; ms <= timeline.totalDurationMs; ms += 25) sampleSlatePlaybackTimeline(timeline, ms);
    resolveFinalCarryAngles(timeline);
    expect(JSON.stringify(path)).toBe(before);
  });
});

describe("presentation carry distance (player radius + ball radius − overlap)", () => {
  // Rendered Vision V3 disc radius: Normal at token scale 1, Compact/Practice at 0.75.
  const visionV3Normal = resolveVisionV3DiscRadius(4.1 * 0.8);
  const visionV3Compact = visionV3Normal * 0.75;

  it("matches the measured rendered radii", () => {
    expect(visionV3Normal).toBeCloseTo(3.4768, 4);
    expect(visionV3Compact).toBeCloseTo(2.6076, 4);
    expect(resolveBallDrawRadius("football")).toBeCloseTo(1.98, 9);
  });

  it("overlaps by a quarter of the ball's radius", () => {
    expect(CARRY_BALL_OVERLAP_FRACTION).toBe(0.25);
    const overlap = (player: number, ball: number) => player + ball - resolvePresentedCarryDistance(player, ball);
    const football = resolveBallDrawRadius("football")!;
    // ~0.5 world units for a football, in every Vision V3 mode.
    expect(overlap(visionV3Normal, football)).toBeCloseTo(0.495, 9);
    expect(overlap(visionV3Compact, football)).toBeCloseTo(0.495, 9);
    expect(resolvePresentedCarryDistance(visionV3Normal, football)).toBeCloseTo(4.962, 3);
    expect(resolvePresentedCarryDistance(visionV3Compact, football)).toBeCloseTo(4.093, 3);
    // Smaller balls overlap proportionally less, larger ones more.
    const sizes = ["footballSmall", "football", "footballLarge", "sliotarSmall", "sliotar", "sliotarLarge"] as const;
    for (const type of sizes) {
      const ball = resolveBallDrawRadius(type)!;
      expect(overlap(visionV3Compact, ball)).toBeCloseTo(ball * 0.25, 12);
    }
    expect(overlap(visionV3Compact, resolveBallDrawRadius("footballSmall")!)).toBeLessThan(
      overlap(visionV3Compact, resolveBallDrawRadius("football")!),
    );
  });

  it("is used by playback for that ball, leaving the carry angle unchanged", () => {
    const path = board({ p: [{ x: 20, y: 50 }, { x: 40, y: 30 }] }, [held("p", { x: 20, y: 50 }), held("p", { x: 40, y: 30 })]);
    const plain = compileSlatePlaybackTimeline(path);
    const tuned = compileSlatePlaybackTimeline(path, "default", undefined, { distanceByBallId: new Map([["ball", 4.093]]) });
    for (const ms of [0, 300, 900, plain.totalDurationMs - 1]) {
      expect(sideOf(tuned, "p", ms)).toBeCloseTo(sideOf(plain, "p", ms), 9);
      expect(worldDistance(ballAt(tuned, ms), playerAt(tuned, "p", ms))).toBeCloseTo(4.093, 6);
      expect(worldDistance(ballAt(plain, ms), playerAt(plain, "p", ms))).toBeCloseTo(SLATE_CARRY_RADIUS_WORLD, 6);
      expect(playerAt(tuned, "p", ms)).toEqual(playerAt(plain, "p", ms));
    }
    expect(JSON.stringify(path)).toBe(
      JSON.stringify(board({ p: [{ x: 20, y: 50 }, { x: 40, y: 30 }] }, [held("p", { x: 20, y: 50 }), held("p", { x: 40, y: 30 })])),
    );
  });
});
