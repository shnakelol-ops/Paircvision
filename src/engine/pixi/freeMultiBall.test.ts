import { describe, expect, it } from "vitest";

import {
  backfillBallIntoPhases,
  isBallItem,
  pruneBallIdFromPhases,
  type PhaseBallSnapshot,
  type PhaseSnapshot,
} from "./createTacticalPadLiteSurface";

/**
 * Free Multi-Ball's data-layer tests. createTacticalPadLiteSurface() itself
 * (the Pixi Application + DOM host it creates) cannot be instantiated in
 * this test environment — there is no jsdom/canvas dependency in this repo,
 * and no existing test in this file exercises the full engine for the same
 * reason. What CAN be tested directly, without a DOM, is the actual
 * production logic these two pure functions perform — the same functions
 * deleteTacticalItemById/syncItems call internally, not a reimplementation
 * of them — which is exactly the highest-risk new logic the feature review
 * called out (Rule 6/7: deletion must prune every phase; a newly-added ball
 * must backfill into existing phases at its spawn position).
 *
 * Everything requiring live pointer gestures, Pixi rendering, or playback
 * ticking (possession-tap gating, drag isolation, simultaneous playback,
 * single-ball regression) is out of reach of this harness and is covered by
 * the manual QA script in the implementation report instead.
 */

function ball(id: string, overrides: Partial<PhaseBallSnapshot> = {}): PhaseBallSnapshot {
  return { id, x: 10, y: 10, attachedPlayerId: null, isFree: true, ...overrides };
}

function snapshot(footballs: PhaseBallSnapshot[]): PhaseSnapshot {
  return { players: [{ id: "p1", x: 50, y: 50 }], football: footballs };
}

describe("isBallItem", () => {
  it("is true for every football and sliotar size", () => {
    expect(isBallItem({ type: "footballSmall" })).toBe(true);
    expect(isBallItem({ type: "football" })).toBe(true);
    expect(isBallItem({ type: "footballLarge" })).toBe(true);
    expect(isBallItem({ type: "sliotarSmall" })).toBe(true);
    expect(isBallItem({ type: "sliotar" })).toBe(true);
    expect(isBallItem({ type: "sliotarLarge" })).toBe(true);
  });

  it("is false for non-ball equipment", () => {
    expect(isBallItem({ type: "cone" })).toBe(false);
    expect(isBallItem({ type: "mannequin" })).toBe(false);
  });
});

describe("pruneBallIdFromPhases", () => {
  it("removes the target ball from startPositions.football", () => {
    const start = snapshot([ball("A"), ball("B")]);
    const result = pruneBallIdFromPhases(start, [], "B");
    expect(result.startPositions.football.map((b) => b.id)).toEqual(["A"]);
  });

  it("removes the target ball from every phase, leaving other balls' data byte-for-byte untouched", () => {
    const start = snapshot([ball("A", { x: 1, y: 1 }), ball("B", { x: 2, y: 2 }), ball("C", { x: 3, y: 3 })]);
    const phase1 = snapshot([ball("A", { x: 11, y: 11 }), ball("B", { x: 12, y: 12 }), ball("C", { x: 13, y: 13 })]);
    const phase2 = snapshot([ball("A", { x: 21, y: 21 }), ball("B", { x: 22, y: 22 }), ball("C", { x: 23, y: 23 })]);
    const phase3 = snapshot([ball("A", { x: 31, y: 31 }), ball("B", { x: 32, y: 32 }), ball("C", { x: 33, y: 33 })]);

    const result = pruneBallIdFromPhases(start, [phase1, phase2, phase3], "B");

    // B is gone everywhere.
    expect(result.startPositions.football.some((b) => b.id === "B")).toBe(false);
    for (const phase of result.phases) {
      expect(phase.football.some((b) => b.id === "B")).toBe(false);
    }
    // A and C survive with their exact original data, in every phase.
    expect(result.startPositions.football).toEqual([ball("A", { x: 1, y: 1 }), ball("C", { x: 3, y: 3 })]);
    expect(result.phases[0]!.football).toEqual([ball("A", { x: 11, y: 11 }), ball("C", { x: 13, y: 13 })]);
    expect(result.phases[1]!.football).toEqual([ball("A", { x: 21, y: 21 }), ball("C", { x: 23, y: 23 })]);
    expect(result.phases[2]!.football).toEqual([ball("A", { x: 31, y: 31 }), ball("C", { x: 33, y: 33 })]);
  });

  it("never touches players in any snapshot", () => {
    const start = snapshot([ball("A")]);
    const phase = snapshot([ball("A")]);
    const result = pruneBallIdFromPhases(start, [phase], "A");
    expect(result.startPositions.players).toEqual(start.players);
    expect(result.phases[0]!.players).toEqual(phase.players);
  });

  it("is a no-op when the id doesn't exist anywhere (idempotent)", () => {
    const start = snapshot([ball("A")]);
    const phase = snapshot([ball("A")]);
    const result = pruneBallIdFromPhases(start, [phase], "does-not-exist");
    expect(result.startPositions.football).toEqual(start.football);
    expect(result.phases[0]!.football).toEqual(phase.football);
  });

  it("handles zero existing phases", () => {
    const start = snapshot([ball("A")]);
    const result = pruneBallIdFromPhases(start, [], "A");
    expect(result.startPositions.football).toEqual([]);
    expect(result.phases).toEqual([]);
  });
});

describe("backfillBallIntoPhases", () => {
  it("adds the new ball to startPositions and every existing phase at the given position, stationary", () => {
    const start = snapshot([ball("A")]);
    const phase1 = snapshot([ball("A")]);
    const phase2 = snapshot([ball("A")]);
    const phase3 = snapshot([ball("A")]);

    const result = backfillBallIntoPhases(start, [phase1, phase2, phase3], "C", { x: 42, y: 7 });

    expect(result.startPositions.football).toContainEqual(ball("C", { x: 42, y: 7 }));
    for (const phase of result.phases) {
      expect(phase.football).toContainEqual(ball("C", { x: 42, y: 7 }));
    }
    expect(result.phases).toHaveLength(3);
  });

  it("does not disappear navigating backward — present identically in phase 1, 2, and 3", () => {
    const start = snapshot([ball("A")]);
    const phases = [snapshot([ball("A")]), snapshot([ball("A")]), snapshot([ball("A")])];
    const result = backfillBallIntoPhases(start, phases, "C", { x: 5, y: 5 });
    for (const phase of result.phases) {
      const entry = phase.football.find((b) => b.id === "C");
      expect(entry).toEqual(ball("C", { x: 5, y: 5 }));
    }
  });

  it("new entry is free and unattached, regardless of any other ball's attachment state", () => {
    const start = snapshot([ball("A", { attachedPlayerId: "p1", isFree: false })]);
    const result = backfillBallIntoPhases(start, [], "B", { x: 0, y: 0 });
    const added = result.startPositions.football.find((b) => b.id === "B")!;
    expect(added.isFree).toBe(true);
    expect(added.attachedPlayerId).toBeNull();
  });

  it("leaves an existing ball's data in other snapshots completely untouched", () => {
    const start = snapshot([ball("A", { x: 99, y: 99 })]);
    const result = backfillBallIntoPhases(start, [], "B", { x: 1, y: 1 });
    expect(result.startPositions.football.find((b) => b.id === "A")).toEqual(ball("A", { x: 99, y: 99 }));
  });

  it("is idempotent per snapshot: skips a phase that already has this id instead of duplicating it", () => {
    const start = snapshot([]);
    const phaseAlreadyHasIt = snapshot([ball("C", { x: 77, y: 77 })]);
    const result = backfillBallIntoPhases(start, [phaseAlreadyHasIt], "C", { x: 1, y: 1 });
    // Unchanged — not overwritten with the "backfill" position, not duplicated.
    expect(result.phases[0]!.football).toEqual([ball("C", { x: 77, y: 77 })]);
  });

  it("handles zero existing phases (backfills startPositions only)", () => {
    const start = snapshot([]);
    const result = backfillBallIntoPhases(start, [], "A", { x: 3, y: 4 });
    expect(result.startPositions.football).toEqual([ball("A", { x: 3, y: 4 })]);
    expect(result.phases).toEqual([]);
  });
});

describe("delete-then-navigate scenario (mirrors the required Scenario E: delete Ball B, A/C untouched)", () => {
  it("keeps a deleted ball gone after simulating phase navigation forward and back", () => {
    const start = snapshot([ball("A"), ball("B"), ball("C")]);
    const phase1 = snapshot([ball("A", { x: 1 }), ball("B", { x: 1 }), ball("C", { x: 1 })]);
    const phase2 = snapshot([ball("A", { x: 2 }), ball("B", { x: 2 }), ball("C", { x: 2 })]);
    const phase3 = snapshot([ball("A", { x: 3 }), ball("B", { x: 3 }), ball("C", { x: 3 })]);

    const { startPositions, phases } = pruneBallIdFromPhases(start, [phase1, phase2, phase3], "B");

    // Simulate "navigate 1 -> 2 -> 3 -> 1" by just re-reading each snapshot
    // (goToPhase/applySnapshotToSurface only ever reads these arrays by id;
    // pruning them at delete time is what guarantees it can't resurrect).
    for (const visited of [phases[0], phases[1], phases[2], phases[0], startPositions]) {
      expect(visited!.football.some((b) => b.id === "B")).toBe(false);
      expect(visited!.football.map((b) => b.id).sort()).toEqual(["A", "C"]);
    }
  });
});
