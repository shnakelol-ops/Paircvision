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

/**
 * Above this viewport width, a portrait-shaped window is assumed to be a
 * resized desktop browser rather than a real phone/tablet, so the Tools
 * panel keeps its compact desktop-sidebar sizing instead of widening.
 */
export const MOBILE_PORTRAIT_TOOLS_MAX_WIDTH = 900;

export type MobilePortraitToolsInput = {
  isWhiteboardMode: boolean;
  isPortrait: boolean;
  viewportWidth: number;
};

/**
 * True whenever the Tools floating panel should use the widened, touch-sized
 * mobile-portrait layout instead of the desktop `clamp(112px, 13vw, 148px)`
 * sidebar. isPortrait here is the Slate's rotated portrait tactical mode
 * (see resolveSlateQuarterTurns) — i.e. a real phone held normally — not the
 * landscape-phone case, which has its own dedicated compact-landscape panel.
 */
export function shouldUseMobilePortraitToolsPanel(input: MobilePortraitToolsInput): boolean {
  return !input.isWhiteboardMode && input.isPortrait && input.viewportWidth <= MOBILE_PORTRAIT_TOOLS_MAX_WIDTH;
}
