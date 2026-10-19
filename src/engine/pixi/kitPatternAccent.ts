import { Graphics } from "pixi.js";

import type { VisionV3KitPattern } from "./createVisionV3PlayerToken";

/**
 * Kit pattern bands shared by the Tactical Slate's Pixi, Phosphor and Name
 * Badge tokens, so every selectable style shows the same kit as Vision V3.
 *
 * The geometry is a copy of Vision V3's own drawPatternAccent
 * (createVisionV3PlayerToken.ts), which stays the reference and is left
 * untouched; kitPatternAccent.test.ts locks the two together instruction by
 * instruction. Shapes are drawn about the origin and are meant to be clipped
 * by the caller to its own face circle, exactly as Vision V3 masks its disc.
 */

/**
 * Vision V3 draws its bands at innerRadius * 0.9 and clips them to its core
 * face (discRadius - rimWidth). Away from the stroke floors that is
 * 0.72 * discRadius over 0.955 * discRadius; at the Slate's real token radius
 * (floors binding) it is 0.7547. Callers pass faceRadius * this ratio so the
 * bands sit at the same place relative to their own visible face.
 */
export const KIT_PATTERN_RADIUS_TO_FACE = 0.72 / 0.955;

/** Vision V3's Gradient kit: the face lightened 12% toward white. */
export const KIT_GRADIENT_FACE_LIGHTEN = 0.12;

/** True for the patterns that draw bands (everything but Plain and Gradient). */
export function kitPatternHasBands(pattern: VisionV3KitPattern | undefined): boolean {
  return pattern === "hoops" || pattern === "stripes" || pattern === "slash" || pattern === "chestDash";
}

/**
 * Coach-authored pattern colours draw exactly as picked at full opacity; the
 * no-colour fallback is softened, matching Vision V3's treatment.
 */
export function resolveKitPatternPaint(
  accentColor: number,
  hasAuthoredPatternColor: boolean,
  mixColor: (base: number, target: number, amount: number) => number,
): { color: number; alpha: number } {
  return hasAuthoredPatternColor
    ? { color: accentColor, alpha: 1 }
    : { color: mixColor(accentColor, 0xffffff, 0.1), alpha: 0.72 };
}

export function drawKitPatternAccent(
  target: Graphics,
  pattern: VisionV3KitPattern,
  accentColor: number,
  patternRadius: number,
  alpha: number,
): void {
  if (pattern === "plain" || pattern === "gradient") return;

  if (pattern === "hoops") {
    const bandH = patternRadius * 0.28;
    const positions = [-patternRadius * 0.58, -patternRadius * 0.02, patternRadius * 0.54];
    for (const y of positions) {
      target.rect(-patternRadius, y, patternRadius * 2, bandH).fill({ color: accentColor, alpha });
    }
    return;
  }

  if (pattern === "stripes") {
    const stripeW = patternRadius * 0.28;
    const positions = [-patternRadius * 0.58, -patternRadius * 0.14, patternRadius * 0.3];
    for (const x of positions) {
      target.rect(x, -patternRadius, stripeW, patternRadius * 2).fill({ color: accentColor, alpha });
    }
    return;
  }

  if (pattern === "slash") {
    const sashW = patternRadius * 0.82;
    const len = patternRadius * 2.2;
    const angle = -38 * (Math.PI / 180);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const half = sashW / 2;
    const corners: [number, number][] = [
      [-len / 2, -half],
      [len / 2, -half],
      [len / 2, half],
      [-len / 2, half],
    ];
    const rotated = corners.flatMap(([x, y]) => [x * cos - y * sin, x * sin + y * cos]);
    target.poly(rotated).fill({ color: accentColor, alpha });
    return;
  }

  if (pattern === "chestDash") {
    const bandH = patternRadius * 0.62;
    target.rect(-patternRadius, -bandH / 2, patternRadius * 2, bandH).fill({ color: accentColor, alpha });
  }
}

/**
 * The kit bands for a face of radius `faceRadius` centred on the origin, as
 * their own Graphics clipped to that face circle (the same masking Vision V3
 * uses for its disc). Null for Plain and Gradient, which draw no bands. The
 * caller adds it between its face fill and its rim/outline strokes, so each
 * style keeps its own rings on top.
 */
export function createKitPatternLayer(
  pattern: VisionV3KitPattern | undefined,
  color: number,
  alpha: number,
  faceRadius: number,
): Graphics | null {
  if (!pattern || !kitPatternHasBands(pattern)) return null;
  const layer = new Graphics();
  drawKitPatternAccent(layer, pattern, color, faceRadius * KIT_PATTERN_RADIUS_TO_FACE, alpha);
  const mask = new Graphics();
  mask.circle(0, 0, faceRadius).fill({ color: 0xffffff });
  layer.mask = mask;
  layer.addChild(mask);
  return layer;
}
