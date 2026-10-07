// Read-only phase cursor for Tactical Slate presentation (Full View).
//
// The cursor is the board's last *applied* phase position, owned by the
// engine (createTacticalPadLiteSurface) and only reported outward. It never
// drives playback or edits board state — it just remembers which saved
// snapshot the live positions came from so a presentation controller can
// render "Start" / "Phase N/M" and step to the neighbouring phase.
//
// Kept pure and framework-free so it can be unit-tested without a Pixi/WebGL
// context (the surface itself cannot be constructed under jsdom).

/** Cursor value meaning "Start positions" (before Phase 1). */
export const PHASE_CURSOR_START = -1;

export type PhaseCursorEvent =
  /** reset(), setStart(), newBoard/importBoardState(): back to Start. */
  | { type: "start" }
  /** goToPhase(index): instant jump to a saved phase. */
  | { type: "goToPhase"; index: number; phaseCount: number }
  /** Saved-phase playback began (it always applies Start first). */
  | { type: "phasePlaybackStart" }
  /** A saved-phase playback segment finished: segment i lands on phase i. */
  | { type: "phasePlaybackSegmentComplete"; segmentIndex: number; phaseCount: number }
  /** addPhase(): the new last phase *is* the current live positions. */
  | { type: "addPhase"; phaseCount: number }
  /** undoPhase(): the engine re-applies the new last phase (or Start). */
  | { type: "undoPhase"; phaseCount: number };

function clampToPhases(index: number, phaseCount: number): number {
  const count = Number.isFinite(phaseCount) ? Math.max(0, Math.trunc(phaseCount)) : 0;
  if (!Number.isFinite(index)) return PHASE_CURSOR_START;
  return Math.max(PHASE_CURSOR_START, Math.min(count - 1, Math.trunc(index)));
}

export function nextPhaseCursor(current: number, event: PhaseCursorEvent): number {
  switch (event.type) {
    case "start":
    case "phasePlaybackStart":
      return PHASE_CURSOR_START;
    case "goToPhase":
      if (event.index < 0 || event.index >= event.phaseCount) return current;
      return clampToPhases(event.index, event.phaseCount);
    case "phasePlaybackSegmentComplete":
      // playbackPath = [start, phase0, phase1, ...]; segment i ends on phase i.
      return clampToPhases(event.segmentIndex, event.phaseCount);
    case "addPhase":
    case "undoPhase":
      return clampToPhases(event.phaseCount - 1, event.phaseCount);
    default:
      return current;
  }
}
