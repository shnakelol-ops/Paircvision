// Pure UI configuration and helpers for Tactical Play, extracted from
// TacticalPlaySurface so the polish logic is unit-testable without rendering the
// WebGL-backed surface. No behavioural or schema changes live here.

import type { TacticalTemplateSituation } from "./tacticalTemplates";

// Setup's primary tactical-situation categories. "Demo" was removed here — its
// only function was loading a canned demonstration play (superseded by the
// Guided Tour); the demoTemplate data is preserved in tacticalTemplates.ts.
export const SETUP_SITUATIONS: Array<{ id: TacticalTemplateSituation; label: string }> = [
  { id: "restart", label: "Restart" },
  { id: "attack", label: "Attack" },
  { id: "defence", label: "Defence" },
  { id: "press", label: "Press" },
];

// Coach-facing display label for a Setup situation. The "restart" id stays a
// code-only identifier (CLAUDE.md: "Kickouts / Puckouts (in display)" /
// "Restarts (in code, not display)") — its label is sport-correct, never
// "Restart", wherever it's actually shown to a coach. Every other situation
// is sport-neutral and keeps its static label unchanged.
export function situationDisplayLabel(
  situation: { id: TacticalTemplateSituation; label: string },
  sport: "football" | "hurling",
): string {
  if (situation.id === "restart") {
    return sport === "hurling" ? "Puckout" : "Kickout";
  }
  return situation.label;
}

// Playback speed presets. Multipliers and their persisted mapping are unchanged
// by the polish PR — only the control's presentation changed.
export const TP_SPEED_OPTIONS: ReadonlyArray<{ multiplier: number; label: string }> = [
  { multiplier: 0.15, label: "0.15×" },
  { multiplier: 0.25, label: "0.25×" },
  { multiplier: 0.5,  label: "0.5×"  },
  { multiplier: 0.75, label: "0.75×" },
  { multiplier: 1.0,  label: "1×"    },
  { multiplier: 1.25, label: "1.25×" },
  { multiplier: 1.5,  label: "1.5×"  },
];

// Coach-facing label for the resting/authoring mode (drag to reposition, Set
// Start, add/remove players). The internal menu-mode enum key stays "move" — only
// this display string changes.
export const ARRANGE_MODE_LABEL = "Arrange";

export type BottomPanelFlags = {
  isControlsOpen: boolean;
  setupOpen: boolean;
  sequenceOpen: boolean;
  unitsOpen: boolean;
  zonesOpen: boolean;
  itemsOpen: boolean;
  playerSheetOpen: boolean;
};

// True when any authoring panel/sheet is open. Excludes the Share ("Plays") panel,
// which owns its own toggle. Floating controls (Share button, portrait playback
// button) derive their visibility from this so they never overlap an open panel.
export function computeAnyBottomPanelOpen(flags: BottomPanelFlags): boolean {
  return (
    flags.isControlsOpen ||
    flags.setupOpen ||
    flags.sequenceOpen ||
    flags.unitsOpen ||
    flags.zonesOpen ||
    flags.itemsOpen ||
    flags.playerSheetOpen
  );
}

// The floating Share control is visible only when nothing else is competing for
// the same space: not during playback, and not while any authoring panel is open.
export function computeFloatingShareVisible(
  flags: BottomPanelFlags & { isPlaying: boolean; isPaused: boolean },
): boolean {
  const playbackFloatingVisible = flags.isPlaying || flags.isPaused;
  return !playbackFloatingVisible && !computeAnyBottomPanelOpen(flags);
}

// ---- Saved playback speed ----------------------------------------------------
//
// A play stores both its exact multiplier (`playbackSpeedMultiplier`) and the
// nearest of the original three presets (`playbackSpeed`), so builds that
// predate the exact field still reopen it at a sensible speed.

export const TP_DEFAULT_SPEED_MULTIPLIER = 1.0;

/** The original preset → multiplier mapping, used for plays saved before the exact multiplier existed. */
export const TP_PRESET_SPEED_MULTIPLIER: Readonly<Record<"slow" | "normal" | "fast", number>> = {
  slow: 0.5,
  normal: 1.0,
  fast: 1.25,
};

/** Nearest legacy preset for a multiplier (unchanged thresholds). */
export function playbackSpeedPresetFor(multiplier: number): "slow" | "normal" | "fast" {
  if (multiplier < 0.85) return "slow";
  if (multiplier > 1.15) return "fast";
  return "normal";
}

/**
 * The multiplier to reopen a saved play at: its exact multiplier when it is
 * one of the speeds the control offers, otherwise its legacy preset,
 * otherwise 1×.
 */
export function resolveSavedSpeedMultiplier(saved: {
  playbackSpeed?: string;
  playbackSpeedMultiplier?: number;
}): number {
  const exact = saved.playbackSpeedMultiplier;
  if (typeof exact === "number" && TP_SPEED_OPTIONS.some((option) => option.multiplier === exact)) {
    return exact;
  }
  const preset = saved.playbackSpeed;
  if (preset === "slow" || preset === "normal" || preset === "fast") {
    return TP_PRESET_SPEED_MULTIPLIER[preset];
  }
  return TP_DEFAULT_SPEED_MULTIPLIER;
}
