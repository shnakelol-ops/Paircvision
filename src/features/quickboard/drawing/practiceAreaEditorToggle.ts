/**
 * Selection-first Practice Area editing (Training Grass).
 *
 *  - The first tap on an area selects it: four corner handles, no toolbar.
 *  - A later deliberate tap on the selected area toggles the property
 *    toolbar open / closed; the area stays selected either way.
 *  - Dragging (move or corner resize) never toggles, and neither does a tap
 *    on a corner handle. Press duration plays no part, so a slow but still
 *    tap always counts.
 *  - Selecting another area, or clearing the selection, closes the toolbar.
 *    Duplicate keeps it open on the copy, as before.
 *
 * Pure rules only; createTacticalPadLiteSurface applies them.
 */

export type PracticeAreaTapInput = {
  /** The gesture that began on the already-selected area. */
  kind: "move" | "resize";
  /** The pointer travelled past the drag threshold at any point. */
  hasCrossedThreshold: boolean;
  /** Distance (screen px) between press and release; null if unknown. */
  releaseDistancePx: number | null;
  dragThresholdPx: number;
};

/** True when releasing this gesture should toggle the property toolbar. */
export function isPracticeAreaEditorToggleTap(input: PracticeAreaTapInput): boolean {
  if (input.kind !== "move") return false;
  if (input.hasCrossedThreshold) return false;
  return input.releaseDistancePx == null || input.releaseDistancePx < input.dragThresholdPx;
}

/** Whether the toolbar is open after the selection changes to `nextId`. */
export function practiceAreaEditorOpenAfterSelection(
  nextId: string | null,
  options: { keepEditorOpen?: boolean; wasOpen?: boolean } = {},
): boolean {
  return nextId != null && Boolean(options.keepEditorOpen && options.wasOpen);
}
