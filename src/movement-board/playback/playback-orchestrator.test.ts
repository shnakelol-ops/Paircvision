import { describe, it, expect, vi } from "vitest";
import { createPlaybackOrchestrator, type PlaybackOrchestratorCallbacks } from "./playback-orchestrator";

// Minimal callback stub — override only what a given test cares about. Most
// cases below deliberately use zero tokens/routes: the bug under test is
// that pause/resume only looked at player-token runs, so a scenario with
// *only* pass/shot/trigger work is the cleanest possible reproduction.
function makeCallbacks(overrides: Partial<PlaybackOrchestratorCallbacks> = {}): PlaybackOrchestratorCallbacks {
  return {
    onPlaybackReset: vi.fn(),
    onTokenStep: vi.fn(),
    onStateChange: vi.fn(),
    getTokens: () => [],
    getRoute: () => null,
    getRouteMeta: () => null,
    getStartPosition: () => null,
    getPassEvents: () => [],
    onPassStart: vi.fn(),
    getShotEvents: () => [],
    onShotStart: vi.fn(),
    ...overrides,
  };
}

describe("createPlaybackOrchestrator — resume with non-token work pending", () => {
  it("resumes when the only remaining work is a pending shot (no active player run)", () => {
    const callbacks = makeCallbacks({
      getShotEvents: () => [{ id: "s1", shooterId: "p1", delayMs: 500 }],
    });
    const orchestrator = createPlaybackOrchestrator("normal", callbacks);

    orchestrator.start();
    expect(orchestrator.getState().isPlaying).toBe(true);
    expect(orchestrator.hasActiveRuns()).toBe(true); // pendingShotRuns has the shot

    orchestrator.pause();
    expect(orchestrator.getState().isPaused).toBe(true);
    expect(orchestrator.getState().isPlaying).toBe(false);

    orchestrator.resume();
    // Before the fix, resume() only checked activePlaybackRuns.size > 0 — 0
    // here, since there are no player tokens at all — so resume() silently
    // no-op'd and the walkthrough stayed paused forever.
    expect(orchestrator.getState().isPlaying).toBe(true);
    expect(orchestrator.getState().isPaused).toBe(false);
  });

  it("resumes when the only remaining work is a triggered (pending) pass", () => {
    const callbacks = makeCallbacks({
      getPassEvents: () => [{ id: "p1", fromPlayerId: "a", toPlayerId: "b", triggeredBy: "never-fires" }],
    });
    const orchestrator = createPlaybackOrchestrator("normal", callbacks);

    orchestrator.start();
    expect(orchestrator.hasActiveRuns()).toBe(true); // pendingPassRuns has the pass

    orchestrator.pause();
    orchestrator.resume();
    expect(orchestrator.getState().isPlaying).toBe(true);
  });

  it("resumes when the only remaining work is a delayed (active) pass", () => {
    const callbacks = makeCallbacks({
      getPassEvents: () => [{ id: "p1", fromPlayerId: "a", toPlayerId: "b", delayMs: 400 }],
    });
    const orchestrator = createPlaybackOrchestrator("normal", callbacks);

    orchestrator.start();
    orchestrator.pause();
    orchestrator.resume();
    expect(orchestrator.getState().isPlaying).toBe(true);
  });

  it("start() while paused resumes in place instead of silently doing nothing", () => {
    const callbacks = makeCallbacks({
      getShotEvents: () => [{ id: "s1", shooterId: "p1", delayMs: 500 }],
    });
    const orchestrator = createPlaybackOrchestrator("normal", callbacks);

    orchestrator.start();
    orchestrator.pause();
    orchestrator.start(); // the shell's startPlayback() calls start(), not resume(), when re-pressing Play
    expect(orchestrator.getState().isPlaying).toBe(true);
  });

  it("resume() is still a correct no-op once there is genuinely no work left", () => {
    const callbacks = makeCallbacks();
    const orchestrator = createPlaybackOrchestrator("normal", callbacks);

    orchestrator.resume(); // never started
    expect(orchestrator.getState().isPlaying).toBe(false);
    expect(orchestrator.getState().isPaused).toBe(false);
  });

  it("supports repeated pause/resume cycles without losing pending work", () => {
    const callbacks = makeCallbacks({
      getShotEvents: () => [{ id: "s1", shooterId: "p1", delayMs: 500 }],
    });
    const orchestrator = createPlaybackOrchestrator("normal", callbacks);

    orchestrator.start();
    for (let i = 0; i < 5; i += 1) {
      orchestrator.pause();
      expect(orchestrator.getState().isPaused).toBe(true);
      orchestrator.resume();
      expect(orchestrator.getState().isPlaying).toBe(true);
    }
    expect(orchestrator.hasActiveRuns()).toBe(true);
  });

  it("pause -> reset always recovers, regardless of what kind of work was pending", () => {
    const callbacks = makeCallbacks({
      getShotEvents: () => [{ id: "s1", shooterId: "p1", delayMs: 500 }],
    });
    const orchestrator = createPlaybackOrchestrator("normal", callbacks);

    orchestrator.start();
    orchestrator.pause();
    orchestrator.stop(); // shell.reset() always calls stop(), never resume()
    expect(orchestrator.getState().isPlaying).toBe(false);
    expect(orchestrator.getState().isPaused).toBe(false);
    expect(orchestrator.hasActiveRuns()).toBe(false);
  });

  it("pause -> change speed -> resume keeps working", () => {
    const callbacks = makeCallbacks({
      getShotEvents: () => [{ id: "s1", shooterId: "p1", delayMs: 500 }],
    });
    const orchestrator = createPlaybackOrchestrator("normal", callbacks);

    orchestrator.start();
    orchestrator.pause();
    orchestrator.setSpeedMultiplier(1.5);
    orchestrator.resume();
    expect(orchestrator.getState().isPlaying).toBe(true);
    expect(orchestrator.getSpeedMultiplier()).toBe(1.5);
  });
});

describe("createPlaybackOrchestrator — solo delayed pass stays playing through the ball flight", () => {
  // Regression: a lone delayed pass (nothing else queued) used to auto-stop
  // playback the instant its delay timer fired, because hasWork() had no
  // visibility into the ball-flight animation the shell starts in response
  // to onPassStart. isPlaying going false mid-flight then permanently froze
  // the flight (the shell's tick() gates flight progress on isPlaying), so
  // the receiver never got the ball. hasActiveBallAnimation() closes that gap.
  it("does not auto-stop the instant a solo delayed pass fires — the flight callback is still 'work'", () => {
    let ballInFlight = false;
    const callbacks = makeCallbacks({
      getPassEvents: () => [{ id: "p1", fromPlayerId: "a", toPlayerId: "b", delayMs: 1000 }],
      onPassStart: vi.fn(() => {
        ballInFlight = true;
      }),
      hasActiveBallAnimation: () => ballInFlight,
    });
    const orchestrator = createPlaybackOrchestrator("normal", callbacks);

    orchestrator.start();
    expect(orchestrator.getState().isPlaying).toBe(true);

    // Advance past the 1000ms delay so the pass fires.
    orchestrator.step(1000);
    expect(callbacks.onPassStart).toHaveBeenCalledWith("a", "b");

    // Before the fix: activePassRuns is now empty and hasWork() had no other
    // signal, so step()'s own "no work left" check stopped playback in this
    // exact call — freezing the flight at elapsed=0 forever, since nothing
    // would ever set isPlaying back to true (restart is blocked while a
    // flight is conceptually in progress, and there is no other trigger).
    expect(orchestrator.getState().isPlaying).toBe(true);
    expect(orchestrator.hasActiveRuns()).toBe(true);

    // Flight lands — shell clears its own in-flight flag and the caller
    // reports it via notifyPassLanded's normal landing path.
    ballInFlight = false;
    orchestrator.step(16);

    // Now that the flight is done and nothing else is queued, playback
    // correctly auto-stops (unrelated existing behavior, unchanged).
    expect(orchestrator.getState().isPlaying).toBe(false);
    expect(orchestrator.hasActiveRuns()).toBe(false);
  });

  it("keeps playback locked (cannot restart) while a solo pass's ball animation is still reported in flight", () => {
    let ballInFlight = false;
    const callbacks = makeCallbacks({
      getPassEvents: () => [{ id: "p1", fromPlayerId: "a", toPlayerId: "b", delayMs: 200 }],
      onPassStart: vi.fn(() => {
        ballInFlight = true;
      }),
      hasActiveBallAnimation: () => ballInFlight,
    });
    const orchestrator = createPlaybackOrchestrator("normal", callbacks);

    orchestrator.start();
    orchestrator.step(200);
    expect(callbacks.onPassStart).toHaveBeenCalled();

    // isLocked() (isPlaying || isPaused) must stay true mid-flight — this is
    // what the shell's startPlayback() checks before deciding whether a Play
    // press is a fresh restart or a no-op resume.
    expect(orchestrator.isLocked()).toBe(true);
  });
});

describe("createPlaybackOrchestrator — predictTokenPositionAfter (fixed reception point support)", () => {
  const ROUTE = [
    { x: 0, y: 0 },
    { x: 80, y: 0 },
  ];

  it("returns the current position for a token with no route at all (stationary)", () => {
    const callbacks = makeCallbacks({
      getTokens: () => [{ id: "p1", position: { x: 33, y: 44 } }],
      getRoute: () => null,
      getStartPosition: () => null,
    });
    const orchestrator = createPlaybackOrchestrator("normal", callbacks);
    orchestrator.start();

    expect(orchestrator.predictTokenPositionAfter("p1", 900)).toEqual({ x: 33, y: 44 });
  });

  it("falls back to current position when the token id has no run and isn't in getTokens either", () => {
    const callbacks = makeCallbacks();
    const orchestrator = createPlaybackOrchestrator("normal", callbacks);
    orchestrator.start();

    expect(orchestrator.predictTokenPositionAfter("ghost", 900)).toEqual({ x: 50, y: 50 });
  });

  it("accounts for remaining delay before movement begins: gameTimeMs at or under the delay returns the start position unmoved", () => {
    const callbacks = makeCallbacks({
      getTokens: () => [{ id: "p1", position: { x: 0, y: 0 } }],
      getRoute: () => ROUTE,
      getStartPosition: () => ({ x: 0, y: 0 }),
      getRouteMeta: () => ({ delayMs: 300 }),
    });
    const orchestrator = createPlaybackOrchestrator("normal", callbacks);
    orchestrator.start();

    expect(orchestrator.predictTokenPositionAfter("p1", 100)).toEqual({ x: 0, y: 0 });
    expect(orchestrator.predictTokenPositionAfter("p1", 300)).toEqual({ x: 0, y: 0 });
  });

  it("worked example: pass duration 900ms with 300ms remaining delay predicts exactly 600ms of movement", () => {
    const callbacks = makeCallbacks({
      getTokens: () => [
        { id: "delayed", position: { x: 0, y: 0 } },
        { id: "immediate", position: { x: 0, y: 0 } },
      ],
      getRoute: () => ROUTE,
      getStartPosition: () => ({ x: 0, y: 0 }),
      getRouteMeta: (tokenId) => ({ delayMs: tokenId === "delayed" ? 300 : 0 }),
    });
    const orchestrator = createPlaybackOrchestrator("normal", callbacks);
    orchestrator.start();

    // "delayed" waits 300ms then moves for 600ms; "immediate" (0 delay) moves
    // for 600ms starting from the same identical route/start — the two must
    // predict to the exact same point, proving the delay is subtracted
    // before delegating to the shared route-follow prediction math.
    const delayedPrediction = orchestrator.predictTokenPositionAfter("delayed", 900);
    const immediatePrediction = orchestrator.predictTokenPositionAfter("immediate", 600);
    expect(delayedPrediction).toEqual(immediatePrediction);
    // And it must actually have moved off the start position.
    expect(delayedPrediction).not.toEqual({ x: 0, y: 0 });
  });

  it("does not mutate real progress, delay, or route state when predicting", () => {
    const onTokenStep = vi.fn();
    const callbacks = makeCallbacks({
      getTokens: () => [{ id: "p1", position: { x: 0, y: 0 } }],
      getRoute: () => ROUTE,
      getStartPosition: () => ({ x: 0, y: 0 }),
      getRouteMeta: () => ({ delayMs: 0 }),
      onTokenStep,
    });
    const orchestrator = createPlaybackOrchestrator("normal", callbacks);
    orchestrator.start();

    orchestrator.predictTokenPositionAfter("p1", 5000);
    orchestrator.predictTokenPositionAfter("p1", 1);
    orchestrator.predictTokenPositionAfter("p1", 12345);

    // No prediction call should have advanced real playback — onTokenStep is
    // only ever invoked from the real step() loop.
    expect(onTokenStep).not.toHaveBeenCalled();
    expect(orchestrator.predictTokenPositionAfter("p1", 0)).toEqual({ x: 0, y: 0 });
  });

  it("uses a one-time fixed fallback (current position at release) for a token pending on another's triggered run, not chained prediction", () => {
    const callbacks = makeCallbacks({
      getTokens: () => [
        { id: "trigger", position: { x: 0, y: 0 } },
        { id: "chained", position: { x: 70, y: 20 } },
      ],
      getRoute: (tokenId) => (tokenId === "trigger" ? ROUTE : [{ x: 70, y: 20 }, { x: 90, y: 20 }]),
      getStartPosition: (tokenId) => (tokenId === "trigger" ? { x: 0, y: 0 } : { x: 70, y: 20 }),
      getRouteMeta: (tokenId) => (tokenId === "chained" ? { triggeredBy: "trigger" } : null),
    });
    const orchestrator = createPlaybackOrchestrator("normal", callbacks);
    orchestrator.start();

    // "chained" never actually starts moving in this test (its trigger never
    // completes) — prediction must return its release-time position, fixed,
    // rather than attempting to resolve the chain.
    expect(orchestrator.predictTokenPositionAfter("chained", 2000)).toEqual({ x: 70, y: 20 });
  });
});

describe("createPlaybackOrchestrator — deferred pass/shot queue counts as work", () => {
  // Regression (Phase A): the shell's hasActiveBallAnimation callback used to
  // report only `activeBallPass !== null`, so a pass or shot that got queued
  // into the shell's own deferredPasses/deferredShots arrays (because the
  // sender/shooter wasn't the ball carrier yet — e.g. two zero-delay chained
  // events firing in the same tick) was invisible to hasWork(). The instant
  // activePassRuns/activeShotRuns emptied out, step() saw "no work left" and
  // called stop() — silently stranding the deferred event and prematurely
  // ending playback even though the walkthrough wasn't actually finished.
  it("does not auto-stop while a pass is deferred (queued, not yet animating)", () => {
    let deferred = false;
    const callbacks = makeCallbacks({
      getPassEvents: () => [{ id: "p1", fromPlayerId: "a", toPlayerId: "b", delayMs: 0 }],
      onPassStart: vi.fn(() => {
        // Simulate the shell finding the sender isn't the carrier yet: the
        // pass is pushed onto deferredPasses instead of animating.
        deferred = true;
      }),
      hasActiveBallAnimation: () => deferred,
    });
    const orchestrator = createPlaybackOrchestrator("normal", callbacks);

    orchestrator.start();
    orchestrator.step(0); // zero-delay pass fires immediately, gets deferred
    expect(callbacks.onPassStart).toHaveBeenCalledWith("a", "b");

    // Before the fix: activePassRuns is now empty and nothing else signals
    // work, so this step() call would have stopped playback here, stranding
    // the deferred pass forever (nothing left running to ever flush it).
    expect(orchestrator.getState().isPlaying).toBe(true);
    expect(orchestrator.hasActiveRuns()).toBe(true);

    // The shell later flushes the deferred pass once its sender actually
    // becomes the carrier, clearing the flag.
    deferred = false;
    orchestrator.step(16);
    expect(orchestrator.getState().isPlaying).toBe(false);
  });

  it("does not auto-stop while a shot is deferred (carrier-timing race)", () => {
    let deferred = false;
    const callbacks = makeCallbacks({
      getShotEvents: () => [{ id: "s1", shooterId: "p1", delayMs: 0 }],
      onShotStart: vi.fn(() => {
        // Simulate the shell finding the shooter isn't the carrier yet: the
        // shot is pushed onto deferredShots instead of firing.
        deferred = true;
      }),
      hasActiveBallAnimation: () => deferred,
    });
    const orchestrator = createPlaybackOrchestrator("normal", callbacks);

    orchestrator.start();
    // A shot only promotes via notifyPassLanded; simulate the shooter
    // receiving the ball with a zero-delay shot pending.
    orchestrator.notifyPassLanded("p1");
    expect(callbacks.onShotStart).toHaveBeenCalledWith("p1");

    // Before the fix: nothing else is queued, so the next step() would stop
    // playback here and the deferred shot would never get a second chance.
    expect(orchestrator.getState().isPlaying).toBe(true);
    orchestrator.step(16);
    expect(orchestrator.getState().isPlaying).toBe(true);
    expect(orchestrator.hasActiveRuns()).toBe(true);

    // Carrier-timing race resolves; the shell fires the shot for real.
    deferred = false;
    orchestrator.step(16);
    expect(orchestrator.getState().isPlaying).toBe(false);
  });
});
