/**
 * pro-tagger-lineup-geometry.ts
 *
 * Plain data, zero React/DOM dependency, by design — this is the reusable
 * core the Event Stats visual lineup audit asked for: a future share-card
 * export (canvas-drawn, like statsShareCard.ts, not a React tree) can import
 * this same file and draw the identical pitch + formation layout by scaling
 * these normalised percentages to its own pixel canvas, without depending on
 * ProTaggerLineupFormation.tsx, React, or any DOM API. Squad semantics are
 * untouched here — this module only ever describes WHERE things are drawn,
 * never WHO's on the team (that's deriveLineupSlots, ProTaggerLineupFormation.tsx).
 *
 * Deliberately unrelated to ProTaggerPitchView.tsx / pitch-coordinates.ts:
 * this is a decorative team-sheet backdrop with its own small, fixed,
 * unscaled viewBox — not a to-scale pitch, not tied to real event nx/ny, not
 * affected by attackDirection/orientation. See the Event Stats visual
 * lineup audit for why the live-capture pitch's coordinate system is unsafe
 * to reuse for this.
 */

// Portrait aspect ratio for the decorative pitch backdrop — not to scale,
// just tall enough to read as a Gaelic football pitch in a team-sheet card.
export const LINEUP_PITCH_VIEWBOX = { w: 100, h: 140 } as const;

export type LineupPitchMarking =
  | { kind: "rect"; x: number; y: number; w: number; h: number }
  | { kind: "line"; x1: number; y1: number; x2: number; y2: number }
  | { kind: "circle"; cx: number; cy: number; r: number };

// Coordinates are percentages of LINEUP_PITCH_VIEWBOX (0-100 x, 0-140 y).
// Simplified GAA markings — outer boundary, halfway line, centre circle, and
// a small-rectangle-style box at each end — decorative only, not to scale.
export const LINEUP_PITCH_MARKINGS: readonly LineupPitchMarking[] = [
  { kind: "rect", x: 3, y: 3, w: 94, h: 134 },
  { kind: "line", x1: 3, y1: 70, x2: 97, y2: 70 },
  { kind: "circle", cx: 50, cy: 70, r: 9 },
  { kind: "rect", x: 34, y: 3, w: 32, h: 15 },
  { kind: "rect", x: 34, y: 122, w: 32, h: 15 },
];

/**
 * Fixed Gaelic football team-sheet layout — jersey number 1-15 mapped to a
 * position on the pitch, GK nearest the top. Positions are percentages of
 * LINEUP_PITCH_VIEWBOX's width/height, so any renderer (React/SVG today, a
 * canvas share-card later) can place a tile at `left/top: {x}%/{y}%` of
 * whatever box it's drawing into, independent of pixel size.
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
