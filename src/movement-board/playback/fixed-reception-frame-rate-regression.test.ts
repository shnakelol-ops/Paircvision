import { describe, expect, it } from "vitest";

import { createPlaybackOrchestrator, type PlaybackOrchestratorCallbacks } from "./playback-orchestrator";
import { normalizedToWorld } from "../coordinates/coordinates";
import { sampleRoutePoints } from "../routes/route-sampling";
import { computeBallAttachmentPoint } from "../ball/carried-ball-position";
import { computePassPositionProgress } from "../ball/pass-trajectory";
import type { NormalizedPoint } from "../coordinates/normalization";

// Regression test recreating the real-device "Frisbee/boomerang" failure
// scenario exactly: moving receiver, direction change mid-route, 850ms
// flight — run through the REAL orchestrator + fixed-timestep route-follow
// core at a spread of frame rates (including the exact conditions that
// previously reproduced the defect: sustained low fps and jank frames).
//
// --- Declared tolerance (fixed before this test is run, not after) --------
//
// basic-route-follow.ts's own route math is now cadence-independent to
// ~1e-6 normalized units (see frame-rate-invariance.test.ts). The one
// residual source of predicted-vs-actual divergence left in THIS scenario
// is orthogonal to that fix: createMovementCanvasShell.ts's tick() only
// checks "has the ball's elapsedMs reached durationMs" once per render
// frame, AFTER that frame's full delta has already been applied — so by
// the time landing is detected, the receiver may have consumed up to one
// whole render frame's worth of EXTRA game time beyond the exact
// durationMs the prediction assumed. That overshoot is bounded by
// (receiver's maximum possible speed) x (that frame's own duration), and
// is a property of the orchestrator's once-per-frame landing check, not of
// route-follow's math — fixing it would mean changing tick()'s landing
// detection, which is out of scope for this change (an explicit stop
// condition: no orchestrator rewrite). It is measured and reported here,
// not silently absorbed by a padded tolerance.
const BASIC_ROUTE_FOLLOW_SPEED = 22; // matches playback-orchestrator.ts's own constant; max normalized units/sec
const TOLERANCE_HEADROOM = 1.2; // 20% margin over the analytically-derived bound, fixed in advance

function toleranceForMaxFrameMs(maxFrameMs: number): number {
  return BASIC_ROUTE_FOLLOW_SPEED * (maxFrameMs / 1000) * TOLERANCE_HEADROOM;
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

const WORLD_SIZE = { width: 160, height: 100 };
const PASS_MIN_DURATION_MS = 850;
const PASS_MAX_DURATION_MS = 1800;
const PASS_SPEED_PX_PER_MS = 0.067;
const PASS_ARC_HEIGHT_PX = 0; // authorised change under test: no XY arc on normal passes
const BALL_LANDING_EPSILON_MS = 1e-6; // mirrors createMovementCanvasShell.ts's tick()

type Cadence = { label: string; maxFrameMs: number; frames: (totalMs: number) => number[] };

function fixedFrames(dtMs: number, totalMs: number): number[] {
  const frames: number[] = [];
  let elapsed = 0;
  while (elapsed < totalMs) {
    frames.push(dtMs);
    elapsed += dtMs;
  }
  return frames;
}

function irregularFrames(totalMs: number, withJank: boolean): number[] {
  const frames: number[] = [];
  let elapsed = 0;
  let i = 0;
  while (elapsed < totalMs) {
    i += 1;
    let dt = 1000 / 60 + Math.sin(i * 12.9898) * 4.5;
    if (withJank && i % 11 === 0) dt = 180;
    dt = Math.max(4, dt);
    frames.push(dt);
    elapsed += dt;
  }
  return frames;
}

const CADENCES: Cadence[] = [
  { label: "60fps", maxFrameMs: 1000 / 60, frames: (t) => fixedFrames(1000 / 60, t) },
  { label: "30fps", maxFrameMs: 1000 / 30, frames: (t) => fixedFrames(1000 / 30, t) },
  { label: "15fps", maxFrameMs: 1000 / 15, frames: (t) => fixedFrames(1000 / 15, t) },
  { label: "10fps", maxFrameMs: 1000 / 10, frames: (t) => fixedFrames(1000 / 10, t) },
  { label: "5fps", maxFrameMs: 1000 / 5, frames: (t) => fixedFrames(1000 / 5, t) },
  { label: "irregular", maxFrameMs: 21, frames: (t) => irregularFrames(t, false) },
  { label: "irregular+jank", maxFrameMs: 180, frames: (t) => irregularFrames(t, true) },
];

function makeOrchestrator(receiverStart: NormalizedPoint, receiverRoute: NormalizedPoint[]) {
  let receiverPos: NormalizedPoint = { ...receiverStart };
  const callbacks: PlaybackOrchestratorCallbacks = {
    onPlaybackReset: (_id, start) => {
      receiverPos = { ...start };
    },
    onTokenStep: (_id, position) => {
      receiverPos = { ...position };
    },
    onStateChange: () => {},
    getTokens: () => [{ id: "RECEIVER", position: receiverPos }],
    getRoute: () => receiverRoute,
    getRouteMeta: () => null,
    getStartPosition: () => receiverStart,
    getPassEvents: () => [],
    onPassStart: () => {},
    getShotEvents: () => [],
    onShotStart: () => {},
  };
  const orchestrator = createPlaybackOrchestrator("normal", callbacks);
  return { orchestrator, getReceiverPos: () => receiverPos };
}

describe("fixed-reception regression — moving receiver, direction change, 850ms flight, across frame rates", () => {
  const receiverStart: NormalizedPoint = { x: 10, y: 50 };
  const receiverRoute = sampleRoutePoints([
    { x: 10, y: 50 },
    { x: 45, y: 48 },
    { x: 48, y: 15 },
    { x: 90, y: 12 },
  ]);
  const passerWorld = normalizedToWorld({ x: 2, y: 55 }, WORLD_SIZE);

  for (const cadence of CADENCES) {
    it(`${cadence.label}: predicted ≈ actual at landing, ball before ≈ after transfer`, () => {
      const tolerance = toleranceForMaxFrameMs(cadence.maxFrameMs);
      const { orchestrator, getReceiverPos } = makeOrchestrator(receiverStart, receiverRoute);
      orchestrator.start();

      // Release just before the sharp turn — the exact condition that
      // previously exposed the defect.
      for (const dt of cadence.frames(900)) orchestrator.step(dt);

      const releaseReceiverWorld = normalizedToWorld(getReceiverPos(), WORLD_SIZE);
      const dist0 = Math.hypot(releaseReceiverWorld.x - passerWorld.x, releaseReceiverWorld.y - passerWorld.y);
      const durationMs = Math.max(PASS_MIN_DURATION_MS, Math.min(PASS_MAX_DURATION_MS, dist0 / PASS_SPEED_PX_PER_MS));

      const predictedNormalized = orchestrator.predictTokenPositionAfter("RECEIVER", durationMs);
      const predictedWorld = normalizedToWorld(predictedNormalized, WORLD_SIZE);
      const passTargetWorld = computeBallAttachmentPoint(predictedWorld, WORLD_SIZE);
      const fromWorld = computeBallAttachmentPoint(passerWorld, WORLD_SIZE);

      let elapsedMs = 0;
      for (const dt of cadence.frames(durationMs * 2)) {
        orchestrator.step(dt);
        elapsedMs += dt;
        if (elapsedMs >= durationMs - BALL_LANDING_EPSILON_MS) break; // mirrors tick()'s landing check exactly
      }

      const actualReceiverWorld = normalizedToWorld(getReceiverPos(), WORLD_SIZE);
      const actualAttachment = computeBallAttachmentPoint(actualReceiverWorld, WORLD_SIZE);

      const eased = computePassPositionProgress(1);
      const arcY = -Math.sin(Math.PI) * PASS_ARC_HEIGHT_PX;
      const ballBeforeTransfer = {
        x: fromWorld.x + (passTargetWorld.x - fromWorld.x) * eased,
        y: fromWorld.y + (passTargetWorld.y - fromWorld.y) * eased + arcY,
      };
      const ballAfterTransfer = actualAttachment;

      const predictionError = dist(predictedWorld, actualReceiverWorld);
      const landingDiscontinuity = dist(ballBeforeTransfer, ballAfterTransfer);

      expect(
        predictionError,
        `${cadence.label}: predictionError=${predictionError.toFixed(4)} exceeds declared tolerance=${tolerance.toFixed(4)}`,
      ).toBeLessThanOrEqual(tolerance);
      expect(
        landingDiscontinuity,
        `${cadence.label}: landingDiscontinuity=${landingDiscontinuity.toFixed(4)} exceeds declared tolerance=${tolerance.toFixed(4)}`,
      ).toBeLessThanOrEqual(tolerance);
    });
  }
});
