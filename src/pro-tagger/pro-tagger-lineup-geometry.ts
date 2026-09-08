/**
 * pro-tagger-lineup-geometry.ts
 *
 * Plain data, zero React/DOM dependency, by design — a future share-card
 * export (canvas-drawn, like statsShareCard.ts, not a React tree) can import
 * this same file and place the identical formation layout on its own pixel
 * canvas, without depending on ProTaggerLineupFormation.tsx, React, or any
 * DOM API. Squad semantics are untouched here — this module only ever
 * describes WHERE the fixed 1-15 slots sit, never WHO's on the team (that's
 * deriveLineupSlots, ProTaggerLineupFormation.tsx).
 *
 * The pitch background itself (lines, boxes, arcs) is NOT defined here —
 * see ProTaggerLineupPitchBackground.tsx, which reproduces the real Event
 * Stats tagging pitch (getPitchConfig("gaelic"), pitch-config.ts) rather
 * than an independently invented decorative marking set. This file only
 * positions jerseys relative to that pitch's own portrait aspect ratio
 * (LINEUP_PITCH_PORTRAIT_VIEWBOX, exported from that component).
 */

/**
 * Fixed Gaelic football team-sheet layout — jersey number 1-15 mapped to a
 * position on the pitch, GK nearest the top. x/y are plain 0-100
 * percentages (of whatever box a renderer places them in — e.g. CSS
 * `left/top: {x}%/{y}%`), independent of the pitch background's own pixel
 * or viewBox dimensions.
 *
 * This is purely a decorative arrangement of the fixed slots 1-15 — it does
 * NOT decide who is a starter vs. a substitute (that's deriveLineupSlots,
 * ProTaggerLineupFormation.tsx) and carries no live-match semantics
 * (isActive/activeSlot, attackDirection) at all.
 */
export const LINEUP_FORMATION_POSITIONS: Readonly<Record<number, { x: number; y: number }>> = {
  1:  { x: 50, y: 9 },
  2:  { x: 20, y: 24 }, 3:  { x: 50, y: 24 }, 4:  { x: 80, y: 24 },
  5:  { x: 20, y: 40 }, 6:  { x: 50, y: 40 }, 7:  { x: 80, y: 40 },
  8:  { x: 35, y: 56 }, 9:  { x: 65, y: 56 },
  10: { x: 20, y: 72 }, 11: { x: 50, y: 72 }, 12: { x: 80, y: 72 },
  13: { x: 20, y: 89 }, 14: { x: 50, y: 89 }, 15: { x: 80, y: 89 },
};
