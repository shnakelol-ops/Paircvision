import { describe, expect, it } from "vitest";

import { createBasicRouteFollowSession } from "./basic-route-follow";

const SUBSTEP_MS = 1000 / 60;

function closeTo(a: number, b: number, tolerance = 1e-6): boolean {
  return Math.abs(a - b) <= tolerance;
}

function expectPointClose(
  actual: { x: number; y: number },
  expected: { x: number; y: number },
  tolerance = 1e-6,
): void {
  expect(closeTo(actual.x, expected.x, tolerance)).toBe(true);
  expect(closeTo(actual.y, expected.y, tolerance)).toBe(true);
}

describe("createBasicRouteFollowSession — real stepping (unchanged observable behaviour)", () => {
  it("is inactive for an empty route", () => {
    const target = { x: 10, y: 10 };
    const session = createBasicRouteFollowSession({
      target,
      route: [],
      speed: 20,
    });
    expect(session.isActive()).toBe(false);
  });

  it("completes immediately on the first step for a single-point route (nothing to travel)", () => {
    const target = { x: 10, y: 10 };
    let completed = false;
    const session = createBasicRouteFollowSession({
      target,
      route: [{ x: 10, y: 10 }],
      speed: 20,
      onComplete: () => {
        completed = true;
      },
    });
    expect(session.isActive()).toBe(true);
    session.step(SUBSTEP_MS);
    expect(session.isActive()).toBe(false);
    expect(completed).toBe(true);
  });

  it("is inactive when speed is 0", () => {
    const target = { x: 0, y: 0 };
    const session = createBasicRouteFollowSession({
      target,
      route: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      speed: 0,
    });
    expect(session.isActive()).toBe(false);
  });

  it("moves the target toward the route and fires onComplete exactly once at the end", () => {
    const target = { x: 0, y: 0 };
    let completeCount = 0;
    const session = createBasicRouteFollowSession({
      target,
      route: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      speed: 40,
      onComplete: () => {
        completeCount += 1;
      },
    });

    for (let i = 0; i < 600 && session.isActive(); i += 1) {
      session.step(SUBSTEP_MS);
    }

    expect(session.isActive()).toBe(false);
    expect(completeCount).toBe(1);
    expectPointClose(target, { x: 10, y: 0 }, 1e-3);

    // Further step() calls after completion are no-ops.
    const before = { ...target };
    session.step(SUBSTEP_MS);
    expect(target).toEqual(before);
    expect(completeCount).toBe(1);
  });

  it("cancel() stops the session and fires onCancel, not onComplete", () => {
    const target = { x: 0, y: 0 };
    let completed = false;
    let cancelled = false;
    const session = createBasicRouteFollowSession({
      target,
      route: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      speed: 10,
      onComplete: () => {
        completed = true;
      },
      onCancel: () => {
        cancelled = true;
      },
    });

    session.step(SUBSTEP_MS);
    session.cancel();
    expect(session.isActive()).toBe(false);
    expect(cancelled).toBe(true);
    expect(completed).toBe(false);

    // step() after cancel is a no-op.
    const before = { ...target };
    session.step(SUBSTEP_MS);
    expect(target).toEqual(before);
  });
});

describe("createBasicRouteFollowSession — predictPositionAfter (non-mutating prediction)", () => {
  it("returns the current position for a stationary session (no route movement)", () => {
    const target = { x: 25, y: 60 };
    const session = createBasicRouteFollowSession({
      target,
      route: [{ x: 25, y: 60 }],
      speed: 20,
    });
    expect(session.predictPositionAfter(900)).toEqual({ x: 25, y: 60 });
  });

  it("returns the current position when speed is 0 (never active)", () => {
    const target = { x: 5, y: 5 };
    const session = createBasicRouteFollowSession({
      target,
      route: [
        { x: 5, y: 5 },
        { x: 50, y: 5 },
      ],
      speed: 0,
    });
    expect(session.predictPositionAfter(900)).toEqual({ x: 5, y: 5 });
  });

  it("uses the identical movement math as real stepping — from the very start of a straight run", () => {
    const routeA = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    const routeB = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];

    const targetA = { x: 0, y: 0 };
    const sessionA = createBasicRouteFollowSession({ target: targetA, route: routeA, speed: 22 });

    const targetB = { x: 0, y: 0 };
    const sessionB = createBasicRouteFollowSession({ target: targetB, route: routeB, speed: 22 });

    const STEPS = 12; // well short of route completion
    for (let i = 0; i < STEPS; i += 1) {
      sessionA.step(SUBSTEP_MS);
    }
    const predicted = sessionB.predictPositionAfter(STEPS * SUBSTEP_MS);

    expectPointClose(predicted, targetA, 1e-6);
    // Prediction must not have moved sessionB's own real target/progress.
    expect(targetB).toEqual({ x: 0, y: 0 });
  });

  it("continuing from mid-route real progress matches predicting the remaining time from that same progress", () => {
    const target = { x: 0, y: 0 };
    const session = createBasicRouteFollowSession({
      target,
      route: [
        { x: 0, y: 0 },
        { x: 30, y: 0 },
        { x: 30, y: 40 },
      ],
      speed: 22,
    });

    const INITIAL_STEPS = 8;
    for (let i = 0; i < INITIAL_STEPS; i += 1) {
      session.step(SUBSTEP_MS);
    }
    const midProgressSnapshot = { ...target };

    const FURTHER_STEPS = 10;
    const predictedFromMid = session.predictPositionAfter(FURTHER_STEPS * SUBSTEP_MS);

    // Prediction must not have mutated real progress.
    expect(target).toEqual(midProgressSnapshot);

    for (let i = 0; i < FURTHER_STEPS; i += 1) {
      session.step(SUBSTEP_MS);
    }
    expectPointClose(predictedFromMid, target, 1e-6);
  });

  it("predicts the route's own endpoint (not a curved path) when arrival lies beyond route completion", () => {
    const target = { x: 0, y: 0 };
    const session = createBasicRouteFollowSession({
      target,
      route: [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 5, y: 5 },
      ],
      speed: 40,
    });

    const predicted = session.predictPositionAfter(10_000);
    expectPointClose(predicted, { x: 5, y: 5 }, 1e-3);

    // Real session is untouched — still active, still at the start.
    expect(session.isActive()).toBe(true);
    expect(target).toEqual({ x: 0, y: 0 });
  });

  it("repeated prediction never changes the outcome of subsequent real stepping", () => {
    const routeA = [
      { x: 0, y: 0 },
      { x: 60, y: 0 },
    ];
    const targetA = { x: 0, y: 0 };
    const sessionA = createBasicRouteFollowSession({ target: targetA, route: routeA, speed: 22 });

    const targetB = { x: 0, y: 0 };
    const sessionB = createBasicRouteFollowSession({
      target: targetB,
      route: [
        { x: 0, y: 0 },
        { x: 60, y: 0 },
      ],
      speed: 22,
    });

    // Session B has prediction called repeatedly with varying horizons before
    // any real stepping happens — none of this may leak into real progress.
    sessionB.predictPositionAfter(100);
    sessionB.predictPositionAfter(5000);
    sessionB.predictPositionAfter(1);

    for (let i = 0; i < 30; i += 1) {
      sessionA.step(SUBSTEP_MS);
      sessionB.step(SUBSTEP_MS);
      expectPointClose(targetB, targetA, 1e-6);
    }
  });

  it("accounts for a direction change mid-flight by returning the eventual endpoint directly", () => {
    // A route that changes direction partway through — the receiver's real
    // route-follow will trace the bend, but a fixed-reception prediction
    // must still land on the far endpoint (the ball itself flies straight).
    const target = { x: 0, y: 0 };
    const session = createBasicRouteFollowSession({
      target,
      route: [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 20 },
      ],
      speed: 22,
    });

    const predicted = session.predictPositionAfter(5000);
    expectPointClose(predicted, { x: 20, y: 20 }, 1e-3);
  });
});
