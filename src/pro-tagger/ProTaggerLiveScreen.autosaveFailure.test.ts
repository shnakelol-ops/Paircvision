// P0-1 regression coverage: live autosave and the beforeunload flush used to
// call saveProTaggerMatchFull(...) without inspecting its boolean success
// result, so a localStorage write failure during live capture was silent —
// unlike manual Save, which already surfaced "Save failed — storage
// unavailable." via saveFeedback/actionsFeedback.
//
// ProTaggerLiveScreen.tsx has no React rendering harness in this repo (see
// ProTaggerLiveScreen.clockLifecycle.test.ts), so this suite exercises the
// exact pure decision function the autosave debounce effect and the
// beforeunload handler both call to decide whether the persistent warning's
// shown/hidden state needs to change.
import { describe, it, expect } from "vitest";
import { deriveAutosaveWarningState } from "./ProTaggerLiveScreen";

describe("Event Stats (Pro Tagger): autosave failure visibility (P0-1)", () => {
  it("autosave success while not currently shown: stays hidden, no change", () => {
    const result = deriveAutosaveWarningState(false, true);
    expect(result.nextShown).toBe(false);
    expect(result.changed).toBe(false);
  });

  it("autosave failure while not currently shown: warning turns on", () => {
    const result = deriveAutosaveWarningState(false, false);
    expect(result.nextShown).toBe(true);
    expect(result.changed).toBe(true);
  });

  it("repeated failures do not re-trigger a state update once the warning is already shown", () => {
    let shown = false;

    const first = deriveAutosaveWarningState(shown, false);
    expect(first).toEqual({ nextShown: true, changed: true });
    shown = first.nextShown;

    // Simulate several more debounce ticks, storage still unavailable.
    for (let i = 0; i < 5; i++) {
      const tick = deriveAutosaveWarningState(shown, false);
      expect(tick.nextShown).toBe(true);
      expect(tick.changed).toBe(false); // no repeated warning spam
      shown = tick.nextShown;
    }
  });

  it("recovery: once a save succeeds again, the warning turns off exactly once", () => {
    let shown = true; // warning currently showing from a prior failure

    const recovered = deriveAutosaveWarningState(shown, true);
    expect(recovered).toEqual({ nextShown: false, changed: true });
    shown = recovered.nextShown;

    // Further successes are no-ops — already hidden.
    const again = deriveAutosaveWarningState(shown, true);
    expect(again.changed).toBe(false);
  });

  it("repeated successes while never having failed never toggle the warning on", () => {
    let shown = false;
    for (let i = 0; i < 5; i++) {
      const tick = deriveAutosaveWarningState(shown, true);
      expect(tick.nextShown).toBe(false);
      expect(tick.changed).toBe(false);
      shown = tick.nextShown;
    }
  });
});
