import { Container, Graphics, Text } from "pixi.js";

import type { MicroAthleteKitPattern } from "./createMicroAthleteToken";

export type CleanTacticalPlayerTokenStyle = {
  primaryColor: number;
  secondaryColor?: number;
  badgeColor?: number;
  outlineColor?: number;
  textColor?: number;
};

type CleanTokenVariant = "pixi" | "phosphor";

const FALLBACK_PRIMARY_COLOR = 0x2563eb;
const FALLBACK_ACCENT_COLOR = 0xffffff;
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

function readableTextColor(primaryColor: number): number {
  return relativeLuminance(primaryColor) > 0.58 ? 0x0f172a : 0xffffff;
}

function safeColor(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function lineHalfExtentAtOffset(radius: number, offset: number): number {
  const inside = radius * radius - offset * offset;
  if (inside <= 0) return 0;
  return Math.sqrt(inside);
}

function drawKitPattern(
  target: Graphics,
  pattern: MicroAthleteKitPattern,
  accentColor: number,
  radius: number,
  variant: CleanTokenVariant,
): void {
  if (pattern === "plain") return;

  const patternRadius = radius * 0.7;
  const thickStroke = Math.max(radius * 0.16, 0.54);
  const crispStroke = Math.max(radius * 0.13, 0.46);
  const strokeWidth = variant === "phosphor" ? crispStroke : thickStroke;
  const strokeAlpha = variant === "phosphor" ? 0.96 : 0.9;

  if (pattern === "hoops") {
    for (const yOffset of [-0.28, 0, 0.28]) {
      const y = patternRadius * yOffset;
      const halfSpan = lineHalfExtentAtOffset(patternRadius, y);
      target.moveTo(-halfSpan, y).lineTo(halfSpan, y);
    }
  } else if (pattern === "stripes") {
    for (const xOffset of [-0.34, 0, 0.34]) {
      const x = patternRadius * xOffset;
      const halfSpan = lineHalfExtentAtOffset(patternRadius, x);
      target.moveTo(x, -halfSpan).lineTo(x, halfSpan);
    }
  } else if (pattern === "slash") {
    const angle = -Math.PI * 0.22;
    const dx = Math.cos(angle) * patternRadius;
    const dy = Math.sin(angle) * patternRadius;
    target.moveTo(-dx, -dy).lineTo(dx, dy);
  }

  target.stroke({
    color: accentColor,
    width: strokeWidth,
    alpha: strokeAlpha,
    cap: "round",
    join: "round",
  });
}

export function createCleanTacticalPlayerToken({
  label,
  style,
  radius,
  kitPattern = "plain",
  kitPatternColor,
  variant,
}: {
  label: string;
  style?: Partial<CleanTacticalPlayerTokenStyle>;
  radius: number;
  kitPattern?: MicroAthleteKitPattern;
  kitPatternColor?: number;
  variant: CleanTokenVariant;
}): { token: Container; shadow: Graphics } {
  const primaryColor = safeColor(style?.primaryColor, FALLBACK_PRIMARY_COLOR);
  const accentColor = safeColor(kitPatternColor ?? style?.secondaryColor, FALLBACK_ACCENT_COLOR);
  const outlineColor = safeColor(style?.outlineColor, FALLBACK_OUTLINE_COLOR);
  const labelColor = safeColor(style?.textColor, readableTextColor(primaryColor));
  const labelStrokeColor = labelColor === 0xffffff ? 0x020617 : 0xffffff;
  const safeRadius = Math.max(2.8, radius);
  const ringColor =
    variant === "phosphor" ? mixColor(accentColor, 0xffffff, 0.2) : mixColor(primaryColor, accentColor, 0.26);
  const innerRadius = safeRadius * 0.82;

  const token = new Container();
  token.eventMode = "static";
  token.cursor = "grab";

  const shadow = new Graphics();
  shadow
    .ellipse(0.18, safeRadius * 0.96, safeRadius * 0.84, safeRadius * 0.24)
    .fill({ color: 0x020617, alpha: 0.24 });
  token.addChild(shadow);

  const disc = new Graphics();
  if (variant === "phosphor") {
    const innerFill = mixColor(primaryColor, 0xffffff, relativeLuminance(primaryColor) > 0.64 ? 0 : 0.08);
    disc
      .circle(0, 0, safeRadius * 1.04)
      .fill({ color: ringColor, alpha: 0.18 })
      .circle(0, 0, safeRadius)
      .fill({ color: mixColor(primaryColor, 0x000000, 0.05), alpha: 0.98 })
      .circle(0, 0, innerRadius)
      .fill({ color: innerFill, alpha: 0.98 });
    drawKitPattern(disc, kitPattern, accentColor, innerRadius, variant);
    disc
      .circle(0, 0, safeRadius)
      .stroke({ color: ringColor, width: Math.max(safeRadius * 0.13, 0.44), alpha: 0.95, alignment: 0.5 })
      .circle(0, 0, innerRadius)
      .stroke({ color: mixColor(outlineColor, ringColor, 0.34), width: Math.max(safeRadius * 0.05, 0.2), alpha: 0.78 });
  } else {
    disc
      .circle(0, 0, safeRadius)
      .fill({ color: mixColor(outlineColor, 0x000000, 0.12) })
      .circle(0, 0, safeRadius * 0.9)
      .fill({ color: ringColor })
      .circle(0, 0, innerRadius)
      .fill({ color: primaryColor });
    drawKitPattern(disc, kitPattern, accentColor, innerRadius, variant);
    disc
      .circle(0, 0, safeRadius)
      .stroke({ color: mixColor(outlineColor, 0x000000, 0.24), width: Math.max(safeRadius * 0.09, 0.34), alpha: 0.88 })
      .circle(0, 0, innerRadius)
      .stroke({ color: mixColor(primaryColor, 0x000000, 0.38), width: Math.max(safeRadius * 0.045, 0.18), alpha: 0.54 });
  }
  token.addChild(disc);

  const safeLabel = label.trim().slice(0, 3) || "?";
  const isNumericLabel = /^\d+$/.test(safeLabel);
  const labelFontSize = isNumericLabel ? (safeLabel.length >= 2 ? safeRadius * 1.04 : safeRadius * 1.18) : safeRadius * 0.8;
  const textResolution = typeof window !== "undefined" ? Math.max(2, Math.min(3, window.devicePixelRatio || 1)) : 2;

  const labelText = new Text({
    text: safeLabel,
    style: {
      fill: labelColor,
      fontSize: labelFontSize,
      fontWeight: "900",
      fontFamily: "\"Barlow Condensed\", \"Inter Tight\", Inter, system-ui, sans-serif",
      align: "center",
      letterSpacing: isNumericLabel && safeLabel.length >= 2 ? 0 : 0.08,
      stroke: {
        color: labelStrokeColor,
        width: isNumericLabel ? safeRadius * 0.2 : safeRadius * 0.15,
        join: "round",
      },
    },
  });
  labelText.anchor.set(0.5);
  labelText.position.y = isNumericLabel ? safeRadius * 0.02 : 0;
  labelText.resolution = textResolution;
  labelText.roundPixels = true;
  token.addChild(labelText);

  return { token, shadow };
}
