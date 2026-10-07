import type { CSSProperties } from "react";

import { PHASE_CURSOR_START } from "../../../engine/pixi/phaseCursor";

// Pure helpers for Tactical Slate Full View (presentation mode). Kept out of
// the page/controller so sizing and phase navigation are directly testable.

const SAFE_TOP = "env(safe-area-inset-top, 0px)";
const SAFE_RIGHT = "env(safe-area-inset-right, 0px)";
const SAFE_BOTTOM = "env(safe-area-inset-bottom, 0px)";
const SAFE_LEFT = "env(safe-area-inset-left, 0px)";

/**
 * Root padding while Full View is active: the safe-area insets only, so the
 * board can use every visible pixel without sitting under a notch.
 */
export const FULL_VIEW_ROOT_PADDING: CSSProperties = {
  paddingTop: SAFE_TOP,
  paddingRight: SAFE_RIGHT,
  paddingBottom: SAFE_BOTTOM,
  paddingLeft: SAFE_LEFT,
};

/**
 * Full View content box: the same aspect-locked box the editor uses (16:10
 * landscape, 10:16 portrait — the world's own aspect), grown to the largest
 * size that fits the visible viewport and centred by the root flexbox. The
 * editor's 1360px/900px caps are dropped. It is deliberately never full-bleed:
 * DOM labels and the watermark are positioned relative to this box, so it
 * must keep the board's aspect. Pixi re-fits via its existing ResizeObserver.
 */
export function resolveFullViewContentStyle(params: {
  isPortrait: boolean;
  viewportHeightExpr: string;
  viewportWidthUnit: string;
}): CSSProperties {
  const availableHeight = `calc(${params.viewportHeightExpr} - ${SAFE_TOP} - ${SAFE_BOTTOM})`;
  const availableWidth = `calc(${params.viewportWidthUnit} - ${SAFE_LEFT} - ${SAFE_RIGHT})`;
  const widthPerHeight = params.isPortrait ? 0.625 : 1.6;
  return {
    width: `min(${availableWidth}, calc(${availableHeight} * ${widthPerHeight}))`,
    maxWidth: "none",
    maxHeight: availableHeight,
    aspectRatio: params.isPortrait ? "10 / 16" : "16 / 10",
    boxSizing: "border-box",
    position: "relative",
    zIndex: 1,
    display: "flex",
    alignItems: "stretch",
    margin: "0 auto",
  };
}

export type FullViewPhaseView = {
  /** "Start" or "Phase N/M". */
  label: string;
  canPrevious: boolean;
  canNext: boolean;
  /** Where ‹ goes: a 0-based phase index, "start" (via reset()), or null. */
  previousTarget: number | "start" | null;
  /** Where › goes: a 0-based phase index, or null. */
  nextTarget: number | null;
};

/**
 * Derives everything the Full View controller renders from the engine's
 * phase cursor and phase count. Holds no state of its own: the engine is the
 * single source of truth, this only clamps and formats.
 */
export function resolveFullViewPhaseView(cursor: number, phaseCount: number): FullViewPhaseView {
  const count = Number.isFinite(phaseCount) ? Math.max(0, Math.trunc(phaseCount)) : 0;
  const rawCursor = Number.isFinite(cursor) ? Math.trunc(cursor) : PHASE_CURSOR_START;
  const position = Math.max(PHASE_CURSOR_START, Math.min(count - 1, rawCursor));
  const isStart = position === PHASE_CURSOR_START;
  const previousTarget: number | "start" | null = isStart ? null : position === 0 ? "start" : position - 1;
  const nextTarget = position + 1 < count ? position + 1 : null;
  return {
    label: isStart ? "Start" : `Phase ${position + 1}/${count}`,
    canPrevious: previousTarget !== null,
    canNext: nextTarget !== null,
    previousTarget,
    nextTarget,
  };
}
