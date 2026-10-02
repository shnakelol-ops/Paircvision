/**
 * Visual themes for the Tactical Slate pitch renderer
 * (createTacticalPitchVisualRoot in renderTacticalPitch.ts).
 *
 * Kept free of any pixi.js import so the layer decision for each theme is a
 * pure, directly unit-testable function — the renderer itself cannot be
 * constructed in the test environment (no canvas/WebGL).
 *
 *  - "default"    — the existing public Gaelic Pitch: turf + markings + goals.
 *  - "grass"      — Training Grass: the identical turf, with no pitch
 *                   markings and no goals/posts.
 *  - "whiteboard" — the existing whiteboard face (dark-ink markings on an
 *                   off-white board), unchanged from the dormant legacy mode.
 */
export type TacticalPitchTheme = "default" | "grass" | "whiteboard";

export type TacticalPitchThemeLayers = {
  /** Which face fill is painted under everything else. */
  face: "turf" | "whiteboard";
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
    case "grass":
      return { face: "turf", markings: false, goals: false, glass: true };
    case "default":
    default:
      return { face: "turf", markings: true, goals: true, glass: true };
  }
}
