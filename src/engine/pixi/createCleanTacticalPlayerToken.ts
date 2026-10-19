import { Container, Graphics, Text } from "pixi.js";

import type { VisionV3KitPattern } from "./createVisionV3PlayerToken";
import {
  KIT_GRADIENT_FACE_LIGHTEN,
  createKitPatternLayer,
  kitPatternHasBands,
  resolveKitPatternPaint,
} from "./kitPatternAccent";

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

export function createCleanTacticalPlayerToken({
  label,
  style,
  radius,
  kitPattern = "plain",
  kitPatternColor,
  variant,
  artScale = 1,
}: {
  label: string;
  style?: Partial<CleanTacticalPlayerTokenStyle>;
  radius: number;
  /** All six Vision V3 patterns, drawn with Vision V3's band geometry (see kitPatternAccent.ts). */
  kitPattern?: VisionV3KitPattern;
  kitPatternColor?: number;
  variant: CleanTokenVariant;
  /**
   * Supersampling factor (see VISION_V3_SLATE_ART_SCALE). 1 (the default)
   * draws straight into the token exactly as before; the Tactical Slate's
   * Pixi and Phosphor renderers pass VISION_V3_SLATE_ART_SCALE.
   */
  artScale?: number;
}): { token: Container; shadow: Graphics } {
  const primaryColor = safeColor(style?.primaryColor, FALLBACK_PRIMARY_COLOR);
  const hasAuthoredPatternColor = Number.isFinite(kitPatternColor);
  const accentColor = safeColor(kitPatternColor ?? style?.secondaryColor, FALLBACK_ACCENT_COLOR);
  const outlineColor = safeColor(style?.outlineColor, FALLBACK_OUTLINE_COLOR);
  const labelColor = safeColor(style?.textColor, readableTextColor(primaryColor));
  const labelStrokeColor = labelColor === 0xffffff ? 0x020617 : 0xffffff;
  // Every board-unit length below (radii and the absolute floors/offsets
  // alike) is multiplied by `unit`, and the art container scales it back by
  // 1/unit — so the drawn geometry in token space is unchanged.
  const unit = Number.isFinite(artScale) && artScale > 1 ? artScale : 1;
  const safeRadius = Math.max(2.8, radius) * unit;
  const ringColor =
    variant === "phosphor" ? mixColor(accentColor, 0xffffff, 0.2) : mixColor(primaryColor, accentColor, 0.26);
  const innerRadius = safeRadius * 0.82;

  const token = new Container();
  token.eventMode = "static";
  token.cursor = "grab";

  let art: Container = token;
  if (unit > 1) {
    art = new Container();
    art.scale.set(1 / unit);
    token.addChild(art);
  }

  const shadow = new Graphics();
  shadow
    .ellipse(0.18 * unit, safeRadius * 0.96, safeRadius * 0.84, safeRadius * 0.24)
    .fill({ color: 0x020617, alpha: 0.24 });
  art.addChild(shadow);

  // Face fill, then Vision V3's kit bands clipped to the face (innerRadius),
  // then this style's own rim/outline strokes on top. Plain draws no bands,
  // so `rings` is the disc itself and the token is drawn exactly as before.
  const hasBands = kitPatternHasBands(kitPattern);
  const disc = new Graphics();
  const rings = hasBands ? new Graphics() : disc;
  const lighten = (face: number) =>
    kitPattern === "gradient" ? mixColor(face, 0xffffff, KIT_GRADIENT_FACE_LIGHTEN) : face;
  if (variant === "phosphor") {
    const innerFill = mixColor(primaryColor, 0xffffff, relativeLuminance(primaryColor) > 0.64 ? 0 : 0.08);
    disc
      .circle(0, 0, safeRadius * 1.04)
      .fill({ color: ringColor, alpha: 0.18 })
      .circle(0, 0, safeRadius)
      .fill({ color: mixColor(primaryColor, 0x000000, 0.05), alpha: 0.98 })
      .circle(0, 0, innerRadius)
      .fill({ color: lighten(innerFill), alpha: 0.98 });
    rings
      .circle(0, 0, safeRadius)
      .stroke({ color: ringColor, width: Math.max(safeRadius * 0.13, 0.44 * unit), alpha: 0.95, alignment: 0.5 })
      .circle(0, 0, innerRadius)
      .stroke({ color: mixColor(outlineColor, ringColor, 0.34), width: Math.max(safeRadius * 0.05, 0.2 * unit), alpha: 0.78 });
  } else {
    disc
      .circle(0, 0, safeRadius)
      .fill({ color: mixColor(outlineColor, 0x000000, 0.12) })
      .circle(0, 0, safeRadius * 0.9)
      .fill({ color: ringColor })
      .circle(0, 0, innerRadius)
      .fill({ color: lighten(primaryColor) });
    rings
      .circle(0, 0, safeRadius)
      .stroke({ color: mixColor(outlineColor, 0x000000, 0.24), width: Math.max(safeRadius * 0.09, 0.34 * unit), alpha: 0.88 })
      .circle(0, 0, innerRadius)
      .stroke({ color: mixColor(primaryColor, 0x000000, 0.38), width: Math.max(safeRadius * 0.045, 0.18 * unit), alpha: 0.54 });
  }
  art.addChild(disc);
  const paint = resolveKitPatternPaint(accentColor, hasAuthoredPatternColor, mixColor);
  const patternLayer = createKitPatternLayer(kitPattern, paint.color, paint.alpha, innerRadius);
  if (patternLayer) {
    art.addChild(patternLayer);
    art.addChild(rings);
  }

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
      letterSpacing: isNumericLabel && safeLabel.length >= 2 ? 0 : 0.08 * unit,
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
  art.addChild(labelText);

  return { token, shadow };
}
