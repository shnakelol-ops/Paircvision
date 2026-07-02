import { describe, it, expect } from "vitest";
import { flushDeferredPasses, type DeferredPass } from "./flushDeferredPasses";

// Shorthand builder so test arrays stay readable.
const p = (from: string, to: string): DeferredPass => ({ fromPlayerId: from, toPlayerId: to });

describe("flushDeferredPasses", () => {
  it("returns null toFire when queue is empty", () => {
    const { toFire, remaining } = flushDeferredPasses([], "P1");
    expect(toFire).toBeNull();
    expect(remaining).toEqual([]);
  });

  it("returns null toFire when no entry matches the receiver", () => {
    const queue = [p("P2", "P3"), p("P3", "P2")];
    const { toFire, remaining } = flushDeferredPasses(queue, "P1");
    expect(toFire).toBeNull();
    expect(remaining).toEqual(queue);
  });

  // ── Core fix: multiple deferred passes from the same player ────────────────

  it("fires first eligible pass and re-enqueues the rest (P1→P3 and P1→P4 both deferred)", () => {
    // P1→P3 deferred then P1→P4 deferred; P1 now receives the ball.
    const queue = [p("P1", "P3"), p("P1", "P4")];
    const { toFire, remaining } = flushDeferredPasses(queue, "P1");

    expect(toFire).toEqual(p("P1", "P3"));        // first-in-queue fires now
    expect(remaining).toEqual([p("P1", "P4")]);    // extra re-enqueued for next landing
  });

  it("handles P1→P3, P1→P4 deferred then P3→P1 return (full round-trip)", () => {
    // Three passes deferred simultaneously:
    //   ball→P1 is in-flight while orchestrator queues P1→P3, P1→P4, P3→P1.
    const queue = [p("P1", "P3"), p("P1", "P4"), p("P3", "P1")];

    // === Landing 1: ball arrives at P1 ===
    const step1 = flushDeferredPasses(queue, "P1");
    expect(step1.toFire).toEqual(p("P1", "P3"));
    // P3→P1 stays; P1→P4 moved to tail.
    expect(step1.remaining).toEqual([p("P3", "P1"), p("P1", "P4")]);

    // === Landing 2: P1→P3 animation completes, ball arrives at P3 ===
    const step2 = flushDeferredPasses(step1.remaining, "P3");
    expect(step2.toFire).toEqual(p("P3", "P1"));
    expect(step2.remaining).toEqual([p("P1", "P4")]);

    // === Landing 3: P3→P1 completes, ball back at P1 ===
    const step3 = flushDeferredPasses(step2.remaining, "P1");
    expect(step3.toFire).toEqual(p("P1", "P4"));  // ← was previously stranded
    expect(step3.remaining).toEqual([]);
  });

  it("existing single-pass chain P1→P3→P1→P4 still works", () => {
    // Rapid burst: P1 has ball, starts P1→P3 immediately (not deferred),
    // then P3→P1 and P1→P4 are deferred.
    const queue = [p("P3", "P1"), p("P1", "P4")];

    // Landing at P3 after P1→P3 animation completes.
    const step1 = flushDeferredPasses(queue, "P3");
    expect(step1.toFire).toEqual(p("P3", "P1"));
    expect(step1.remaining).toEqual([p("P1", "P4")]);

    // Landing at P1 after P3→P1 completes.
    const step2 = flushDeferredPasses(step1.remaining, "P1");
    expect(step2.toFire).toEqual(p("P1", "P4"));
    expect(step2.remaining).toEqual([]);
  });

  it("does not mutate the original queue", () => {
    const queue = [p("P1", "P3"), p("P1", "P4")];
    const frozen = [...queue];
    flushDeferredPasses(queue, "P1");
    expect(queue).toEqual(frozen);
  });

  it("preserves relative order of non-matching entries", () => {
    const queue = [p("P2", "P3"), p("P1", "P3"), p("P2", "P1"), p("P1", "P4")];
    const { toFire, remaining } = flushDeferredPasses(queue, "P1");

    expect(toFire).toEqual(p("P1", "P3"));
    // P2 entries stay in original order; P1→P4 appended at tail.
    expect(remaining).toEqual([p("P2", "P3"), p("P2", "P1"), p("P1", "P4")]);
  });
});
