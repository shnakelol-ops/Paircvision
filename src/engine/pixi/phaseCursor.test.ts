import { describe, expect, it } from "vitest";

import { nextPhaseCursor, PHASE_CURSOR_START, type PhaseCursorEvent } from "./phaseCursor";

// The surface itself cannot be constructed under test (no WebGL), so the
// engine routes every cursor change through this pure reducer. These tests
// lock the transitions the engine wires to reset/goToPhase/playback/add/undo.

function run(events: PhaseCursorEvent[], start = PHASE_CURSOR_START): number[] {
  const trail: number[] = [];
  let cursor = start;
  for (const event of events) {
    cursor = nextPhaseCursor(cursor, event);
    trail.push(cursor);
  }
  return trail;
}

describe("phase cursor", () => {
  it("starts at Start (-1)", () => {
    expect(PHASE_CURSOR_START).toBe(-1);
  });

  it("reset()/setStart()/import return to Start", () => {
    expect(nextPhaseCursor(2, { type: "start" })).toBe(PHASE_CURSOR_START);
  });

  it("goToPhase(i) moves to i and ignores out-of-range indices (as the engine does)", () => {
    expect(nextPhaseCursor(PHASE_CURSOR_START, { type: "goToPhase", index: 2, phaseCount: 4 })).toBe(2);
    expect(nextPhaseCursor(1, { type: "goToPhase", index: 4, phaseCount: 4 })).toBe(1);
    expect(nextPhaseCursor(1, { type: "goToPhase", index: -1, phaseCount: 4 })).toBe(1);
  });

  it("saved-phase playback starts at Start and each completed segment lands on its phase", () => {
    const trail = run(
      [
        { type: "phasePlaybackStart" },
        { type: "phasePlaybackSegmentComplete", segmentIndex: 0, phaseCount: 3 },
        { type: "phasePlaybackSegmentComplete", segmentIndex: 1, phaseCount: 3 },
        { type: "phasePlaybackSegmentComplete", segmentIndex: 2, phaseCount: 3 },
      ],
      1,
    );
    expect(trail).toEqual([PHASE_CURSOR_START, 0, 1, 2]);
  });

  it("addPhase points at the new last phase", () => {
    expect(run([{ type: "addPhase", phaseCount: 1 }, { type: "addPhase", phaseCount: 2 }])).toEqual([0, 1]);
  });

  it("undoPhase points at the new last phase, or Start when none remain", () => {
    expect(nextPhaseCursor(2, { type: "undoPhase", phaseCount: 2 })).toBe(1);
    expect(nextPhaseCursor(0, { type: "undoPhase", phaseCount: 0 })).toBe(PHASE_CURSOR_START);
  });

  it("stays correct through a realistic reset/goToPhase/playback/add/undo sequence", () => {
    const trail = run([
      { type: "addPhase", phaseCount: 1 },
      { type: "addPhase", phaseCount: 2 },
      { type: "addPhase", phaseCount: 3 },
      { type: "goToPhase", index: 0, phaseCount: 3 },
      { type: "start" },
      { type: "phasePlaybackStart" },
      { type: "phasePlaybackSegmentComplete", segmentIndex: 0, phaseCount: 3 },
      { type: "goToPhase", index: 2, phaseCount: 3 },
      { type: "undoPhase", phaseCount: 2 },
      { type: "addPhase", phaseCount: 3 },
      { type: "start" },
    ]);
    expect(trail).toEqual([0, 1, 2, 0, -1, -1, 0, 2, 1, 2, -1]);
  });
});
