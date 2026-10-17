// EXPERIMENTAL — Goal View grass surround, Tactical Sequence investigation
// (internal prototype only, /internal/goal-view).
//
// Sequence's turf is a diagonal gradient wash + multiply stripes + vignette +
// centre lift + sheen (movement-board/pitch/create-pitch-root.ts), so its edge
// colour changes all the way round the boundary. Instead of modelling every
// layer, a throwaway copy of the SAME pitch renderer is drawn once into a small
// offscreen texture and the colour just inside each boundary is read back.
// The board's own pitch is never touched. Runs once per surround build, never
// per frame.

import { Matrix, RenderTexture, TilingSprite, type Application, type Container } from "pixi.js";

import { createPitchRoot } from "../../movement-board/pitch/create-pitch-root";
import type { PitchSport } from "../../movement-board/pitch/pitch-config";
import { GOAL_VIEW_BOARD_LENGTH, GOAL_VIEW_BOARD_WIDTH } from "./goalViewCamera";
import type { SurroundEdgeSamples, SurroundStripes } from "./goalViewSurround";

/**
 * Sequence's GAA stripe overlay, continued past the endlines. Derived from
 * create-pitch-root.ts: a 56 px stripe tile at tileScale.x 2.05 (period 114.8
 * units, anchored at x = 0); bands every 8.5 px drawn 52% wide, white on even
 * bands and rgba(0,0,0,0.17) on odd ones; sprite alpha 0.31, multiply blend.
 * Under Pixi's multiply (DST_COLOR, ONE_MINUS_SRC_ALPHA) a white texel is a
 * no-op and a black one multiplies by (1 − 0.17 · 0.31), so only the dark
 * bands show.
 */
export const SEQUENCE_GAA_STRIPES: SurroundStripes = (() => {
  const scale = 2.05;
  const band = 8.5;
  const stripes: Array<readonly [number, number]> = [];
  for (let x = band; x < 56; x += band * 2) stripes.push([x * scale, (x + band * 0.52) * scale] as const);
  return { period: 56 * scale, stripes, alpha: 0.17 * 0.31 };
})();

/** How far inside the boundary to sample: clear of the 2-unit inset lines and goal art. */
const SAMPLE_INSET_UNITS = 0.5;

const median = (values: number[]) => {
  const sorted = [...values].sort((p, q) => p - q);
  return sorted[Math.floor(sorted.length / 2)];
};

/** Hides the turf's multiply stripe layer in the throwaway copy (the surround redraws stripes with their exact phase). */
function hideStripeLayers(node: Container) {
  for (const child of node.children) {
    if (child instanceof TilingSprite && child.blendMode === "multiply") child.visible = false;
    else hideStripeLayers(child);
  }
}

/** Box average over ±radius samples, per channel. */
function smooth(colors: number[], radius: number): number[] {
  return colors.map((_, i) => {
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let j = Math.max(0, i - radius); j <= Math.min(colors.length - 1, i + radius); j += 1) {
      r += (colors[j] >> 16) & 0xff;
      g += (colors[j] >> 8) & 0xff;
      b += colors[j] & 0xff;
      n += 1;
    }
    return (Math.round(r / n) << 16) | (Math.round(g / n) << 8) | Math.round(b / n);
  });
}

/**
 * Reads the colour just inside each boundary of the board's pitch renderer,
 * with its stripe layer hidden. A 9-sample median removes the turf's 1 px
 * grain flecks and thin line art; a ±3 unit box average then removes the
 * remaining grain so the outward strips do not streak. The low-frequency
 * gradient, vignette and tonal patches are kept.
 */
export function samplePitchEdges(app: Application, sport: PitchSport = "gaelic", perUnit = 4): SurroundEdgeSamples {
  const width = GOAL_VIEW_BOARD_LENGTH * perUnit;
  const height = GOAL_VIEW_BOARD_WIDTH * perUnit;
  const mount = createPitchRoot(sport);
  hideStripeLayers(mount.root);
  const target = RenderTexture.create({ width, height, resolution: 1, antialias: false });
  try {
    app.renderer.render({ container: mount.root, target, clear: true, transform: new Matrix(perUnit, 0, 0, perUnit, 0, 0) });
    const { pixels } = app.renderer.extract.pixels({ target });
    const at = (x: number, y: number) => {
      const i = (Math.max(0, Math.min(height - 1, y)) * width + Math.max(0, Math.min(width - 1, x))) * 4;
      return [pixels[i], pixels[i + 1], pixels[i + 2]] as const;
    };
    const inset = Math.round(SAMPLE_INSET_UNITS * perUnit);
    const line = (count: number, pick: (i: number) => readonly [number, number]) => {
      const raw = Array.from({ length: count }, (_, i) => at(...pick(i)));
      const medianed = raw.map((_, i) => {
        const win = raw.slice(Math.max(0, i - 4), Math.min(count, i + 5));
        return (median(win.map((c) => c[0])) << 16) | (median(win.map((c) => c[1])) << 8) | median(win.map((c) => c[2]));
      });
      return smooth(medianed, 3 * perUnit);
    };
    return {
      perUnit,
      top: line(width, (i) => [i, inset]),
      bottom: line(width, (i) => [i, height - 1 - inset]),
      left: line(height, (i) => [inset, i]),
      right: line(height, (i) => [width - 1 - inset, i]),
    };
  } finally {
    target.destroy(true);
    mount.dispose();
  }
}
