/**
 * Selection-first Angled Zone editing — the Practice Area interaction rules
 * (practiceAreaEditorToggle.ts), applied to the four-corner zone:
 *
 *  - A new or newly selected zone shows its four corner handles only; the
 *    appearance toolbar stays closed.
 *  - A deliberate (stationary) tap inside the zone toggles the toolbar open /
 *    closed. Dragging the interior moves the zone and never toggles.
 *  - A press on a corner handle reshapes and never toggles, tap or drag.
 *    On a small zone the 46px handle targets can cover the whole interior,
 *    so only a press on or near the visible handle (ANGLED_ZONE_HANDLE_CORE_PX)
 *    is treated as "on the handle"; a stationary tap elsewhere inside the
 *    zone still counts as an interior tap (a drag from there still reshapes
 *    that corner, as before).
 *  - A tap outside the zone first closes an open toolbar (the zone stays
 *    selected); with the toolbar already closed it ends editing, exactly as
 *    an outside tap clears a Practice Area selection.
 *
 * Pure rules only; createTacticalPadLiteSurface applies them.
 */

import { isPracticeAreaEditorToggleTap, practiceAreaEditorOpenAfterSelection } from "./practiceAreaEditorToggle";

/** Screen-px radius around a corner that always counts as pressing the handle itself. */
export const ANGLED_ZONE_HANDLE_CORE_PX = 16;

export type AngledZonePressInput = {
  /** The press hit a corner handle's touch target. */
  onCornerTarget: boolean;
  /** Screen-px distance from the press to that corner (when onCornerTarget). */
  cornerDistancePx: number;
  /** The press is inside the zone polygon. */
  insideZone: boolean;
};

/** Whether a stationary release of this press may toggle the toolbar (it is an interior tap). */
export function angledZonePressIsInteriorTap(input: AngledZonePressInput): boolean {
  if (!input.onCornerTarget) return true;
  return input.insideZone && input.cornerDistancePx > ANGLED_ZONE_HANDLE_CORE_PX;
}

export type AngledZoneReleaseInput = {
  /** From angledZonePressIsInteriorTap at press time. */
  isInteriorPress: boolean;
  hasCrossedThreshold: boolean;
  releaseDistancePx: number | null;
  dragThresholdPx: number;
};

/** True when releasing this gesture should toggle the appearance toolbar. */
export function isAngledZoneEditorToggleTap(input: AngledZoneReleaseInput): boolean {
  return isPracticeAreaEditorToggleTap({
    kind: input.isInteriorPress ? "move" : "resize",
    hasCrossedThreshold: input.hasCrossedThreshold,
    releaseDistancePx: input.releaseDistancePx,
    dragThresholdPx: input.dragThresholdPx,
  });
}

/** Toolbar state when the edited zone changes (a new zone, another zone, or none): always closed. */
export function angledZoneEditorOpenAfterSelection(nextId: string | null): boolean {
  return practiceAreaEditorOpenAfterSelection(nextId);
}

/** A tap outside the edited zone: close an open toolbar first, otherwise stop editing. */
export function angledZoneOutsideTapAction(editorOpen: boolean): "close-toolbar" | "end-edit" {
  return editorOpen ? "close-toolbar" : "end-edit";
}
