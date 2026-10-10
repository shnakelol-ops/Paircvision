/**
 * Visual themes for the Tactical Slate pitch renderer
 * (createTacticalPitchVisualRoot in renderTacticalPitch.ts).
 *
 * Kept free of any pixi.js import so the layer decision for each theme is a
 * pure, directly unit-testable function — the renderer itself cannot be
 * constructed in the test environment (no canvas/WebGL).
 *
 *  - "default"    — the original turf (gradient, glow, vignette) + markings +
 *                   goals: Tactical Board, and the internal Rugby Slate.
 *  - "gaelicBands" — Gaelic Pitch (the default surface): the Training Grass
 *                   mown bands with the full Gaelic markings, goals and glass.
 *                   Its goals are the GAA Goal item artwork (gaelicPitchGoals.ts)
 *                   rather than the minimal line overlay.
 *  - "grass"      — Training Grass: a flat, stylised mown surface of broad
 *                   alternating bands (TRAINING_GRASS_BANDS), with no pitch
 *                   markings and no goals/posts.
 *  - "whiteboard" — the existing whiteboard face (dark-ink markings on an
 *                   off-white board), unchanged from the dormant legacy mode.
 *  - "tacticalBoard" — Tactical Board surface only (research trial): exactly
 *                   the "default" layers, with the turf wash re-based onto
 *                   TACTICAL_BOARD_TURF_BASE (Traditional GAA Green). "default" itself is untouched.
 */
export type TacticalPitchTheme = "default" | "gaelicBands" | "grass" | "whiteboard" | "tacticalBoard";

export type TacticalPitchThemeLayers = {
  /** Which face fill is painted under everything else. */
  face: "turf" | "whiteboard" | "trainingBands";
  /** Pitch line markings (and their clarity pass) from pitchConfig. */
  markings: boolean;
  /**
   * Tactics-only goal/post overlay: false for none, "lines" for the minimal
   * line overlay (gaa-goal-markings / rugby posts), "artwork" for the GAA Goal
   * item artwork (Gaelic Pitch only).
   */
  goals: false | "lines" | "artwork";
  /** Turf glass sheen — only meaningful over the turf face. */
  glass: boolean;
};

export function resolveTacticalPitchThemeLayers(theme: TacticalPitchTheme = "default"): TacticalPitchThemeLayers {
  switch (theme) {
    case "whiteboard":
      return { face: "whiteboard", markings: true, goals: "lines", glass: false };
    case "gaelicBands":
      return { face: "trainingBands", markings: true, goals: "artwork", glass: true };
    case "grass":
      return { face: "trainingBands", markings: false, goals: false, glass: true };
    case "tacticalBoard":
    case "default":
    default:
      return { face: "turf", markings: true, goals: "lines", glass: true };
  }
}

/**
 * Training Grass mown bands: flat colour, no grain, glow or vignette. Bands
 * run across the pitch length (vertical in landscape, horizontal once the
 * board is rotated for portrait), alternating light/dark from the left.
 */
export const TRAINING_GRASS_BANDS = {
  count: 10,
  light: 0x6e894e,
  dark: 0x637e46,
} as const;

export type TrainingGrassBand = { x: number; width: number; color: number };

/** The bands covering a face of the given width, left to right. */
export function trainingGrassBands(faceWidth: number): TrainingGrassBand[] {
  const { count, light, dark } = TRAINING_GRASS_BANDS;
  const width = faceWidth / count;
  return Array.from({ length: count }, (_, index) => ({
    x: index * width,
    width,
    color: index % 2 === 0 ? light : dark,
  }));
}

/**
 * Tactical Board turf base colour — Traditional GAA Green research trial,
 * after the classic green magnetic tactics board. Replaces the Colour C
 * (#589d6d) trial.
 */
export const TACTICAL_BOARD_TURF_BASE = "#235431";

/**
 * How much of the recipe wash's edge-to-centre shading the Tactical Board
 * keeps (see rebaseTurfWash). The full recipe shading takes a base this dark
 * almost to black at the edges, so the board keeps a softer share of it and
 * stays close to TACTICAL_BOARD_TURF_BASE across the whole face.
 */
export const TACTICAL_BOARD_TURF_SHADING = 0.3;

/**
 * Turf base colour override for a theme, or null to keep the renderer's own
 * turf wash. Only the Tactical Board theme has one.
 */
export function resolveTacticalPitchTurfBase(theme: TacticalPitchTheme = "default"): string | null {
  return theme === "tacticalBoard" ? TACTICAL_BOARD_TURF_BASE : null;
}

export type TurfWashStop = { t: number; c: string };

function parseHex(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function luminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function toHex(channels: number[]): string {
  return `#${channels.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Re-bases a turf wash gradient onto a new colour while keeping its shading:
 * each stop becomes `base` scaled by that stop's brightness relative to the
 * brightest stop, so the brightest stop is exactly `base` and the darker
 * edge stops keep their original proportions. `shading` (0–1) scales how
 * much of that darkening is kept: 1 is the full original shading, 0 a flat
 * `base`.
 */
export function rebaseTurfWash(wash: readonly TurfWashStop[], base: string, shading = 1): TurfWashStop[] {
  const baseRgb = parseHex(base);
  const peak = Math.max(...wash.map((stop) => luminance(parseHex(stop.c))));
  return wash.map((stop) => {
    const k = peak > 0 ? luminance(parseHex(stop.c)) / peak : 1;
    const scale = 1 - shading * (1 - k);
    return { t: stop.t, c: toHex(baseRgb.map((v) => v * scale)) };
  });
}

/**
 * The turf wash a theme paints: the recipe wash itself (same reference) for
 * every theme without a turf override, or the Tactical Board re-base.
 */
export function resolveTacticalPitchTurfWash(
  theme: TacticalPitchTheme,
  wash: readonly TurfWashStop[],
): readonly TurfWashStop[] {
  const base = resolveTacticalPitchTurfBase(theme);
  return base ? rebaseTurfWash(wash, base, TACTICAL_BOARD_TURF_SHADING) : wash;
}
