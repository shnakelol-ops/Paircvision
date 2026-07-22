import { Container, Graphics, Text } from "pixi.js";

import type { CleanTacticalPlayerTokenStyle } from "./createCleanTacticalPlayerToken";

const FALLBACK_PRIMARY_COLOR = 0x2563eb;
const FALLBACK_OUTLINE_COLOR = 0x0f172a;

function clampColorChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function mixColor(base: number, target: number, amount: number): number {
  const baseR = (base >> 16) & 0xff;
  const baseG = (base >> 8) & 0xff;
  const baseB = base & 0xff;
  const targetR = (target >> 16) & 0xff;
  const targetG = (target >> 8) & 0xff;
  const targetB = target & 0xff;

  const r = clampColorChannel(baseR + (targetR - baseR) * amount);
  const g = clampColorChannel(baseG + (targetG - baseG) * amount);
  const b = clampColorChannel(baseB + (targetB - baseB) * amount);

  return (r << 16) | (g << 8) | b;
}

function relativeLuminance(color: number): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function readableTextColor(fillColor: number): number {
  return relativeLuminance(fillColor) > 0.58 ? 0x0f172a : 0xffffff;
}

function safeColor(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? Number(value) : fallback;
}

/**
 * Renders a player token as a rounded name-pill capsule instead of a disc.
 * Width auto-fits the label so a future "full name" display mode can reuse
 * this renderer unchanged — only the label text passed in needs to change.
 */
export function createNamePillPlayerToken({
  label,
  style,
  radius,
}: {
  label: string;
  style?: Partial<CleanTacticalPlayerTokenStyle>;
  radius: number;
}): { token: Container; shadow: Graphics } {
  const fillColor = safeColor(style?.primaryColor, FALLBACK_PRIMARY_COLOR);
  const outlineColor = safeColor(style?.outlineColor, FALLBACK_OUTLINE_COLOR);
  const textColor = safeColor(style?.textColor, readableTextColor(fillColor));
  const borderColor = mixColor(outlineColor, fillColor, 0.35);

  const safeRadius = Math.max(2.8, radius);
  const pillHeight = safeRadius * 1.62;
  const cornerRadius = pillHeight / 2;
  const paddingX = safeRadius * 0.62;
  const borderWidth = Math.max(safeRadius * 0.055, 0.16);

  const token = new Container();
  token.eventMode = "static";
  token.cursor = "grab";

  const shadow = new Graphics();
  shadow
    .ellipse(0.18, pillHeight * 0.62, pillHeight * 0.72, pillHeight * 0.22)
    .fill({ color: 0x020617, alpha: 0.22 });
  token.addChild(shadow);

  const safeLabel = label.trim() || "?";
  const fontSize = pillHeight * 0.56;
  const textResolution =
    typeof window !== "undefined" ? Math.max(2, Math.min(3, window.devicePixelRatio || 1)) : 2;

  const labelText = new Text({
    text: safeLabel,
    style: {
      fill: textColor,
      fontSize,
      fontWeight: "800",
      fontFamily: "\"Barlow Condensed\", \"Inter Tight\", Inter, system-ui, sans-serif",
      align: "center",
      letterSpacing: 0.06,
    },
  });
  labelText.anchor.set(0.5);
  labelText.resolution = textResolution;
  labelText.roundPixels = true;

  const pillWidth = Math.max(pillHeight * 1.3, labelText.width + paddingX * 2);
  const halfWidth = pillWidth / 2;
  const halfHeight = pillHeight / 2;

  const capsule = new Graphics();
  capsule
    .roundRect(-halfWidth, -halfHeight, pillWidth, pillHeight, cornerRadius)
    .fill({ color: fillColor })
    .roundRect(-halfWidth, -halfHeight, pillWidth, pillHeight, cornerRadius)
    .stroke({ color: borderColor, width: borderWidth, alignment: 1, alpha: 0.75 });
  token.addChild(capsule);
  token.addChild(labelText);

  return { token, shadow };
}
