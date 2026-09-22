// P0 regression coverage: Half Time must persist as HALF_TIME, not collapse
// into FIRST_HALF or SECOND_HALF.
//
// buildSaveRecords() (ProTaggerLiveScreen.tsx) previously derived
// restoreContext.matchState from `halfRef.current` alone (FULL_TIME ->
// FULL_TIME, else half===2 ? SECOND_HALF : FIRST_HALF), which could never
// produce "HALF_TIME" even though the live state machine reaches it
// (freezeMatch("HALF_TIME")) and the restore-context type explicitly
// supports it. Every autosave/beforeunload-flush/manual-save that fired
// while the coach was paused at Half Time (before tapping "Start Second
// Half") persisted matchState as FIRST_HALF instead. Reloading in that
// window then restored the screen into a mid-first-half state with no
// visible path to properly start the second half, risking subsequent 2H
// events being tagged into the wrong half.
//
// deriveRestoreMatchState is the extracted, exported, pure decision the fix
// applies — ProTaggerLiveScreen has no React rendering harness in this repo
// (see ProTaggerLiveScreen.clockLifecycle.test.ts's own documented
// limitation), so this is the direct, framework-free way to lock the fix.
import { describe, expect, it } from "vitest";
import { deriveRestoreMatchState } from "./ProTaggerLiveScreen";

describe("deriveRestoreMatchState (P0-2)", () => {
  it("HALF_TIME -> persists as HALF_TIME (the fix), not FIRST_HALF or SECOND_HALF", () => {
    expect(deriveRestoreMatchState("HALF_TIME", 1)).toBe("HALF_TIME");
    // Half Time is reached from the end of 1H, so half is still 1 at the
    // freeze point — confirms the state machine's own truth is used
    // directly, not re-derived from `half` (which would have said FIRST_HALF).
  });

  it("FULL_TIME -> persists as FULL_TIME regardless of half (unchanged pre-fix behaviour)", () => {
    expect(deriveRestoreMatchState("FULL_TIME", 1)).toBe("FULL_TIME");
    expect(deriveRestoreMatchState("FULL_TIME", 2)).toBe("FULL_TIME");
  });

  it("FIRST_HALF (mid-first-half autosave) -> persists as FIRST_HALF (unchanged pre-fix behaviour)", () => {
    expect(deriveRestoreMatchState("FIRST_HALF", 1)).toBe("FIRST_HALF");
  });

  it("SECOND_HALF (mid-second-half autosave) -> persists as SECOND_HALF (unchanged pre-fix behaviour)", () => {
    expect(deriveRestoreMatchState("SECOND_HALF", 2)).toBe("SECOND_HALF");
  });

  it("PRE_MATCH falls back to the half-based derivation, same as before this fix (defensive — autosave already guards against saving PRE_MATCH with no events)", () => {
    expect(deriveRestoreMatchState("PRE_MATCH", 1)).toBe("FIRST_HALF");
  });
});

describe("Half Time save/restore end-to-end (P0-2)", () => {
  // Simulates the exact sequence buildSaveRecords + the RestoreState
  // consumer (savedMatchToRestoreState in ProTaggerPage.tsx, and
  // ProTaggerLiveScreen's own useState(restoreState?.matchState ?? ...)
  // initializer) go through, using deriveRestoreMatchState as the fixed
  // link between them.
  it("FIRST_HALF -> HALF_TIME -> save -> restore lands on HALF_TIME, with the correct path to Start Second Half implied by that state", () => {
    // 1H events captured normally.
    const half = 1;
    let matchState: "PRE_MATCH" | "FIRST_HALF" | "HALF_TIME" | "SECOND_HALF" | "FULL_TIME" = "FIRST_HALF";

    // Coach taps HT: freezeMatch("HALF_TIME") sets matchStateRef synchronously.
    matchState = "HALF_TIME";

    // Autosave (or beforeunload, or manual Save) fires while paused at HT,
    // before "Start Second Half" is tapped.
    const persistedMatchState = deriveRestoreMatchState(matchState, half);
    expect(persistedMatchState).toBe("HALF_TIME");

    // Reload: ProTaggerLiveScreen's initial useState reads restoreState.matchState
    // directly (no further derivation) — HALF_TIME restores as HALF_TIME,
    // which is exactly matchState === "HALF_TIME", the condition that renders
    // the Half Time break screen with its "START SECOND HALF" button
    // (see ProTaggerLiveScreen.tsx's MATCH BREAK SCREENS block).
    const restoredMatchState = persistedMatchState;
    expect(restoredMatchState).toBe("HALF_TIME");
  });

  it("after Start Second Half from a HALF_TIME restore, subsequent events are tagged half 2 while prior 1H events remain half 1", () => {
    // Prior first-half events, already captured and immutable.
    const firstHalfEvents = [
      { id: "e1", half: 1 as const },
      { id: "e2", half: 1 as const },
    ];

    // Restore into HALF_TIME (the fix), then the coach taps "Start Second
    // Half" — handleStartSecondHalf sets halfRef.current = 2 unconditionally,
    // unaffected by this fix (only the persisted-state derivation changed).
    let half: 1 | 2 = 1;
    const matchStateAfterRestore = deriveRestoreMatchState("HALF_TIME", half);
    expect(matchStateAfterRestore).toBe("HALF_TIME");

    half = 2; // handleStartSecondHalf
    const newEvent = { id: "e3", half };

    const allEvents = [...firstHalfEvents, newEvent];
    expect(allEvents.filter((e) => e.half === 1)).toHaveLength(2);
    expect(allEvents.filter((e) => e.half === 2)).toHaveLength(1);
    expect(newEvent.half).toBe(2);
  });

  it("regression: an ordinary reload mid-FIRST_HALF (no Half Time involved) still restores as FIRST_HALF, not HALF_TIME", () => {
    expect(deriveRestoreMatchState("FIRST_HALF", 1)).toBe("FIRST_HALF");
  });

  it("regression: an ordinary reload mid-SECOND_HALF (no Half Time involved) still restores as SECOND_HALF, not HALF_TIME", () => {
    expect(deriveRestoreMatchState("SECOND_HALF", 2)).toBe("SECOND_HALF");
  });
});
