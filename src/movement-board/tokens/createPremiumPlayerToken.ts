import { Container, Graphics, Text } from "pixi.js";

export type PremiumPlayerTokenColor = "blue" | "red" | "yellow" | "black" | "green" | "orange" | "purple" | "white";

export const PREMIUM_TOKEN_IDLE_SCALE = 1;
export const PREMIUM_TOKEN_DRAG_SCALE = 1.08;
export const PREMIUM_TOKEN_IDLE_SHADOW_ALPHA = 0.24;
export const PREMIUM_TOKEN_DRAG_SHADOW_ALPHA = 0.36;

const PALETTE_BY_COLOR: Record<
  PremiumPlayerTokenColor,
  { shirt: number; shirtShade: number; shorts: number; skin: number; hair: number }
> = {
  blue: {
    shirt: 0x2563eb,
    shirtShade: 0x1e40af,
    shorts: 0x1e3a8a,
    skin: 0xf1c27d,
    hair: 0x0f172a,
  },
  red: {
    shirt: 0xdc2626,
    shirtShade: 0x991b1b,
    shorts: 0x7f1d1d,
    skin: 0xf1c27d,
    hair: 0x111827,
  },
  yellow: {
    shirt: 0xf2c94c,
    shirtShade: 0xd4a021,
    shorts: 0x7c5b17,
    skin: 0xe9b978,
    hair: 0x1f2937,
  },
  black: {
    shirt: 0x111827,
    shirtShade: 0x020617,
    shorts: 0x000000,
    skin: 0xe7b784,
    hair: 0x000000,
  },
  green: {
    shirt: 0x16a34a,
    shirtShade: 0x14532d,
    shorts: 0x052e16,
    skin: 0xf1c27d,
    hair: 0x0f172a,
  },
  orange: {
    shirt: 0xea580c,
    shirtShade: 0x7c2d12,
    shorts: 0x431407,
    skin: 0xf1c27d,
    hair: 0x1c1917,
  },
  purple: {
    shirt: 0x7c3aed,
    shirtShade: 0x4c1d95,
    shorts: 0x2e1065,
    skin: 0xf1c27d,
    hair: 0x0f172a,
  },
  white: {
    shirt: 0xf1f5f9,
    shirtShade: 0x94a3b8,
    shorts: 0x475569,
    skin: 0xf1c27d,
    hair: 0x1e293b,
  },
};

/**
 * Jersey Athlete Token anatomy (all coords relative to container origin ≈ waist centre):
 *
 *        ╭──╮          head   (y ≈ -0.38r)
 *       ▓▓▓▓▓▓▓        hair cap
 *      ╔═══════╗        shoulders  (y ≈ -0.06r, w ≈ 0.76r)
 *     ╔╣  [7] ╠╗        long sleeves (jersey colour)
 *      ║       ║        jersey tapers to waist (y ≈ +0.30r, w ≈ 0.48r)
 *      ╚═══════╝
 *        ████           shorts   (y ≈ +0.30–0.50r)
 *     ˜˜˜˜˜˜˜˜˜˜˜       ground shadow ellipse
 *
 * Structure:
 *   token (Container)  — outer, never rotated; holds shadow, body, ballMarker
 *   body  (Container)  — rotates toward movement heading
 *     g   (Graphics)   — all athlete shapes drawn here (shorts→jersey→sleeves→head→hair)
 *     numberLabel (Text) — chest-centred jersey number
 *   shadow (Graphics)  — flat oval on ground, scale.x stretches on move
 *   ballMarker (Graphics) — possession dot at feet, hidden by default
 */
export function createPremiumPlayerToken({
  color,
  number,
  label,
  radius,
}: {
  color: PremiumPlayerTokenColor;
  number: number;
  label?: string;
  radius: number;
}): { token: Container; body: Container; shadow: Graphics; ballMarker: Graphics } {
  const palette = PALETTE_BY_COLOR[color];

  // ── Outer container ──────────────────────────────────────────────────────
  const token = new Container();
  token.eventMode = "static";
  token.cursor = "grab";

  // Ground shadow — never rotates, stretches on move via scale.x in token-layer
  const shadow = new Graphics();
  shadow
    .ellipse(0, radius * 0.94, radius * 1.08, radius * 0.27)
    .fill({ color: 0x020617, alpha: PREMIUM_TOKEN_IDLE_SHADOW_ALPHA });
  token.addChild(shadow);

  // ── Body container — rotates toward movement heading ─────────────────────
  const body = new Container();
  token.addChild(body);

  // All athlete shapes on a single Graphics child so we can draw them in order
  const g = new Graphics();
  body.addChild(g);

  // Shorts — drawn first so jersey overlaps at waistband
  g.roundRect(-radius * 0.23, radius * 0.28, radius * 0.46, radius * 0.22, radius * 0.07)
    .fill({ color: palette.shorts });

  // Jersey body — tapered trapezoid (wider at shoulder, narrower at waist)
  g.poly([
    -radius * 0.38, -radius * 0.06,
     radius * 0.38, -radius * 0.06,
     radius * 0.24,  radius * 0.30,
    -radius * 0.24,  radius * 0.30,
  ]).fill({ color: palette.shirt });

  // Subtle chest highlight — lighter V overlay for depth
  g.poly([
    -radius * 0.20, -radius * 0.06,
     radius * 0.20, -radius * 0.06,
     radius * 0.08,  radius * 0.16,
    -radius * 0.08,  radius * 0.16,
  ]).fill({ color: 0xffffff, alpha: 0.12 });

  // Long sleeves — jersey colour (not skin)
  g.roundRect(-radius * 0.52, radius * 0.01, radius * 0.15, radius * 0.27, radius * 0.06)
    .fill({ color: palette.shirt });
  g.roundRect( radius * 0.37, radius * 0.01, radius * 0.15, radius * 0.27, radius * 0.06)
    .fill({ color: palette.shirt });

  // Sleeve shade — lower half darker for depth
  g.roundRect(-radius * 0.52, radius * 0.15, radius * 0.15, radius * 0.13, radius * 0.06)
    .fill({ color: palette.shirtShade, alpha: 0.45 });
  g.roundRect( radius * 0.37, radius * 0.15, radius * 0.15, radius * 0.13, radius * 0.06)
    .fill({ color: palette.shirtShade, alpha: 0.45 });

  // Head
  g.circle(0, -radius * 0.38, radius * 0.19)
    .fill({ color: palette.skin });

  // Hair cap — overlays top of head
  g.ellipse(0, -radius * 0.47, radius * 0.19, radius * 0.10)
    .fill({ color: palette.hair, alpha: 0.96 });

  // ── Jersey number — CHEST position (not feet) ────────────────────────────
  const textResolution =
    typeof window !== "undefined" ? Math.max(2, Math.min(3, window.devicePixelRatio || 1)) : 2;
  const safeLabel = (label?.trim().slice(0, 3) ?? "") || String(number);
  const isNumeric = /^\d+$/.test(safeLabel);
  const fontSize = isNumeric
    ? safeLabel.length >= 2 ? radius * 0.74 : radius * 0.84
    : radius * 0.62;

  const numberLabel = new Text({
    text: safeLabel,
    style: {
      fill: 0xffffff,
      fontSize,
      fontWeight: "900",
      align: "center",
      fontFamily: '"Barlow Condensed", "Inter Tight", Inter, system-ui, sans-serif',
      letterSpacing: isNumeric && safeLabel.length >= 2 ? 0 : 0.1,
      stroke: { color: 0x000000, width: 1.4, join: "round" },
    },
  });
  numberLabel.anchor.set(0.5);
  numberLabel.position.set(0, radius * 0.05);
  numberLabel.resolution = textResolution;
  numberLabel.roundPixels = true;
  body.addChild(numberLabel);

  // ── Ball marker — outer container, never rotates ─────────────────────────
  const ballMarker = new Graphics();
  ballMarker
    .circle(0, radius * 0.82, radius * 0.105)
    .fill({ color: 0xffffff })
    .circle(0, radius * 0.82, radius * 0.105)
    .stroke({ color: 0xfbbf24, width: 1.2, alpha: 1 });
  ballMarker.visible = false;
  token.addChild(ballMarker);

  return { token, body, shadow, ballMarker };
}
