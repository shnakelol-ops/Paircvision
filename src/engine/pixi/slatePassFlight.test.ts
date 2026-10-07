import { describe, expect, it } from "vitest";
import type { NormalizedPoint } from "../shared/normalization";
import { resolvePhaseSegmentDurationMs, resolveSegmentMaxMovementDistance } from "./routeFollowInterpolation";
import { SLATE_CARRY_RADIUS_WORLD } from "./slateCarryPresentation";
import { SLATE_PASS_SPEED_WORLD_PER_S, solvePassInterception } from "./slatePassFlight";
import {
  compileSlatePlaybackTimeline,
  passFlightKey,
  resolveFinalCarryAngles,
  sampleSlatePlaybackTimeline,
  type SlatePlaybackTimeline,
  type TimelineSnapshot,
} from "./slatePlaybackTimeline";

const SX = 1.6;
const V = SLATE_PASS_SPEED_WORLD_PER_S / 1000; // world units per 1× ms
const R = SLATE_CARRY_RADIUS_WORLD;

type Ball = TimelineSnapshot["football"][number];
type Waypoint = { x: number; y: number; path?: NormalizedPoint[] };

const held = (holder: string, at: { x: number; y: number }): Ball => ({
  id: "ball",
  x: at.x + 4 / SX,
  y: at.y - 3.2,
  attachedPlayerId: holder,
  isFree: false,
});

function board(tracks: Record<string, Waypoint[]>, holders: string[]): TimelineSnapshot[] {
  return holders.map((holder, index) => {
    const players = Object.entries(tracks).map(([id, track]) => {
      const point = track[Math.min(index, track.length - 1)]!;
      return { id, x: point.x, y: point.y, ...(point.path && index > 0 ? { path: point.path } : {}) };
    });
    const holderPoint = players.find((entry) => entry.id === holder)!;
    return { players, football: [held(holder, holderPoint)] };
  });
}

const world = (p: NormalizedPoint) => ({ x: p.x * SX, y: p.y });
const dist = (a: NormalizedPoint, b: NormalizedPoint) => Math.hypot((a.x - b.x) * SX, a.y - b.y);
const ballAt = (timeline: SlatePlaybackTimeline, ms: number) => sampleSlatePlaybackTimeline(timeline, ms).balls[0]!;
const playerAt = (timeline: SlatePlaybackTimeline, id: string, ms: number) =>
  sampleSlatePlaybackTimeline(timeline, ms).players.find((entry) => entry.id === id)!;
const flightOf = (timeline: SlatePlaybackTimeline, segment: number) =>
  timeline.passFlights.get(passFlightKey(segment, "ball"))!;

/** Speed (world units per ms) over [a, b]. */
function speed(timeline: SlatePlaybackTimeline, a: number, b: number): number {
  return dist(ballAt(timeline, a), ballAt(timeline, b)) / (b - a);
}

/** Largest perpendicular deviation (world units) of the drawn ball from the launch→arrival line. */
function straightness(timeline: SlatePlaybackTimeline, segment: number): number {
  const flight = flightOf(timeline, segment);
  const a = world(flight.start);
  const b = world(flight.end);
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  let worst = 0;
  for (let ms = flight.launchMs; ms < flight.arrivalMs; ms += 5) {
    const p = world(ballAt(timeline, ms));
    worst = Math.max(worst, Math.abs((p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x)) / length);
  }
  return worst;
}

describe("solvePassInterception", () => {
  it("stationary receiver: flight time is (distance − carry distance) / speed", () => {
    const solved = solvePassInterception({
      startWorld: { x: 0, y: 0 },
      receiverWorldAt: () => ({ x: 40, y: 0 }),
      carryDistanceWorld: 4,
      maxMs: 5000,
    });
    expect(solved.flightMs).toBeCloseTo(36 / V, 4);
    expect(solved.arrivalWorld.x).toBeCloseTo(36, 6);
  });

  it("moving receiver: meets them exactly at the carry distance, on their compiled path", () => {
    const receiverWorldAt = (ms: number) => ({ x: 40, y: ms * 0.01 });
    const solved = solvePassInterception({ startWorld: { x: 0, y: 0 }, receiverWorldAt, carryDistanceWorld: 4, maxMs: 5000 });
    const receiver = receiverWorldAt(solved.flightMs);
    expect(Math.hypot(receiver.x - solved.arrivalWorld.x, receiver.y - solved.arrivalWorld.y)).toBeCloseTo(4, 6);
    expect(Math.hypot(solved.arrivalWorld.x, solved.arrivalWorld.y)).toBeCloseTo(V * solved.flightMs, 6);
  });

  it("starting inside the carry distance is an immediate reception", () => {
    const solved = solvePassInterception({
      startWorld: { x: 0, y: 0 },
      receiverWorldAt: () => ({ x: 3, y: 0 }),
      carryDistanceWorld: 4,
      maxMs: 1000,
    });
    expect(solved.flightMs).toBe(0);
  });
});

describe("player-to-player pass flight in playback", () => {
  const pass = (to: { x: number; y: number }, receiverTrack?: Waypoint[]) =>
    compileSlatePlaybackTimeline(
      board({ a: [{ x: 20, y: 50 }], b: receiverTrack ?? [to] }, ["a", "b"]),
    );

  for (const [label, to] of [
    ["short", { x: 30, y: 50 }],
    ["medium", { x: 55, y: 50 }],
    ["long", { x: 75, y: 50 }],
    ["diagonal", { x: 50, y: 25 }],
  ] as const) {
    it(`${label} pass: straight, constant world speed from the first frame, duration ∝ distance`, () => {
      const timeline = pass(to);
      const flight = flightOf(timeline, 0);
      const flown = dist(flight.start, flight.end);
      expect(flight.arrivalMs - flight.launchMs).toBeCloseTo(flown / V, 6);
      expect(straightness(timeline, 0)).toBeLessThan(1e-6);
      const third = (flight.arrivalMs - flight.launchMs) / 3;
      for (const [a, b] of [
        [0, 1],
        [third, third + 1],
        [2 * third, 2 * third + 1],
        [3 * third - 1, 3 * third - 0.001],
      ] as const) {
        expect(speed(timeline, flight.launchMs + a, flight.launchMs + b) / V).toBeCloseTo(1, 6);
      }
      // Lands at the receiver's carry distance, then is carried.
      expect(dist(flight.end, playerAt(timeline, "b", flight.arrivalMs))).toBeCloseTo(R, 6);
      expect(ballAt(timeline, flight.arrivalMs + 1).kind).toBe("attached");
    });
  }

  it("no 900/1200ms floor on the flight itself: a short pass lands well before the phase ends", () => {
    const timeline = pass({ x: 30, y: 50 });
    const flight = flightOf(timeline, 0);
    expect(flight.arrivalMs - flight.launchMs).toBeLessThan(300);
    expect(timeline.segments[0]!.durationMs).toBe(1200);
  });

  it("moving receiver: received on the run, before they stop, at their carry distance", () => {
    const timeline = pass({ x: 0, y: 0 }, [{ x: 55, y: 70 }, { x: 60, y: 40 }]);
    const flight = flightOf(timeline, 0);
    const segmentEnd = timeline.segments[0]!.durationMs;
    expect(flight.arrivalMs).toBeLessThan(segmentEnd - 100);
    const before = playerAt(timeline, "b", flight.arrivalMs - 5);
    const after = playerAt(timeline, "b", flight.arrivalMs + 5);
    expect(dist(before, after) / 10).toBeGreaterThan(0.005);
    expect(dist(flight.end, playerAt(timeline, "b", flight.arrivalMs))).toBeCloseTo(R, 6);
    // No jump at reception: the carried ball starts exactly where the flight ended.
    expect(dist(ballAt(timeline, flight.arrivalMs), flight.end)).toBeLessThan(1e-6);
    expect(dist(ballAt(timeline, flight.arrivalMs - 0.01), ballAt(timeline, flight.arrivalMs + 0.01))).toBeLessThan(0.01);
  });

  it("receiver changing direction (freehand route): meeting point is on the compiled route", () => {
    const route: NormalizedPoint[] = [
      { x: 55, y: 70 },
      { x: 60, y: 62 },
      { x: 58, y: 52 },
      { x: 50, y: 46 },
    ];
    const timeline = pass({ x: 0, y: 0 }, [{ x: 55, y: 70 }, { x: 50, y: 46, path: route }]);
    const flight = flightOf(timeline, 0);
    expect(dist(flight.end, playerAt(timeline, "b", flight.arrivalMs))).toBeCloseTo(R, 6);
    expect(straightness(timeline, 0)).toBeLessThan(1e-6);
  });

  it("locked after launch: the flight is decided at compile time and never re-aims", () => {
    const timeline = pass({ x: 0, y: 0 }, [{ x: 55, y: 70 }, { x: 60, y: 40 }]);
    const flight = flightOf(timeline, 0);
    const mid = ballAt(timeline, (flight.launchMs + flight.arrivalMs) / 2);
    expect(mid.x).toBeCloseTo((flight.start.x + flight.end.x) / 2, 9);
    expect(mid.y).toBeCloseTo((flight.start.y + flight.end.y) / 2, 9);
  });

  it("passer running on: the ball leaves from the passer's presented carry point at the phase start", () => {
    const timeline = compileSlatePlaybackTimeline(
      board(
        { a: [{ x: 20, y: 50 }, { x: 35, y: 50 }, { x: 50, y: 50 }], b: [{ x: 50, y: 20 }] },
        ["a", "a", "b"],
      ),
    );
    const flight = flightOf(timeline, 1);
    expect(flight.launchMs).toBe(timeline.segments[1]!.startMs);
    expect(dist(ballAt(timeline, flight.launchMs - 0.01), ballAt(timeline, flight.launchMs))).toBeLessThan(0.01);
    // Carried ahead (east) at launch, so it leaves from the passer's east side.
    expect(flight.start.x).toBeCloseTo(35 + R / SX, 6);
    // The passer keeps running through the release.
    expect(dist(playerAt(timeline, "a", flight.launchMs - 10), playerAt(timeline, "a", flight.launchMs + 10))).toBeGreaterThan(0.1);
  });

  it("A → B → C: each pass launches from the current holder's presented side", () => {
    const timeline = compileSlatePlaybackTimeline(
      board(
        { a: [{ x: 20, y: 50 }], b: [{ x: 45, y: 30 }], c: [{ x: 70, y: 55 }] },
        ["a", "b", "c"],
      ),
    );
    const first = flightOf(timeline, 0);
    const second = flightOf(timeline, 1);
    expect(dist(first.end, playerAt(timeline, "b", first.arrivalMs))).toBeCloseTo(R, 6);
    // B was stationary: the ball stays on the side it arrived on, and the next pass leaves from there.
    expect(dist(second.start, first.end)).toBeLessThan(1e-6);
    expect(dist(second.end, playerAt(timeline, "c", second.arrivalMs))).toBeCloseTo(R, 6);
    expect(straightness(timeline, 1)).toBeLessThan(1e-6);
  });

  it("at the default speed, extension only applies beyond the 2800ms phase cap", () => {
    const authored = (path: TimelineSnapshot[], index: number) =>
      resolvePhaseSegmentDurationMs(resolveSegmentMaxMovementDistance(path[index]!, path[index + 1]!), 1);
    // Near full width (~150 world units): the authored duration already fits.
    const across = board({ a: [{ x: 3, y: 50 }, { x: 3, y: 50 }], b: [{ x: 97, y: 50 }] }, ["a", "a", "b"]);
    const acrossTimeline = compileSlatePlaybackTimeline(across);
    expect(acrossTimeline.segments[1]!.durationMs).toBe(authored(across, 1));
    // Corner to corner (~185 world units): longer than the 2800ms cap allows, so that phase extends.
    const corner = board({ a: [{ x: 1, y: 1 }, { x: 1, y: 1 }], b: [{ x: 99, y: 99 }] }, ["a", "a", "b"]);
    const cornerTimeline = compileSlatePlaybackTimeline(corner);
    expect(authored(corner, 1)).toBe(2800);
    expect(cornerTimeline.segments[1]!.durationMs).toBeGreaterThan(2800);
    expect(cornerTimeline.segments[0]!.durationMs).toBe(authored(corner, 0));
    const flight = flightOf(cornerTimeline, 1);
    const phase = cornerTimeline.segments[1]!;
    expect(flight.arrivalMs).toBeLessThanOrEqual(phase.startMs + phase.durationMs + 1e-6);
  });

  it("a pass longer than its phase (slower tuned speed) extends that phase only, and is received within it", () => {
    const path = board({ a: [{ x: 3, y: 50 }, { x: 3, y: 50 }, { x: 3, y: 50 }], b: [{ x: 97, y: 50 }] }, ["a", "a", "b"]);
    const speedWorldPerS = 30;
    const timeline = compileSlatePlaybackTimeline(path, "default", undefined, { passSpeedWorldPerS: speedWorldPerS });
    const authored = (index: number) =>
      resolvePhaseSegmentDurationMs(resolveSegmentMaxMovementDistance(path[index]!, path[index + 1]!), 1);
    const passPhase = timeline.segments[2 - 1]!;
    expect(passPhase.durationMs).toBeGreaterThan(authored(1));
    expect(timeline.segments[0]!.durationMs).toBe(authored(0));
    const flight = flightOf(timeline, 1);
    expect(flight.arrivalMs).toBeLessThanOrEqual(passPhase.startMs + passPhase.durationMs + 1e-6);
    expect(speed(timeline, flight.launchMs + 10, flight.launchMs + 11) / (speedWorldPerS / 1000)).toBeCloseTo(1, 6);
  });

  it("player movement is untouched by the pass (independent of pass speed when no phase is extended)", () => {
    const path = board({ a: [{ x: 20, y: 50 }, { x: 35, y: 45 }], b: [{ x: 55, y: 70 }, { x: 60, y: 40 }] }, ["a", "b"]);
    const slow = compileSlatePlaybackTimeline(path);
    const fast = compileSlatePlaybackTimeline(path, "default", undefined, { passSpeedWorldPerS: 240 });
    expect(slow.segments).toEqual(fast.segments);
    for (let ms = 0; ms <= slow.totalDurationMs; ms += 37) {
      expect(sampleSlatePlaybackTimeline(slow, ms).players).toEqual(sampleSlatePlaybackTimeline(fast, ms).players);
    }
    expect(flightOf(fast, 0).arrivalMs).toBeLessThan(flightOf(slow, 0).arrivalMs);
  });

  it("final state: the receiver ends holding the ball; snapshots are never modified", () => {
    const path = board({ a: [{ x: 20, y: 50 }], b: [{ x: 55, y: 70 }, { x: 60, y: 40 }] }, ["a", "b"]);
    const before = JSON.stringify(path);
    const timeline = compileSlatePlaybackTimeline(path);
    for (let ms = 0; ms <= timeline.totalDurationMs; ms += 20) sampleSlatePlaybackTimeline(timeline, ms);
    expect(ballAt(timeline, timeline.totalDurationMs - 0.01).kind).toBe("attached");
    expect(resolveFinalCarryAngles(timeline).has("ball")).toBe(true);
    expect(JSON.stringify(path)).toBe(before);
  });
});
