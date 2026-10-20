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

// ---- Angled Zone tool: who owns a press ----------------------------------
//
// Zone editing belongs to the Angled Zone tool only (Move mode never selects
// or edits a zone). Under the tool, a press on the selected zone's corner or
// body is handled by the editor above. Any other press — on another existing
// zone or on empty pitch — waits until it is clearly a tap or a drag:
//  - a drag past the movement threshold always draws a new zone from the
//    press point (so selection never makes creating zones harder, even
//    inside an existing or pitch-sized zone);
//  - a tap on an existing zone selects it (handles only, toolbar closed);
//  - a tap on empty pitch closes an open toolbar, otherwise deselects.

export type AngledToolPendingRelease = {
  /** The press travelled past the drag threshold. */
  hasCrossedThreshold: boolean;
  /** The topmost existing zone under the press (not the selected one), or null. */
  zoneUnderPressId: string | null;
  /** A zone is currently selected for editing. */
  isEditing: boolean;
  /** Its appearance toolbar is open. */
  editorOpen: boolean;
};

export type AngledToolPendingAction = "draw" | "select" | "close-toolbar" | "end-edit" | "none";

/** What a pending Angled Zone tool press resolves to. */
export function resolveAngledToolPendingPress(input: AngledToolPendingRelease): AngledToolPendingAction {
  if (input.hasCrossedThreshold) return "draw";
  if (input.zoneUnderPressId != null) return "select";
  if (!input.isEditing) return "none";
  return angledZoneOutsideTapAction(input.editorOpen);
}
