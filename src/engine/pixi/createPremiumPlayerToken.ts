import { Container, Graphics, Text } from "pixi.js";

export type PremiumPlayerTokenColor = "blue" | "red" | "yellow" | "black";

export const PREMIUM_TOKEN_IDLE_SCALE = 1;
export const PREMIUM_TOKEN_DRAG_SCALE = 1.08;
export const PREMIUM_TOKEN_IDLE_SHADOW_ALPHA = 0.24;
export const PREMIUM_TOKEN_DRAG_SHADOW_ALPHA = 0.36;

const PALETTE_BY_COLOR: Record<
  PremiumPlayerTokenColor,
  { shirt: number; shirtShade: number; shorts: number; socks: number; skin: number; hair: number }
> = {
  blue: {
    shirt: 0x2563eb,
    shirtShade: 0x1e40af,
    shorts: 0x1e3a8a,
    socks: 0xbfdbfe,
    skin: 0xf1c27d,
    hair: 0x0f172a,
  },
  red: {
    shirt: 0xdc2626,
    shirtShade: 0x991b1b,
    shorts: 0x7f1d1d,
    socks: 0xfecaca,
    skin: 0xf1c27d,
    hair: 0x111827,
  },
  yellow: {
    shirt: 0xf2c94c,
    shirtShade: 0xd4a021,
    shorts: 0x7c5b17,
    socks: 0xfff1bf,
    skin: 0xe9b978,
    hair: 0x1f2937,
  },
  black: {
    shirt: 0x111827,
    shirtShade: 0x020617,
    shorts: 0x000000,
    socks: 0x9ca3af,
    skin: 0xe7b784,
    hair: 0x000000,
  },
};

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
}): { token: Container; shadow: Graphics } {
  const palette = PALETTE_BY_COLOR[color];
  const token = new Container();
  token.eventMode = "static";
  token.cursor = "grab";
  token.scale.set(PREMIUM_TOKEN_IDLE_SCALE, PREMIUM_TOKEN_IDLE_SCALE);

  const shadow = new Graphics();
  shadow
    .ellipse(0.2, radius * 1.02, radius * 0.8, radius * 0.24)
    .fill({ color: 0x020617, alpha: PREMIUM_TOKEN_IDLE_SHADOW_ALPHA });
  token.addChild(shadow);

  const base = new Graphics();
  const baseWidth = radius * 1.1;
  const baseHeight = radius * 0.42;
  const baseY = radius * 0.86;
  base.ellipse(0, baseY + radius * 0.08, baseWidth * 0.94, baseHeight * 0.95).fill({ color: 0x000000, alpha: 0.18 });
  base.ellipse(0, baseY, baseWidth, baseHeight).fill({ color: 0x111827, alpha: 0.98 });
  base.ellipse(0, baseY - baseHeight * 0.1, baseWidth * 0.92, baseHeight * 0.78).fill({ color: 0x1f2937, alpha: 0.5 });
  token.addChild(base);

  const athlete = new Graphics();
  // Legs
  athlete.roundRect(-radius * 0.16, radius * 0.34, radius * 0.12, radius * 0.44, radius * 0.05).fill({ color: palette.socks });
  athlete.roundRect(radius * 0.04, radius * 0.34, radius * 0.12, radius * 0.44, radius * 0.05).fill({ color: palette.socks });
  athlete.ellipse(-radius * 0.1, radius * 0.8, radius * 0.11, radius * 0.05).fill({ color: 0x0f172a });
  athlete.ellipse(radius * 0.1, radius * 0.8, radius * 0.11, radius * 0.05).fill({ color: 0x0f172a });
  // Shorts
  athlete.roundRect(-radius * 0.24, radius * 0.14, radius * 0.48, radius * 0.26, radius * 0.1).fill({ color: palette.shorts });
  athlete.rect(-radius * 0.03, radius * 0.15, radius * 0.06, radius * 0.23).fill({ color: 0x05070c, alpha: 0.35 });
  // Tapered shirt
  athlete.poly([
    -radius * 0.36,
    -radius * 0.02,
    radius * 0.36,
    -radius * 0.02,
    radius * 0.23,
    radius * 0.32,
    -radius * 0.23,
    radius * 0.32,
  ]).fill({ color: palette.shirt });
  athlete.poly([
    -radius * 0.31,
    0,
    radius * 0.31,
    0,
    radius * 0.18,
    radius * 0.28,
    -radius * 0.18,
    radius * 0.28,
  ]).fill({ color: palette.shirtShade, alpha: 0.34 });
  // Arms
  athlete.roundRect(-radius * 0.38, radius * 0.03, radius * 0.11, radius * 0.3, radius * 0.07).fill({ color: palette.skin });
  athlete.roundRect(radius * 0.27, radius * 0.03, radius * 0.11, radius * 0.3, radius * 0.07).fill({ color: palette.skin });
  // Head + hair
  athlete.circle(0, -radius * 0.34, radius * 0.2).fill({ color: palette.skin });
  athlete.ellipse(0, -radius * 0.42, radius * 0.2, radius * 0.12).fill({ color: palette.hair, alpha: 0.98 });
  athlete.roundRect(-radius * 0.11, -radius * 0.17, radius * 0.22, radius * 0.1, radius * 0.05).fill({ color: palette.skin, alpha: 0.92 });
  token.addChild(athlete);

  const textResolution =
    typeof window !== "undefined" ? Math.max(2, Math.min(3, window.devicePixelRatio || 1)) : 2;
  const safeLabel = (label?.trim().slice(0, 3) ?? "") || String(number);
  const isNumericLabel = /^\d+$/.test(safeLabel);
  const numberLabel = new Text({
    text: safeLabel,
    style: {
      fill: 0xffffff,
      fontSize: isNumericLabel
        ? safeLabel.length >= 2 ? radius * 0.5 : radius * 0.58
        : radius * 0.42,
      fontWeight: "900",
      align: "center",
      fontFamily: '"Barlow Condensed", "Inter Tight", Inter, system-ui, sans-serif',
      letterSpacing: isNumericLabel && safeLabel.length >= 2 ? 0 : 0.1,
      stroke: { color: 0x000000, width: 0.52, join: "round" },
    },
  });
  numberLabel.anchor.set(0.5);
  numberLabel.position.set(0, baseY - radius * 0.02);
  numberLabel.resolution = textResolution;
  numberLabel.roundPixels = true;
  token.addChild(numberLabel);

  return { token, shadow };
}
