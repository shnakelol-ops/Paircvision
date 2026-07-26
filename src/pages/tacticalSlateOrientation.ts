// Pure orientation-selection logic for Tactical Slate, extracted so it can be
// unit-tested without rendering the (very large) surface component.

/**
 * Portrait (end-line) view uses ONE clockwise quarter-turn. This places the
 * landscape left-hand goal at the top and the right-hand goal at the bottom,
 * with the pitch running vertically. This is the single source of truth for the
 * direction.
 */
export const SLATE_PORTRAIT_QUARTER_TURNS = 1 as const;

export type SlateOrientationInput = {
  isStatsMode: boolean;
  isWhiteboardMode: boolean;
  isPortraitOrientation: boolean;
};

/**
 * The quarter-turn count Tactical Slate feeds to the surface mapper. Portrait
 * tactical mode selects 1; landscape, stats and whiteboard select 0.
 */
export function resolveSlateQuarterTurns(input: SlateOrientationInput): 0 | 1 {
  return !input.isStatsMode && !input.isWhiteboardMode && input.isPortraitOrientation
    ? SLATE_PORTRAIT_QUARTER_TURNS
    : 0;
}
