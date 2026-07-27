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
