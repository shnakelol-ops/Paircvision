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
