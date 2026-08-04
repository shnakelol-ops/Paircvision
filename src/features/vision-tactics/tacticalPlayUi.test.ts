import { describe, expect, it } from "vitest";

import {
  SETUP_SITUATIONS,
  TP_SPEED_OPTIONS,
  ARRANGE_MODE_LABEL,
  computeAnyBottomPanelOpen,
  computeFloatingShareVisible,
  situationDisplayLabel,
  type BottomPanelFlags,
} from "./tacticalPlayUi";
import { TACTICAL_TEMPLATES } from "./tacticalTemplates";

const NO_PANELS: BottomPanelFlags = {
  isControlsOpen: false,
  setupOpen: false,
  sequenceOpen: false,
  unitsOpen: false,
  zonesOpen: false,
  itemsOpen: false,
  playerSheetOpen: false,
};

describe("Setup categories — Demo removed, Players unaffected", () => {
  it("no longer offers Demo as a Setup situation", () => {
    const ids = SETUP_SITUATIONS.map((s) => s.id);
    expect(ids).not.toContain("demo");
  });

  it("keeps the four tactical situations", () => {
    expect(SETUP_SITUATIONS.map((s) => s.id)).toEqual(["restart", "attack", "defence", "press"]);
  });

  it("preserves the demo template data as a fixture (not deleted with the UI entry)", () => {
    // The Setup entry point is gone, but the reusable sample play remains in the
    // template data, so the "demo" situation value stays valid (no schema change).
    const demo = TACTICAL_TEMPLATES.find((t) => t.situation === "demo");
    expect(demo).toBeDefined();
    expect(demo?.routes && demo.routes.length).toBeGreaterThan(0);
  });
});

describe("Situation display label — sport-correct terminology (Phase B)", () => {
  const restart = SETUP_SITUATIONS.find((s) => s.id === "restart")!;
  const attack = SETUP_SITUATIONS.find((s) => s.id === "attack")!;

  it("never shows 'Restart' to a coach — Kickout in football", () => {
    expect(situationDisplayLabel(restart, "football")).toBe("Kickout");
  });

  it("never shows 'Restart' to a coach — Puckout in hurling", () => {
    expect(situationDisplayLabel(restart, "hurling")).toBe("Puckout");
  });

  it("leaves sport-neutral situations unchanged", () => {
    expect(situationDisplayLabel(attack, "football")).toBe("Attack");
    expect(situationDisplayLabel(attack, "hurling")).toBe("Attack");
  });

  it("keeps 'restart' as the underlying id (code-only, not shown)", () => {
    expect(restart.id).toBe("restart");
  });
});

describe("Playback speed model unchanged", () => {
  it("keeps the same seven speed multipliers", () => {
    expect(TP_SPEED_OPTIONS.map((o) => o.multiplier)).toEqual([0.15, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5]);
  });
});

describe("Arrange mode label", () => {
  it("uses the coach-facing 'Arrange' label", () => {
    expect(ARRANGE_MODE_LABEL).toBe("Arrange");
  });
});

describe("Floating Share visibility", () => {
  it("is visible when nothing is open and playback is idle", () => {
    expect(computeFloatingShareVisible({ ...NO_PANELS, isPlaying: false, isPaused: false })).toBe(true);
  });

  const panels: Array<keyof BottomPanelFlags> = [
    "isControlsOpen", "setupOpen", "sequenceOpen", "unitsOpen", "zonesOpen", "itemsOpen", "playerSheetOpen",
  ];
  for (const panel of panels) {
    it(`is hidden while ${panel} is open`, () => {
      const flags = { ...NO_PANELS, [panel]: true };
      expect(computeAnyBottomPanelOpen(flags)).toBe(true);
      expect(computeFloatingShareVisible({ ...flags, isPlaying: false, isPaused: false })).toBe(false);
    });
  }

  it("is restored once every panel closes", () => {
    // open then close
    expect(computeFloatingShareVisible({ ...NO_PANELS, setupOpen: true, isPlaying: false, isPaused: false })).toBe(false);
    expect(computeFloatingShareVisible({ ...NO_PANELS, isPlaying: false, isPaused: false })).toBe(true);
  });

  it("is hidden during playback even with no panel open", () => {
    expect(computeFloatingShareVisible({ ...NO_PANELS, isPlaying: true, isPaused: false })).toBe(false);
    expect(computeFloatingShareVisible({ ...NO_PANELS, isPlaying: false, isPaused: true })).toBe(false);
  });
});
