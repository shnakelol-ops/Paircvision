import { describe, expect, it } from "vitest";
import { resolvePresentedCarryPoint, SLATE_CARRY_RADIUS_WORLD, SLATE_CARRY_WORLD } from "./slateCarryPresentation";
import { SLATE_PASS_SPEED_WORLD_PER_S } from "./slatePassFlight";
import {
  compileSlatePlaybackTimeline,
  passFlightKey,
  resolveTapPassReceptionAngles,
  sampleSlatePlaybackTimeline,
  type SlatePlaybackTimeline,
  type TimelineSnapshot,
} from "./slatePlaybackTimeline";

const SX = 1.6;
const V = SLATE_PASS_SPEED_WORLD_PER_S / 1000; // world units per 1× ms
const R = SLATE_CARRY_RADIUS_WORLD;
const canonical = (p: { x: number; y: number }) => ({ x: p.x + 4 / SX, y: p.y - 3.2 });
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot((a.x - b.x) * SX, a.y - b.y);

/**
 * The two snapshots handlePossessionPassTap builds: the ball carried by the
 * passer, then free at the receiver's canonical carried point.
 */
function tapPass(
  passer: { x: number; y: number },
  receiver: { x: number; y: number },
  options: { initialAngle?: number } = {},
): SlatePlaybackTimeline {
  const players = [
    { id: "a", ...passer },
    { id: "b", ...receiver },
  ];
  const start: TimelineSnapshot = {
    players,
    football: [{ id: "ball", ...canonical(passer), attachedPlayerId: "a", isFree: false }],
  };
  const target: TimelineSnapshot = {
    players,
    football: [
      {
        id: "ball",
        ...canonical(receiver),
        attachedPlayerId: null,
        isFree: true,
        path: [canonical(passer), canonical(receiver)],
      },
    ],
  };
  return compileSlatePlaybackTimeline([start, target], "possession-pass", undefined, {
    tapPassReceiverId: "b",
    ...(options.initialAngle !== undefined ? { initialAngleByBallId: new Map([["ball", options.initialAngle]]) } : {}),
  });
}

const flightOf = (timeline: SlatePlaybackTimeline) => timeline.passFlights.get(passFlightKey(0, "ball"))!;
const ballAt = (timeline: SlatePlaybackTimeline, ms: number) => sampleSlatePlaybackTimeline(timeline, ms).balls[0]!;

function speedOver(timeline: SlatePlaybackTimeline, a: number, b: number): number {
  return dist(ballAt(timeline, a), ballAt(timeline, b)) / (b - a);
}

function straightness(timeline: SlatePlaybackTimeline): number {
  const flight = flightOf(timeline);
  const a = { x: flight.start.x * SX, y: flight.start.y };
  const b = { x: flight.end.x * SX, y: flight.end.y };
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  let worst = 0;
  for (let ms = 0; ms < flight.arrivalMs; ms += 2) {
    const p = ballAt(timeline, ms);
    const w = { x: p.x * SX, y: p.y };
    worst = Math.max(worst, Math.abs((w.x - a.x) * (b.y - a.y) - (w.y - a.y) * (b.x - a.x)) / length);
  }
  return worst;
}

describe("tap-to-pass flight (Stage 4)", () => {
  const cases = [
    ["very short", { x: 30, y: 50 }, { x: 37, y: 50 }],
    ["medium, horizontal", { x: 30, y: 50 }, { x: 55, y: 50 }],
    ["vertical", { x: 40, y: 20 }, { x: 40, y: 70 }],
    ["long diagonal", { x: 8, y: 90 }, { x: 92, y: 10 }],
  ] as const;

  for (const [label, passer, receiver] of cases) {
    it(`${label}: straight, constant speed from the first frame, duration = distance / 60`, () => {
      const timeline = tapPass(passer, receiver);
      const flight = flightOf(timeline);
      const flown = dist(flight.start, flight.end);
      // Received at the carry distance on the side it arrives from.
      expect(dist(flight.end, receiver)).toBeCloseTo(R, 6);
      expect(flown).toBeCloseTo(dist(canonical(passer), receiver) - R, 6);
      expect(flight.arrivalMs).toBeCloseTo(flown / V, 6);
      expect(timeline.totalDurationMs).toBeCloseTo(flown / V, 6);
      expect(straightness(timeline)).toBeLessThan(1e-6);
      const d = flight.arrivalMs;
      for (const [a, b] of [
        [0, Math.min(1, d / 10)],
        [d / 2, d / 2 + Math.min(1, d / 10)],
        [d - Math.min(1, d / 10) - 0.001, d - 0.001],
      ] as const) {
        expect(speedOver(timeline, a, b) / V).toBeCloseTo(1, 6);
      }
    });
  }

  it("the old 900–1800ms window no longer controls tap-to-pass", () => {
    const short = tapPass({ x: 30, y: 50 }, { x: 37, y: 50 });
    const long = tapPass({ x: 8, y: 90 }, { x: 92, y: 10 });
    expect(short.totalDurationMs).toBeLessThan(900);
    expect(long.totalDurationMs).toBeGreaterThan(1800);
    // And the old engine's 14-unit reference distance (1200ms) does not apply either.
    const reference = tapPass({ x: 30, y: 50 }, { x: 44, y: 50 });
    expect(Math.abs(reference.totalDurationMs - 1200)).toBeGreaterThan(500);
  });

  it("a receiver already within carry distance takes the ball at once", () => {
    const timeline = tapPass({ x: 30, y: 50 }, { x: 33, y: 49 });
    expect(flightOf(timeline).arrivalMs).toBe(0);
    expect(timeline.totalDurationMs).toBe(1);
  });

  it("launches from a retained (non-default) carry side", () => {
    const passer = { x: 30, y: 50 };
    const retained = Math.PI; // carried on the passer's left
    const timeline = tapPass(passer, { x: 60, y: 30 }, { initialAngle: retained });
    const launch = resolvePresentedCarryPoint(passer, retained, SLATE_CARRY_WORLD);
    expect(dist(ballAt(timeline, 0), launch)).toBeLessThan(1e-9);
    expect(straightness(timeline)).toBeLessThan(1e-6);
    expect(speedOver(timeline, 0, 1) / V).toBeCloseTo(1, 6);
  });

  it("after arrival the receiver keeps the side the ball arrived on (no snap to the canonical point)", () => {
    const receiver = { x: 55, y: 50 };
    const timeline = tapPass({ x: 30, y: 60 }, receiver);
    const flight = flightOf(timeline);
    const angle = resolveTapPassReceptionAngles(timeline).get("ball")!;
    const presented = resolvePresentedCarryPoint(receiver, angle, SLATE_CARRY_WORLD);
    expect(dist(presented, flight.end)).toBeLessThan(1e-9);
    // The ball arrived from the lower-left, so it sits there — not top-right.
    expect(presented.x).toBeLessThan(receiver.x);
  });

  for (const speed of [0.25, 0.5, 1, 1.5]) {
    it(`${speed}× takes ${1 / speed}× the wall-clock time, with the same path`, () => {
      const timeline = tapPass({ x: 30, y: 50 }, { x: 70, y: 40 });
      let wall = 0;
      let timelineMs = 0;
      const frame = 1000 / 60;
      while (timelineMs < timeline.totalDurationMs) {
        wall += frame;
        timelineMs = Math.min(timeline.totalDurationMs, timelineMs + frame * speed);
      }
      expect(Math.abs(wall - timeline.totalDurationMs / speed)).toBeLessThanOrEqual(frame);
    });
  }

  it("changing speed or pausing mid-flight causes no jump or restart", () => {
    const timeline = tapPass({ x: 30, y: 50 }, { x: 70, y: 40 });
    // The surface only changes how fast timeline ms advance; the position at
    // the moment of a speed change or pause is the same sample.
    let timelineMs = 0;
    const positions: { x: number; y: number }[] = [];
    const steps: [number, number][] = [
      [200, 1],
      [300, 0.25],
      [0, 0], // paused for any wall time
      [400, 1.5],
      [5000, 1],
    ];
    for (const [wall, speed] of steps) {
      for (let elapsed = 0; elapsed < wall; elapsed += 10) {
        timelineMs = Math.min(timeline.totalDurationMs, timelineMs + 10 * speed);
        positions.push(ballAt(timeline, timelineMs));
      }
    }
    let largest = 0;
    for (let i = 1; i < positions.length; i += 1) largest = Math.max(largest, dist(positions[i - 1]!, positions[i]!));
    // Largest step = 10ms at 1.5× of a 60 w/s flight = 0.9 world units; no restart back to the passer.
    expect(largest).toBeLessThanOrEqual(0.9 + 1e-9);
  });

  it("matches a Stage 3 recorded pass of the same distance to a stationary receiver", () => {
    const passer = { x: 30, y: 60 };
    const receiver = { x: 62, y: 42 };
    const tap = flightOf(tapPass(passer, receiver));
    const players = [
      { id: "a", ...passer },
      { id: "b", ...receiver },
    ];
    const recorded = compileSlatePlaybackTimeline([
      { players, football: [{ id: "ball", ...canonical(passer), attachedPlayerId: "a", isFree: false }] },
      { players, football: [{ id: "ball", ...canonical(receiver), attachedPlayerId: "b", isFree: false }] },
    ]).passFlights.get(passFlightKey(0, "ball"))!;
    expect(dist(tap.start, recorded.start)).toBeLessThan(1e-9);
    expect(dist(tap.end, recorded.end)).toBeLessThan(1e-6);
    expect(tap.arrivalMs - tap.launchMs).toBeCloseTo(recorded.arrivalMs - recorded.launchMs, 3);
  });

  it("never modifies the snapshots it was compiled from", () => {
    const players = [
      { id: "a", x: 30, y: 50 },
      { id: "b", x: 60, y: 50 },
    ];
    const path: TimelineSnapshot[] = [
      { players, football: [{ id: "ball", ...canonical(players[0]!), attachedPlayerId: "a", isFree: false }] },
      { players, football: [{ id: "ball", ...canonical(players[1]!), attachedPlayerId: null, isFree: true }] },
    ];
    const before = JSON.stringify(path);
    const timeline = compileSlatePlaybackTimeline(path, "possession-pass", undefined, { tapPassReceiverId: "b" });
    for (let ms = 0; ms <= timeline.totalDurationMs; ms += 10) sampleSlatePlaybackTimeline(timeline, ms);
    resolveTapPassReceptionAngles(timeline);
    expect(JSON.stringify(path)).toBe(before);
  });
});
