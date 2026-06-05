import { Container, Graphics, Text } from "pixi.js";

import {
  PREMIUM_TOKEN_DRAG_SHADOW_ALPHA,
  PREMIUM_TOKEN_IDLE_SHADOW_ALPHA,
  type PremiumPlayerTokenColor,
} from "./createPremiumPlayerToken";

/**
 * Simple jersey token — readability prototype.
 *
 * Anatomy:
 *
 *   ╭─────────╮     ← rounded-rect badge, team colour fill
 *   │         │
 *   │   [7]   │     ← large white number, heavy stroke
 *   │         │
 *   ╰─────────╯
 *  ˜˜˜˜˜˜˜˜˜˜˜˜˜   ← soft ground shadow
 *
 * No head. No legs. No sleeves. No realism.
 * The number IS the token. Team colour IS the identity.
 *
 * Same return shape as createPremiumPlayerToken so token-layer.ts is unchanged.
 * body Container rotates toward movement heading — number rotates with it.
 */

const BADGE_W_FACTOR = 1.40;
const BADGE_H_FACTOR = 1.50;
const BADGE_CORNER_FACTOR = 0.24;

const SHIRT_BY_COLOR: Record<PremiumPlayerTokenColor, number> = {
  blue: 0x2563eb,
  red: 0xdc2626,
  yellow: 0xf2c94c,
  black: 0x111827,
  green: 0x16a34a,
  orange: 0xea580c,
  purple: 0x7c3aed,
  white: 0xf1f5f9,
};

// Slightly darker shade for the bottom half of the badge
const SHADE_BY_COLOR: Record<PremiumPlayerTokenColor, number> = {
  blue: 0x1e40af,
  red: 0x991b1b,
  yellow: 0xd4a021,
  black: 0x020617,
  green: 0x14532d,
  orange: 0x7c2d12,
  purple: 0x4c1d95,
  white: 0x94a3b8,
};

export function createSimpleJerseyToken({
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
  const shirt = SHIRT_BY_COLOR[color];
  const shade = SHADE_BY_COLOR[color];

  const W = radius * BADGE_W_FACTOR;
  const H = radius * BADGE_H_FACTOR;
  const corner = radius * BADGE_CORNER_FACTOR;
  const halfW = W / 2;
  const halfH = H / 2;

  // ── Outer container ──────────────────────────────────────────────────────
  const token = new Container();
  token.eventMode = "static";
  token.cursor = "grab";

  // Ground shadow — never rotates
  const shadow = new Graphics();
  shadow
    .ellipse(0, halfH + radius * 0.12, W * 0.76, radius * 0.26)
    .fill({ color: 0x020617, alpha: PREMIUM_TOKEN_IDLE_SHADOW_ALPHA });
  token.addChild(shadow);

  // ── Body container — rotates toward movement heading ─────────────────────
  const body = new Container();
  token.addChild(body);

  const g = new Graphics();
  body.addChild(g);

  // Badge fill — team colour
  g.roundRect(-halfW, -halfH, W, H, corner)
    .fill({ color: shirt });

  // Bottom-half shade — subtle depth
  g.roundRect(-halfW, 0, W, halfH, corner)
    .fill({ color: shade, alpha: 0.30 });

  // Top highlight — lighter strip
  g.roundRect(-halfW, -halfH, W, H * 0.28, corner)
    .fill({ color: 0xffffff, alpha: 0.10 });

  // ── Number — large, centered in badge ───────────────────────────────────
  const textResolution =
    typeof window !== "undefined" ? Math.max(2, Math.min(3, window.devicePixelRatio || 1)) : 2;
  const safeLabel = (label?.trim().slice(0, 3) ?? "") || String(number);
  const isNumeric = /^\d+$/.test(safeLabel);
  const fontSize = isNumeric
    ? safeLabel.length >= 2 ? radius * 0.90 : radius * 1.08
    : radius * 0.72;

  const numberLabel = new Text({
    text: safeLabel,
    style: {
      fill: 0xffffff,
      fontSize,
      fontWeight: "900",
      align: "center",
      fontFamily: '"Barlow Condensed", "Inter Tight", Inter, system-ui, sans-serif',
      letterSpacing: isNumeric && safeLabel.length >= 2 ? 0 : 0.1,
      stroke: { color: 0x000000, width: 1.8, join: "round" },
    },
  });
  numberLabel.anchor.set(0.5);
  numberLabel.position.set(0, 0);
  numberLabel.resolution = textResolution;
  numberLabel.roundPixels = true;
  body.addChild(numberLabel);

  // ── Ball marker — outer container, never rotates ─────────────────────────
  const ballMarker = new Graphics();
  ballMarker
    .circle(0, halfH + radius * 0.08, radius * 0.105)
    .fill({ color: 0xffffff })
    .circle(0, halfH + radius * 0.08, radius * 0.105)
    .stroke({ color: 0xfbbf24, width: 1.2, alpha: 1 });
  ballMarker.visible = false;
  token.addChild(ballMarker);

  return { token, body, shadow, ballMarker };
}

export { PREMIUM_TOKEN_IDLE_SHADOW_ALPHA, PREMIUM_TOKEN_DRAG_SHADOW_ALPHA };
