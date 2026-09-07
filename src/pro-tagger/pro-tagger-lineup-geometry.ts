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
  | { kind: "circle"; cx: number; cy: number; r: number }
  // A half-ellipse whose flat diameter is horizontal (y = cy, from x = cx-rx
  // to cx+rx) and which bulges toward the goal line ("up", smaller y — used
  // at the top end) or away from it ("down", larger y — bottom end). This
  // structured form (not a literal SVG path string) is what keeps the D-arc
  // renderer-agnostic: an SVG consumer derives a `path` d attribute from it
  // (see ProTaggerLineupPitchBackground.tsx), and a future canvas consumer
  // could equally derive a ctx.ellipse() start/end angle pair from the same
  // four numbers, with no SVG-specific syntax baked into the geometry itself.
  | { kind: "halfEllipse"; cx: number; cy: number; rx: number; ry: number; bulge: "up" | "down" };

// Coordinates are percentages of LINEUP_PITCH_VIEWBOX (0-100 x, 0-140 y).
//
// Reproduces (independently — no import) the real-world proportions PáircVision
// already uses for its one canonical Gaelic pitch, buildGaelicFootballLandscapeMarkings()
// in src/core/pitch/pitch-config.ts (145m x 90m pitch; 13m and 45m lines; a
// 19m x 13m "large rectangle"; a 14m x 4.5m "small rectangle"/goal area; a
// 13m-radius D centred on the 20m line; a short centre-line tick + centre
// spot, matching that source's own choice of a short tick rather than a
// full-width halfway stripe) — scaled onto this file's own small, fixed,
// decorative viewBox. Deliberately omits the 20m/65m lines, the 40m
// two-point arc, and the penalty spots present in that source: this is a
// team-sheet backdrop with jerseys drawn on top of it, not a tactical
// board, and those marks add clutter without adding recognisability at
// this scale.
const PITCH_LEFT = 3, PITCH_TOP = 3, PITCH_RIGHT = 97, PITCH_BOTTOM = 137;
const CENTER_X = 50, CENTER_Y = 70;

export const LINEUP_PITCH_MARKINGS: readonly LineupPitchMarking[] = [
  // Outer boundary (touchlines + end lines).
  { kind: "rect", x: PITCH_LEFT, y: PITCH_TOP, w: PITCH_RIGHT - PITCH_LEFT, h: PITCH_BOTTOM - PITCH_TOP },
  // 13m lines.
  { kind: "line", x1: PITCH_LEFT, y1: 15.0, x2: PITCH_RIGHT, y2: 15.0 },
  { kind: "line", x1: PITCH_LEFT, y1: 125.0, x2: PITCH_RIGHT, y2: 125.0 },
  // 45m lines.
  { kind: "line", x1: PITCH_LEFT, y1: 44.6, x2: PITCH_RIGHT, y2: 44.6 },
  { kind: "line", x1: PITCH_LEFT, y1: 95.4, x2: PITCH_RIGHT, y2: 95.4 },
  // Halfway indicator: a short centre tick, not a full-width stripe —
  // matching the source's own choice, not a soccer-style halfway line.
  { kind: "line", x1: CENTER_X - 4.2, y1: CENTER_Y, x2: CENTER_X + 4.2, y2: CENTER_Y },
  { kind: "circle", cx: CENTER_X, cy: CENTER_Y, r: 1.3 },
  // Large rectangle ("13m box"), both ends.
  { kind: "rect", x: CENTER_X - 9.9, y: PITCH_TOP, w: 19.8, h: 12.0 },
  { kind: "rect", x: CENTER_X - 9.9, y: PITCH_BOTTOM - 12.0, w: 19.8, h: 12.0 },
  // Small rectangle (goal area), both ends.
  { kind: "rect", x: CENTER_X - 7.3, y: PITCH_TOP, w: 14.6, h: 4.2 },
  { kind: "rect", x: CENTER_X - 7.3, y: PITCH_BOTTOM - 4.2, w: 14.6, h: 4.2 },
  // D-arc (13m radius, centred on the 20m line), both ends.
  { kind: "halfEllipse", cx: CENTER_X, cy: 21.5, rx: 13.6, ry: 12.0, bulge: "up" },
  { kind: "halfEllipse", cx: CENTER_X, cy: 118.5, rx: 13.6, ry: 12.0, bulge: "down" },
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
