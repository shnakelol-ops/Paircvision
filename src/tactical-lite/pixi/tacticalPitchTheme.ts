import type { PitchMarking } from "../../core/pitch/pitch-config";

/**
 * Visual themes for the Tactical Slate pitch renderer
 * (createTacticalPitchVisualRoot in renderTacticalPitch.ts).
 *
 * Kept free of any pixi.js import so the layer decision for each theme is a
 * pure, directly unit-testable function — the renderer itself cannot be
 * constructed in the test environment (no canvas/WebGL).
 *
 *  - "default"    — the existing public Gaelic Pitch: turf + markings + goals.
 *  - "grass"      — Training Grass: a flat, stylised mown surface of broad
 *                   alternating bands (TRAINING_GRASS_BANDS), with no pitch
 *                   markings and no goals/posts.
 *  - "gaelicBands" — Gaelic Pitch B: the Training Grass band colours, with
 *                   each band edge on a major transverse pitch line, plus
 *                   the full Gaelic markings, goals and glass.
 *  - "whiteboard" — the existing whiteboard face (dark-ink markings on an
 *                   off-white board), unchanged from the dormant legacy mode.
 */
export type TacticalPitchTheme = "default" | "gaelicBands" | "grass" | "whiteboard";

export type TacticalPitchThemeLayers = {
  /** Which face fill is painted under everything else. */
  face: "turf" | "whiteboard" | "trainingBands" | "markingBands";
  /** Pitch line markings (and their clarity pass) from pitchConfig. */
  markings: boolean;
  /** Tactics-only goal/post overlay. */
  goals: boolean;
  /** Turf glass sheen — only meaningful over the turf face. */
  glass: boolean;
};

export function resolveTacticalPitchThemeLayers(theme: TacticalPitchTheme = "default"): TacticalPitchThemeLayers {
  switch (theme) {
    case "whiteboard":
      return { face: "whiteboard", markings: true, goals: true, glass: false };
    case "gaelicBands":
      return { face: "markingBands", markings: true, goals: true, glass: true };
    case "grass":
      return { face: "trainingBands", markings: false, goals: false, glass: true };
    case "default":
    default:
      return { face: "turf", markings: true, goals: true, glass: true };
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
 * Gaelic Pitch B bands: the Training Grass colours, but with every band edge
 * on a major transverse pitch line — each straight line that crosses the full
 * pitch width (13 m, 20 m, 45 m and 65 m lines on both sides). The two end
 * bands run out to the face edges. Alternates light/dark from the left.
 */
export function markingAlignedGrassBands(
  faceWidth: number,
  markings: readonly PitchMarking[],
  pitchHeight: number,
): TrainingGrassBand[] {
  const { light, dark } = TRAINING_GRASS_BANDS;
  const edges = new Set<number>();
  for (const marking of markings) {
    if (marking.kind !== "line" || marking.x1 !== marking.x2) continue;
    if (Math.abs(marking.y2 - marking.y1) < pitchHeight - 1e-6) continue;
    if (marking.x1 > 0 && marking.x1 < faceWidth) edges.add(marking.x1);
  }
  const bounds = [0, ...[...edges].sort((a, b) => a - b), faceWidth];
  return bounds.slice(0, -1).map((x, index) => ({
    x,
    width: bounds[index + 1]! - x,
    color: index % 2 === 0 ? light : dark,
  }));
}
