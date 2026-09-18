import { describe, expect, it } from "vitest";

import { createBasicRouteFollowSession } from "./basic-route-follow";
import { sampleRoutePoints } from "../routes/route-sampling";
import type { NormalizedPoint } from "../coordinates/normalization";

const BASIC_ROUTE_FOLLOW_SPEED = 22;

// --- Declared tolerance (fixed before any test below is run) ---------------
//
// After the fixed-timestep accumulator fix, real position after exactly N ms
// of accumulated game time is a deterministic function of
// floor(N / FIXED_STEP_MS) whole fixed steps, regardless of how N was
// divided into step() calls. Comparing two cadences that have each
// accumulated the SAME total N (by clipping the final frame of each
// sequence so the sums are exactly equal) should therefore differ only by
// IEEE-754 floating-point summation-order noise — additions of values in
// the tens-to-thousands range, tens of terms, which is on the order of
// 1e-10 to 1e-12 in absolute terms. TOLERANCE below gives that noise floor
// four to six orders of magnitude of headroom, chosen for this reason
// before any scenario was run.
const TOLERANCE = 1e-6;

function buildClippedFrames(dtMs: number, totalMs: number): number[] {
  const frames: number[] = [];
  let elapsed = 0;
  while (elapsed + dtMs < totalMs - 1e-9) {
    frames.push(dtMs);
    elapsed += dtMs;
  }
  const remainder = totalMs - elapsed;
  if (remainder > 1e-9) frames.push(remainder);
  return frames;
}

function buildIrregularFrames(totalMs: number, withJank: boolean): number[] {
  const frames: number[] = [];
  let elapsed = 0;
  let i = 0;
  while (elapsed < totalMs - 1e-9) {
    i += 1;
    let dt = 1000 / 60 + Math.sin(i * 12.9898) * 4.5; // deterministic pseudo-jitter around 60fps
    if (withJank && i % 11 === 0) dt = 180; // a substantial jank frame
    dt = Math.max(4, dt);
    if (elapsed + dt > totalMs) dt = totalMs - elapsed;
    frames.push(dt);
    elapsed += dt;
  }
  return frames;
}

type Cadence = { label: string; frames: (totalMs: number) => number[] };

const CADENCES: Cadence[] = [
  { label: "60fps", frames: (t) => buildClippedFrames(1000 / 60, t) },
  { label: "30fps", frames: (t) => buildClippedFrames(1000 / 30, t) },
  { label: "15fps", frames: (t) => buildClippedFrames(1000 / 15, t) },
  { label: "10fps", frames: (t) => buildClippedFrames(1000 / 10, t) },
  { label: "5fps", frames: (t) => buildClippedFrames(1000 / 5, t) },
  { label: "irregular", frames: (t) => buildIrregularFrames(t, false) },
  { label: "irregular+jank", frames: (t) => buildIrregularFrames(t, true) },
];

function runToGameTime(route: NormalizedPoint[], start: NormalizedPoint, frames: number[]): NormalizedPoint {
  const target = { x: start.x, y: start.y };
  const session = createBasicRouteFollowSession({ target, route, speed: BASIC_ROUTE_FOLLOW_SPEED });
  for (const dt of frames) session.step(dt);
  return { x: target.x, y: target.y };
}

function assertCadenceAgreement(route: NormalizedPoint[], start: NormalizedPoint, checkpointMs: number) {
  const results = CADENCES.map((c) => ({
    label: c.label,
    pos: runToGameTime(route, start, c.frames(checkpointMs)),
  }));
  const reference = results[0]!;
  for (const result of results.slice(1)) {
    const errX = Math.abs(result.pos.x - reference.pos.x);
    const errY = Math.abs(result.pos.y - reference.pos.y);
    expect(
      errX,
      `${result.label} vs ${reference.label} at checkpoint ${checkpointMs}ms: x diverged by ${errX}`,
    ).toBeLessThanOrEqual(TOLERANCE);
    expect(
      errY,
      `${result.label} vs ${reference.label} at checkpoint ${checkpointMs}ms: y diverged by ${errY}`,
    ).toBeLessThanOrEqual(TOLERANCE);
  }
}

describe("frame-rate invariance — position after N ms of game time is cadence-independent", () => {
  it("straight run", () => {
    const route = sampleRoutePoints([
      { x: 10, y: 50 },
      { x: 90, y: 50 },
    ]);
    assertCadenceAgreement(route, route[0]!, 900);
    assertCadenceAgreement(route, route[0]!, 1800);
  });

  it("curved route, multiple waypoints, direction change", () => {
    const route = sampleRoutePoints([
      { x: 10, y: 50 },
      { x: 40, y: 20 },
      { x: 70, y: 75 },
      { x: 95, y: 45 },
    ]);
    assertCadenceAgreement(route, route[0]!, 700);
    assertCadenceAgreement(route, route[0]!, 1600);
  });

  it("sharp direction change", () => {
    const route = sampleRoutePoints([
      { x: 10, y: 50 },
      { x: 45, y: 48 },
      { x: 48, y: 15 },
      { x: 90, y: 12 },
    ]);
    assertCadenceAgreement(route, route[0]!, 850);
  });

  it("near route completion", () => {
    const route = sampleRoutePoints([
      { x: 10, y: 50 },
      { x: 40, y: 20 },
      { x: 70, y: 75 },
      { x: 95, y: 45 },
    ]);
    // Long enough that every cadence should have finished (or nearly finished)
    // the route — exercises the completion/index-exhaustion boundary under
    // every cadence identically.
    assertCadenceAgreement(route, route[0]!, 5000);
  });

  it("delayed start (movement doesn't begin until after N ms — checkpoint set after start)", () => {
    // A "delayed start" in production is modeled at the orchestrator level
    // (remaining delay before session.step() is ever called at all); at the
    // session level the equivalent is simply: no game time has been
    // consumed yet, so every cadence starts from an identical zero state.
    // What must agree is position after the SAME total elapsed time once
    // movement is actually happening, which this exercises directly.
    const route = sampleRoutePoints([
      { x: 20, y: 30 },
      { x: 60, y: 65 },
      { x: 85, y: 40 },
    ]);
    assertCadenceAgreement(route, route[0]!, 400);
    assertCadenceAgreement(route, route[0]!, 1100);
  });
});

describe("frame-rate invariance — predictPositionAfter agrees with real stepping to the same total game time", () => {
  it("prediction from route start matches real stepping at every cadence", () => {
    const route = sampleRoutePoints([
      { x: 10, y: 50 },
      { x: 40, y: 20 },
      { x: 70, y: 75 },
      { x: 95, y: 45 },
    ]);
    const horizonMs = 900;

    // Reference: predictPositionAfter from a freshly-built session (no
    // accumulator history) — this must equal real stepping to the same
    // total game time under EVERY cadence, not just a matching one.
    const predictTarget = { x: route[0]!.x, y: route[0]!.y };
    const predictSession = createBasicRouteFollowSession({ target: predictTarget, route, speed: BASIC_ROUTE_FOLLOW_SPEED });
    const predicted = predictSession.predictPositionAfter(horizonMs);

    for (const cadence of CADENCES) {
      const actual = runToGameTime(route, route[0]!, cadence.frames(horizonMs));
      const err = Math.hypot(predicted.x - actual.x, predicted.y - actual.y);
      expect(err, `${cadence.label}: prediction vs real-stepped diverged by ${err}`).toBeLessThanOrEqual(TOLERANCE);
    }
  });

  it("prediction taken mid-run (with a pending accumulator) still matches subsequent real stepping at every cadence", () => {
    const route = sampleRoutePoints([
      { x: 10, y: 50 },
      { x: 45, y: 48 },
      { x: 48, y: 15 },
      { x: 90, y: 12 },
    ]);
    const preRunMs = 400;
    const horizonMs = 850;

    for (const cadence of CADENCES) {
      const target = { x: route[0]!.x, y: route[0]!.y };
      const session = createBasicRouteFollowSession({ target, route, speed: BASIC_ROUTE_FOLLOW_SPEED });
      // Advance into a genuine mid-run state (with whatever accumulator
      // leftover this cadence's frame sizes happen to produce), matching
      // this same cadence's own frame sizes.
      for (const dt of cadence.frames(preRunMs)) session.step(dt);
      const predicted = session.predictPositionAfter(horizonMs);
      for (const dt of cadence.frames(horizonMs)) session.step(dt);
      const actual = { x: target.x, y: target.y };
      const err = Math.hypot(predicted.x - actual.x, predicted.y - actual.y);
      expect(err, `${cadence.label}: mid-run prediction vs continued real stepping diverged by ${err}`).toBeLessThanOrEqual(
        TOLERANCE,
      );
    }
  });
});
