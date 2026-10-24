import { describe, expect, it } from "vitest";

import {
  BALL_PATH_CAPTURE_MIN_DISTANCE,
  composeBallSnapshotPath,
  createBallWorkingPath,
  isBallCaptureSampleTooClose,
  sampleRoutePoints,
  shouldResetBallWorkingPathsAfterPlayback,
  type PhaseBallSnapshot,
  type PhaseSnapshot,
} from "./createTacticalPadLiteSurface";
import { resolveMovementDistance, resolveStoredRoutePolyline } from "./routeFollowInterpolation";
import { compileSlatePlaybackTimeline, sampleSlatePlaybackTimeline } from "./slatePlaybackTimeline";
import type { NormalizedPoint } from "../shared/normalization";

/**
 * Free Ball path leak — a ball's working path (BallRuntimeState.path) must
 * not carry a restored phase's saved route into the coach's next movement.
 *
 * createTacticalPadLiteSurface() itself cannot be instantiated here (no
 * jsdom/canvas in this repo — see freeMultiBall.test.ts), so the surface's
 * working-path lifecycle is replayed step by step with the real exported
 * functions each step uses:
 *
 *   restore  applySnapshotToSurface copies snapshot.path into working state
 *   reset    resetBallMovementPath     -> createBallWorkingPath
 *   drag     appendBallMovementPathPoint -> isBallCaptureSampleTooClose,
 *            then releaseActiveDrag    -> sampleRoutePoints
 *   capture  captureCurrentSnapshot    -> composeBallSnapshotPath
 *   play     compileSlatePlaybackTimeline / sampleSlatePlaybackTimeline
 *
 * Which surface operations reset is shouldResetBallWorkingPathsAfterPlayback
 * (playback completion) plus unconditional resets in goToPhase/undoPhase.
 */

const BALL_ID = "ball-1";

/** applySnapshotToSurface: the working path becomes a copy of the snapshot's saved path. */
function restoreWorkingPath(ball: PhaseBallSnapshot): NormalizedPoint[] {
  return ball.path?.map((point) => ({ x: point.x, y: point.y })) ?? [];
}

/** A drag gesture onto an existing working path, exactly as the surface records and commits it. */
function dragBall(workingPath: readonly NormalizedPoint[], samples: readonly NormalizedPoint[]): NormalizedPoint[] {
  const path = workingPath.map((point) => ({ ...point }));
  const append = (sample: NormalizedPoint) => {
    if (isBallCaptureSampleTooClose(path[path.length - 1], sample, BALL_PATH_CAPTURE_MIN_DISTANCE)) return;
    path.push(sample);
  };
  for (const sample of samples) append(sample);
  // releaseActiveDrag: one final append of the ball's position, then smooth once.
  const last = samples[samples.length - 1];
  if (last) append(last);
  return path.length >= 2 ? sampleRoutePoints(path) : path;
}

/** captureCurrentSnapshot for a free ball sitting at `end`. */
function captureFreeBall(workingPath: readonly NormalizedPoint[], end: NormalizedPoint): PhaseBallSnapshot {
  const path = composeBallSnapshotPath(workingPath, true, end);
  return { id: BALL_ID, x: end.x, y: end.y, attachedPlayerId: null, isFree: true, ...(path ? { path } : {}) };
}

// The audit reproduction: a curved ball movement (20,50) -> (60,50) bowing up
// to y≈35, then a straight 21-unit movement (60,50) -> (81,50).
const CURVE_START = { x: 20, y: 50 };
const CURVE_END = { x: 60, y: 50 };
const CURVE_SAMPLES = Array.from({ length: 41 }, (_, i) => ({ x: 20 + i, y: 50 - 15 * Math.sin((Math.PI * i) / 40) }));
const STRAIGHT_SAMPLES = Array.from({ length: 21 }, (_, i) => ({ x: 61 + i, y: 50 }));
const STRAIGHT_END = { x: 81, y: 50 };

function curvedPhaseBall(): PhaseBallSnapshot {
  return captureFreeBall(dragBall(createBallWorkingPath(CURVE_START), CURVE_SAMPLES), CURVE_END);
}

/** The next movement as authored after restoring `restored`: with the fix (reset) or as before it (leaked). */
function nextMovement(restored: PhaseBallSnapshot, { reset }: { reset: boolean }): PhaseBallSnapshot {
  const working = reset ? createBallWorkingPath(restored) : restoreWorkingPath(restored);
  return captureFreeBall(dragBall(working, STRAIGHT_SAMPLES), STRAIGHT_END);
}

/** True when any point lies on the earlier curve's bulge rather than the straight y=50 line. */
function touchesEarlierCurve(path: readonly NormalizedPoint[]): boolean {
  return path.some((point) => point.y < 49.5 || point.x < CURVE_END.x - 0.01);
}

function snapshot(ballEntry: PhaseBallSnapshot, player: NormalizedPoint): PhaseSnapshot {
  return { players: [{ id: "p1", x: player.x, y: player.y }], football: [ballEntry] };
}

describe("Test 1 — a previous path does not leak into a new movement", () => {
  it("the new straight route contains no points from the earlier curve", () => {
    const phase1 = curvedPhaseBall();
    expect(phase1.path!.some((point) => point.y < 40)).toBe(true);

    const fixed = nextMovement(phase1, { reset: true });
    expect(touchesEarlierCurve(fixed.path!)).toBe(false);
    expect(fixed.path![0]).toEqual(CURVE_END);
    expect(fixed.path![fixed.path!.length - 1]).toEqual(STRAIGHT_END);
  });

  it("reproduces the original leak when the restored path is not reset (control)", () => {
    const leaked = nextMovement(curvedPhaseBall(), { reset: false });
    expect(touchesEarlierCurve(leaked.path!)).toBe(true);
    expect(leaked.path![0]).toEqual(CURVE_START);
  });
});

describe("Test 2 — playback distance uses only the intended movement", () => {
  it("the audit example: ~21 units clean, ~72.5 units leaked", () => {
    const phase1 = curvedPhaseBall();
    const fixed = nextMovement(phase1, { reset: true });
    const leaked = nextMovement(phase1, { reset: false });
    expect(resolveMovementDistance(phase1, fixed)).toBeCloseTo(21, 1);
    expect(resolveMovementDistance(phase1, leaked)).toBeCloseTo(72.5, 0);
  });

  it("the walked polyline starts at the restored position and never moves backwards", () => {
    const phase1 = curvedPhaseBall();
    const polyline = resolveStoredRoutePolyline(phase1, nextMovement(phase1, { reset: true }))!;
    expect(polyline[0]).toEqual(CURVE_END);
    for (let index = 1; index < polyline.length; index += 1) {
      expect(polyline[index]!.x).toBeGreaterThanOrEqual(polyline[index - 1]!.x);
    }
  });
});

describe("Test 3 — an unrelated previous ball path no longer lengthens the next phase", () => {
  // p1 stands still through phase 1, then runs 15 units in phase 2 (the last
  // phase), so it starts and ends phase 2 at rest — a plain smoothstep walk.
  const start = snapshot({ id: BALL_ID, ...CURVE_START, attachedPlayerId: null, isFree: true }, { x: 40, y: 80 });
  const phase1 = snapshot(curvedPhaseBall(), { x: 40, y: 80 });
  const timelineFor = (reset: boolean) =>
    compileSlatePlaybackTimeline([start, phase1, snapshot(nextMovement(phase1.football[0]!, { reset }), { x: 55, y: 80 })]);

  it("phase 2 takes the duration its own movements need, not the leaked arc length's", () => {
    expect(timelineFor(true).segments[1]!.durationMs).toBeCloseTo(1220, 0);
    expect(timelineFor(false).segments[1]!.durationMs).toBeGreaterThan(2200);
  });

  it("phase 1's timing is unaffected either way", () => {
    expect(timelineFor(true).segments[0]).toEqual(timelineFor(false).segments[0]);
  });

  it("the player is back on time: halfway through the run at the segment's midpoint", () => {
    const fixed = timelineFor(true);
    const segment = fixed.segments[1]!;
    const midpoint = sampleSlatePlaybackTimeline(fixed, segment.startMs + segment.durationMs / 2);
    expect(midpoint.players.find((entry) => entry.id === "p1")!.x).toBeCloseTo(47.5, 5);

    const leaked = timelineFor(false);
    const leakedMidpoint = sampleSlatePlaybackTimeline(leaked, segment.startMs + segment.durationMs / 2);
    expect(leakedMidpoint.players.find((entry) => entry.id === "p1")!.x).toBeLessThan(46);
  });
});

describe("Test 4 — Undo Phase", () => {
  it("restores the previous phase's position and a new movement does not inherit its route", () => {
    const phase1 = curvedPhaseBall();
    const phase2 = nextMovement(phase1, { reset: true });
    const phases = [phase1, phase2];
    const savedBefore = JSON.stringify(phases);

    // undoPhase: drop the last phase, restore the previous one, then reset.
    const remaining = phases.slice(0, -1);
    const restored = remaining[remaining.length - 1]!;
    const working = createBallWorkingPath(restored);
    expect(working).toEqual([CURVE_END]);

    const redo = captureFreeBall(dragBall(working, STRAIGHT_SAMPLES), STRAIGHT_END);
    expect(touchesEarlierCurve(redo.path!)).toBe(false);
    expect(JSON.stringify(phases)).toBe(savedBefore);
  });
});

describe("Test 5 — saved sequence playback completion", () => {
  it("resets working paths when a start → saved phases playback finishes", () => {
    expect(shouldResetBallWorkingPathsAfterPlayback({ kind: "default", tracksPhaseCursor: true })).toBe(true);
  });

  it("the next movement after playback lands on the last phase starts a clean route", () => {
    const lastPhase = curvedPhaseBall();
    // stepPlayback lands on the last phase (applySnapshotToSurface), then resets.
    const next = nextMovement(lastPhase, { reset: true });
    expect(touchesEarlierCurve(next.path!)).toBe(false);
    expect(resolveMovementDistance(lastPhase, next)).toBeCloseTo(21, 1);
  });
});

describe("Test 6 — no-phase Start → Current playback keeps its accumulated route", () => {
  it("single playback and tap-to-pass completions do not reset working paths", () => {
    expect(shouldResetBallWorkingPathsAfterPlayback({ kind: "default", tracksPhaseCursor: false })).toBe(false);
    expect(shouldResetBallWorkingPathsAfterPlayback({ kind: "possession-pass", tracksPhaseCursor: false })).toBe(false);
  });

  it("Play, drag further, Play again still walks the whole route from start", () => {
    const startBall: PhaseBallSnapshot = { id: BALL_ID, ...CURVE_START, attachedPlayerId: null, isFree: true };
    // Set Start resets, the coach drags the curve, Play captures the target.
    const firstTarget = curvedPhaseBall();
    // Playback completes on the target with its path restored and — single
    // playback — not reset; the coach then drags further and plays again.
    const secondTarget = nextMovement(firstTarget, { reset: false });

    const polyline = resolveStoredRoutePolyline(startBall, secondTarget)!;
    expect(polyline[0]).toEqual(CURVE_START);
    expect(polyline.some((point) => point.y < 40)).toBe(true);
    expect(polyline[polyline.length - 1]).toEqual(STRAIGHT_END);
  });
});

describe("Test 7 — multiple balls reset independently", () => {
  it("each ball's working path seeds at its own position without touching positions or saved paths", () => {
    const ballA = curvedPhaseBall();
    const ballB: PhaseBallSnapshot = {
      id: "ball-2",
      x: 30,
      y: 20,
      attachedPlayerId: null,
      isFree: true,
      path: [
        { x: 10, y: 10 },
        { x: 30, y: 20 },
      ],
    };
    const saved = [ballA, ballB];
    const savedBefore = JSON.stringify(saved);

    // resetAllBallMovementPaths: one fresh path per ball, from that ball's own position.
    const working = new Map(saved.map((entry) => [entry.id, createBallWorkingPath(entry)] as const));
    expect(working.get(BALL_ID)).toEqual([CURVE_END]);
    expect(working.get("ball-2")).toEqual([{ x: 30, y: 20 }]);

    // A drag on ball A never changes ball B's working path.
    const movedA = dragBall(working.get(BALL_ID)!, STRAIGHT_SAMPLES);
    expect(touchesEarlierCurve(movedA)).toBe(false);
    expect(working.get("ball-2")).toEqual([{ x: 30, y: 20 }]);
    expect(JSON.stringify(saved)).toBe(savedBefore);
  });

  it("a fresh working path never aliases the snapshot it was seeded from", () => {
    const ballEntry = curvedPhaseBall();
    const pathBefore = JSON.stringify(ballEntry.path);
    const working = createBallWorkingPath(ballEntry);
    working.push({ x: 99, y: 99 });
    working[0]!.x = 0;
    expect(JSON.stringify(ballEntry.path)).toBe(pathBefore);
    expect(ballEntry.x).toBe(CURVE_END.x);
  });
});

describe("Test 8 — saved-board compatibility", () => {
  it("composeBallSnapshotPath records exactly what captureCurrentSnapshot recorded before", () => {
    const working = [
      { x: 10, y: 10 },
      { x: 120, y: -5 },
      { x: 40.25, y: 33.5 },
    ];
    const end = { x: 41, y: 34 };
    expect(composeBallSnapshotPath(working, true, end)).toEqual([
      { x: 10, y: 10 },
      { x: 100, y: 0 },
      { x: 40.25, y: 33.5 },
      { x: 41, y: 34 },
    ]);
    expect(composeBallSnapshotPath(working, false, end)).toBeUndefined();
    expect(composeBallSnapshotPath([], true, end)).toBeUndefined();
  });

  it("a board saved before the fix — leaked path included — plays back exactly as recorded", () => {
    const start = snapshot({ id: BALL_ID, ...CURVE_START, attachedPlayerId: null, isFree: true }, { x: 40, y: 80 });
    const phase1 = snapshot(curvedPhaseBall(), { x: 40, y: 80 });
    const phase2 = snapshot(nextMovement(phase1.football[0]!, { reset: false }), { x: 55, y: 80 });
    const saved = JSON.parse(JSON.stringify([start, phase1, phase2])) as PhaseSnapshot[];

    // Saved phase data is never rewritten: the stored path is walked as-is.
    const timeline = compileSlatePlaybackTimeline(saved);
    expect(timeline.segments[1]!.durationMs).toBeGreaterThan(2200);
    expect(timeline.path[2]!.football[0]!.path).toEqual(phase2.football[0]!.path);
  });

  it("boards without ball paths are unaffected (straight lerp, no path field required)", () => {
    const start = snapshot({ id: BALL_ID, x: 20, y: 50, attachedPlayerId: null, isFree: true }, { x: 40, y: 80 });
    const end = snapshot({ id: BALL_ID, x: 30, y: 50, attachedPlayerId: null, isFree: true }, { x: 40, y: 80 });
    const timeline = compileSlatePlaybackTimeline([start, end]);
    const midpoint = sampleSlatePlaybackTimeline(timeline, timeline.totalDurationMs / 2);
    expect(midpoint.balls[0]).toMatchObject({ kind: "free", x: 25, y: 50 });
  });
});

describe("Test 9 — uncommitted authoring is not lost", () => {
  it("the reset keeps the ball where it was restored, so the next movement continues from there", () => {
    const restored = curvedPhaseBall();
    expect(createBallWorkingPath(restored)).toEqual([{ x: restored.x, y: restored.y }]);
  });

  it("several drags within one phase still accumulate into one route (no reset between them)", () => {
    const working = createBallWorkingPath({ x: 20, y: 50 });
    const firstStroke = dragBall(working, Array.from({ length: 11 }, (_, i) => ({ x: 21 + i, y: 50 })));
    const secondStroke = dragBall(firstStroke, Array.from({ length: 11 }, (_, i) => ({ x: 31, y: 51 + i })));
    const captured = captureFreeBall(secondStroke, { x: 31, y: 61 });
    expect(captured.path![0]).toEqual({ x: 20, y: 50 });
    expect(captured.path!.some((point) => Math.abs(point.x - 31) < 0.5 && Math.abs(point.y - 50) < 0.5)).toBe(true);
    expect(captured.path![captured.path!.length - 1]).toEqual({ x: 31, y: 61 });
  });
});
