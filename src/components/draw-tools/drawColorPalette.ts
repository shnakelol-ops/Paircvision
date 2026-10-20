/**
 * The single canonical pen-colour palette for the shared tactical drawing
 * engine (src/features/quickboard/drawing/). Originally a private constant
 * inside TacticalPadLiteClean.tsx (Standard Slate) — extracted here,
 * additive-only, so Game Timing's Draw integration (PR4) can reuse the exact
 * same five colours rather than defining a second, drifting copy. Standard
 * Slate now imports this instead of its own local literal; the values are
 * unchanged.
 */
export type DrawPenColorChoice = {
  label: string;
  value: number;
  css: string;
};

export const WHITEBOARD_PEN_COLOR_CHOICES: readonly DrawPenColorChoice[] = [
  { label: "Black", value: 0x111111, css: "#111111" },
  { label: "White", value: 0xffffff, css: "#ffffff" },
  { label: "Yellow", value: 0xfacc15, css: "#facc15" },
  { label: "Red", value: 0xdc2626, css: "#dc2626" },
  { label: "Blue", value: 0x2563eb, css: "#2563eb" },
];

/**
 * Tactical Slate's Draw palette: the shared five, values and order
 * unchanged (Black stays first and the default), plus Green. Slate only —
 * Tactical Sequence keeps the shared five.
 */
export const TACTICAL_SLATE_GREEN: DrawPenColorChoice = { label: "Green", value: 0x19b77a, css: "#19b77a" };

export const TACTICAL_SLATE_PEN_COLOR_CHOICES: readonly DrawPenColorChoice[] = [
  ...WHITEBOARD_PEN_COLOR_CHOICES,
  TACTICAL_SLATE_GREEN,
];
