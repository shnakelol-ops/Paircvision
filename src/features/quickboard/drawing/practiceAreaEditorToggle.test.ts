import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  isPracticeAreaEditorToggleTap,
  practiceAreaEditorOpenAfterSelection,
} from "./practiceAreaEditorToggle";

const tap = { kind: "move" as const, hasCrossedThreshold: false, releaseDistancePx: 1, dragThresholdPx: 5 };

describe("Practice Area toolbar toggle — what counts as a deliberate tap", () => {
  it("a short, still tap inside the selected area toggles the toolbar", () => {
    expect(isPracticeAreaEditorToggleTap(tap)).toBe(true);
    expect(isPracticeAreaEditorToggleTap({ ...tap, releaseDistancePx: null })).toBe(true);
    expect(isPracticeAreaEditorToggleTap({ ...tap, releaseDistancePx: 4.9 })).toBe(true);
  });

  it("a drag release never counts as a tap (moved past the threshold, even without move events)", () => {
    expect(isPracticeAreaEditorToggleTap({ ...tap, hasCrossedThreshold: true })).toBe(false);
    expect(isPracticeAreaEditorToggleTap({ ...tap, releaseDistancePx: 5 })).toBe(false);
    expect(isPracticeAreaEditorToggleTap({ ...tap, releaseDistancePx: 40 })).toBe(false);
  });

  it("a tap on a corner handle (resize gesture) never opens the toolbar", () => {
    expect(isPracticeAreaEditorToggleTap({ ...tap, kind: "resize" })).toBe(false);
  });

  it("timing plays no part: no rapid double-tap needed, and a slow still press still counts", () => {
    // The rule only looks at the gesture kind and how far the pointer travelled.
    expect(Object.keys(tap).sort()).toEqual(["dragThresholdPx", "hasCrossedThreshold", "kind", "releaseDistancePx"]);
    expect(isPracticeAreaEditorToggleTap(tap)).toBe(true);
  });
});

describe("Practice Area toolbar after a selection change", () => {
  it("selecting an area (first tap) shows handles only — the toolbar starts closed", () => {
    expect(practiceAreaEditorOpenAfterSelection("a")).toBe(false);
    expect(practiceAreaEditorOpenAfterSelection("b", { wasOpen: true })).toBe(false);
  });

  it("clearing the selection (tap outside, Done, other modes) always closes it", () => {
    expect(practiceAreaEditorOpenAfterSelection(null, { wasOpen: true })).toBe(false);
    expect(practiceAreaEditorOpenAfterSelection(null, { wasOpen: true, keepEditorOpen: true })).toBe(false);
  });

  it("Duplicate keeps the toolbar open on the copy only if it was open", () => {
    expect(practiceAreaEditorOpenAfterSelection("copy", { keepEditorOpen: true, wasOpen: true })).toBe(true);
    expect(practiceAreaEditorOpenAfterSelection("copy", { keepEditorOpen: true, wasOpen: false })).toBe(false);
  });
});

describe("Practice Area toolbar wiring", () => {
  const surface = readFileSync(resolve(__dirname, "../../../engine/pixi/createTacticalPadLiteSurface.ts"), "utf8");
  const page = readFileSync(resolve(__dirname, "../../../pages/TacticalPadLiteClean.tsx"), "utf8");

  it("the page shows the toolbar only when the selection reports editorOpen", () => {
    expect(page).toMatch(/practiceAreaSelection\?\.editorOpen &&\s+!isPlaybackLocked/);
  });

  it("the surface toggles only on a gesture that began on the selected area, and reports the flag", () => {
    expect(surface).toMatch(/if \(isToggleTap && gesture\.areaId === selectedPracticeAreaId\) \{\s+practiceAreaEditorOpen = !practiceAreaEditorOpen;/);
    expect(surface).toMatch(/editorOpen: practiceAreaEditorOpen,/);
    // A drag release returns before the tap check.
    expect(surface).toMatch(/if \(gesture\.hasCrossedThreshold\) \{\s+emitPracticeAreaSelection\(\);\s+return;\s+\}/);
  });
});
