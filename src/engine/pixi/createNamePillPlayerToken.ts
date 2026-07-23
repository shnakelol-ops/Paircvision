import { Container, Graphics, Text } from "pixi.js";

import type { CleanTacticalPlayerTokenStyle } from "./createCleanTacticalPlayerToken";
import type { MicroAthleteKitPattern } from "./createMicroAthleteToken";

const FALLBACK_PRIMARY_COLOR = 0x2563eb;
const FALLBACK_OUTLINE_COLOR = 0x0f172a;
const MAX_PILL_WIDTH_RATIO = 4.0;
const MIN_LABEL_FONT_SCALE = 0.62;
// The pill is the primary token surface in "none"/"side" layouts, so it reads
// at full size. Under a circle anchor it's a secondary label, so it stays compact.
const PILL_HEIGHT_RATIO = 1.5;
const UNDER_PILL_HEIGHT_RATIO = 1.05;
// Under-pill text sits noticeably larger relative to its (unchanged) height than
// the side/plain pill does — the fixed height just gets less padding around it.
// Lands just under the side-pill's own font size — name is readable but the
// circle above stays the primary read.
const UNDER_PILL_FONT_TO_HEIGHT_RATIO = 0.876;
const PILL_FONT_TO_HEIGHT_RATIO = 0.62;
const UNDER_PILL_PADDING_X_RATIO = 0.22;
const PILL_PADDING_X_RATIO = 0.42;
// Tight enough that the circle and pill read as one fused object, not two
// stacked shapes.
const UNDER_PILL_GAP_RATIO = 0.05;
// The complete under-pill assembly (circle + gap + pill) renders 6% smaller
// than the raw token radius in Normal Mode. Compact Mode's own scale
// multiplier (applied by the caller, outside this file) is compensated so
// its on-screen size is unaffected — see UNDER_PILL_NORMAL_SHRINK usages in
// createTacticalPadLiteSurface.ts and movement-board/tokens/token-layer.ts.
export const UNDER_PILL_NORMAL_SHRINK = 0.94;

const FONT_FAMILY = "\"Barlow Condensed\", \"Inter Tight\", Inter, system-ui, sans-serif";

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

function textResolution(): number {
  return typeof window !== "undefined" ? Math.max(2, Math.min(3, window.devicePixelRatio || 1)) : 2;
}

function lineHalfExtentAtOffset(radius: number, offset: number): number {
  const inside = radius * radius - offset * offset;
  return inside <= 0 ? 0 : Math.sqrt(inside);
}

/**
 * Shrinks (down to a floor) then truncates-with-ellipsis so a label never
 * pushes the pill past maxTextWidth, instead of growing the pill unbounded.
 */
function fitLabelToWidth(text: Text, maxTextWidth: number, baseFontSize: number): void {
  if (text.width <= maxTextWidth) return;
  const scale = Math.max(MIN_LABEL_FONT_SCALE, maxTextWidth / text.width);
  text.style.fontSize = baseFontSize * scale;
  if (text.width <= maxTextWidth) return;
  let content = text.text;
  while (content.length > 1 && text.width > maxTextWidth) {
    content = content.slice(0, -1);
    text.text = `${content}…`;
  }
}

/** Kit pattern accent (hoops/stripes/slash), matching the other circle-style tokens' treatment. */
function drawKitPatternAccent(
  target: Graphics,
  pattern: MicroAthleteKitPattern,
  accentColor: number,
  radius: number,
  centerX: number,
  centerY: number,
): void {
  if (pattern === "plain") return;
  const patternRadius = radius * 0.7;
  const strokeWidth = Math.max(radius * 0.15, 0.5);

  if (pattern === "hoops") {
    for (const yOffset of [-0.28, 0, 0.28]) {
      const y = patternRadius * yOffset;
      const halfSpan = lineHalfExtentAtOffset(patternRadius, y);
      target.moveTo(centerX - halfSpan, centerY + y).lineTo(centerX + halfSpan, centerY + y);
    }
  } else if (pattern === "stripes") {
    for (const xOffset of [-0.34, 0, 0.34]) {
      const x = patternRadius * xOffset;
      const halfSpan = lineHalfExtentAtOffset(patternRadius, x);
      target.moveTo(centerX + x, centerY - halfSpan).lineTo(centerX + x, centerY + halfSpan);
    }
  } else if (pattern === "slash") {
    const angle = -Math.PI * 0.22;
    const dx = Math.cos(angle) * patternRadius;
    const dy = Math.sin(angle) * patternRadius;
    target.moveTo(centerX - dx, centerY - dy).lineTo(centerX + dx, centerY + dy);
  }

  target.stroke({ color: accentColor, width: strokeWidth, alpha: 0.9, cap: "round", join: "round" });
}

/**
 * A flat, minimal circular number marker — used both as the side-pill's fused
 * badge (no pattern) and as the under-pill's position anchor (pattern optional).
 */
function drawNumberCircle(
  target: Container,
  centerX: number,
  centerY: number,
  circleRadius: number,
  fillColor: number,
  borderColor: number,
  borderWidth: number,
  numberLabel: string,
  pattern?: MicroAthleteKitPattern,
  patternColor?: number,
): void {
  const textColor = readableTextColor(fillColor);
  const circle = new Graphics();
  circle.circle(centerX, centerY, circleRadius).fill({ color: fillColor });
  if (pattern && pattern !== "plain") {
    const accentColor = Number.isFinite(patternColor) ? Number(patternColor) : mixColor(fillColor, 0xffffff, 0.3);
    drawKitPatternAccent(circle, pattern, accentColor, circleRadius, centerX, centerY);
  }
  circle
    .circle(centerX, centerY, circleRadius)
    .stroke({ color: borderColor, width: borderWidth, alignment: 1, alpha: 0.6 });
  target.addChild(circle);

  const safeNumberLabel = numberLabel.slice(0, 2) || "?";
  const numberText = new Text({
    text: safeNumberLabel,
    style: {
      fill: textColor,
      fontSize: circleRadius * (safeNumberLabel.length >= 2 ? 1.0 : 1.16),
      fontWeight: "800",
      fontFamily: FONT_FAMILY,
      align: "center",
    },
  });
  numberText.anchor.set(0.5);
  numberText.position.set(centerX, centerY);
  numberText.resolution = textResolution();
  numberText.roundPixels = true;
  target.addChild(numberText);
}

/**
 * Renders a player token built around a rounded name-pill capsule instead of
 * a disc. Width auto-fits the label up to a fixed maximum — past that it
 * shrinks the font, then truncates with an ellipsis — and padding is kept
 * tight so the capsule hugs the text like a label, not a UI chip.
 *
 * badgePosition selects the layout:
 * - undefined/"none": plain pill, label only.
 * - "side": a small number badge is fused to the left cap (e.g. "① Jordan").
 * - "under": a full-size number circle is the position anchor; a compact
 *   pill is centred directly beneath it, carrying the name only. kitPattern
 *   renders on this circle only — never on the pill itself.
 *
 * All three are a single Container — one render object, so dragging,
 * animation (player.x/y), phases, and PNG export all work unchanged.
 */
export function createNamePillPlayerToken({
  label,
  style,
  radius,
  number,
  badgePosition,
  kitPattern,
  kitPatternColor,
}: {
  label: string;
  style?: Partial<CleanTacticalPlayerTokenStyle>;
  radius: number;
  number?: number;
  badgePosition?: "side" | "under";
  kitPattern?: MicroAthleteKitPattern;
  kitPatternColor?: number;
}): { token: Container; shadow: Graphics } {
  const fillColor = safeColor(style?.primaryColor, FALLBACK_PRIMARY_COLOR);
  const outlineColor = safeColor(style?.outlineColor, FALLBACK_OUTLINE_COLOR);
  const textColor = safeColor(style?.textColor, readableTextColor(fillColor));
  const borderColor = mixColor(outlineColor, fillColor, 0.5);

  const safeRadius = Math.max(2.8, radius);
  const numberLabel = Number.isFinite(number) ? String(Math.max(0, Math.trunc(Number(number)))) : "";
  const isUnder = badgePosition === "under" && numberLabel.length > 0;
  const isSide = badgePosition === "side" && numberLabel.length > 0;
  // The under-pill's complete assembly (circle + gap + pill) scales off this
  // reduced radius in Normal Mode; side/plain pills are untouched and keep
  // using safeRadius directly.
  const underAssemblyRadius = safeRadius * UNDER_PILL_NORMAL_SHRINK;
  const underRadius = isUnder ? underAssemblyRadius : safeRadius;

  const pillHeight = underRadius * (isUnder ? UNDER_PILL_HEIGHT_RATIO : PILL_HEIGHT_RATIO);
  const cornerRadius = pillHeight / 2;
  const paddingX = underRadius * (isUnder ? UNDER_PILL_PADDING_X_RATIO : PILL_PADDING_X_RATIO);
  const borderWidth = Math.max(underRadius * 0.04, 0.1);
  const maxPillWidth = pillHeight * MAX_PILL_WIDTH_RATIO;
  const innerGap = isSide ? safeRadius * 0.22 : 0;
  // Space the side badge + gap reserves before the name starts; "under"/plain use plain left padding.
  const leadingWidth = isSide ? cornerRadius * 2 + innerGap : paddingX;

  const token = new Container();
  token.eventMode = "static";
  token.cursor = "grab";

  const shadow = new Graphics();
  if (isUnder) {
    // The circle is the visual anchor here, so it carries the (only) contact shadow.
    shadow
      .ellipse(0.14, underRadius * 1.02, underRadius * 0.82, underRadius * 0.22)
      .fill({ color: 0x020617, alpha: 0.18 });
  } else {
    // Light two-layer shadow — tight contact plus a faint wider halo — kept
    // subtle so the pill reads as a label, not an elevated UI chip.
    shadow
      .ellipse(0.14, pillHeight * 0.56, pillHeight * 0.68, pillHeight * 0.22)
      .fill({ color: 0x020617, alpha: 0.08 })
      .ellipse(0.1, pillHeight * 0.52, pillHeight * 0.46, pillHeight * 0.15)
      .fill({ color: 0x020617, alpha: 0.12 });
  }
  token.addChild(shadow);

  const safeLabel = label.trim() || "?";
  const baseFontSize = pillHeight * (isUnder ? UNDER_PILL_FONT_TO_HEIGHT_RATIO : PILL_FONT_TO_HEIGHT_RATIO);

  const labelText = new Text({
    text: safeLabel,
    style: {
      fill: textColor,
      fontSize: baseFontSize,
      fontWeight: "700",
      fontFamily: FONT_FAMILY,
      align: "center",
      letterSpacing: 0.02,
    },
  });
  labelText.resolution = textResolution();
  labelText.roundPixels = true;

  const maxTextWidth = Math.max(pillHeight * 0.6, maxPillWidth - leadingWidth - paddingX);
  fitLabelToWidth(labelText, maxTextWidth, baseFontSize);

  const minPillWidth = isSide
    ? leadingWidth + pillHeight * 0.35
    : isUnder
      ? pillHeight * 0.9
      : pillHeight * 1.05;
  const naturalPillWidth = leadingWidth + labelText.width + paddingX;
  const pillWidth = Math.min(maxPillWidth, Math.max(minPillWidth, naturalPillWidth));
  const halfWidth = pillWidth / 2;
  const halfHeight = pillHeight / 2;

  const pillCenterY = isUnder ? underRadius + underRadius * UNDER_PILL_GAP_RATIO + halfHeight : 0;

  const capsule = new Graphics();
  capsule
    .roundRect(-halfWidth, pillCenterY - halfHeight, pillWidth, pillHeight, cornerRadius)
    .fill({ color: fillColor })
    .roundRect(-halfWidth, pillCenterY - halfHeight, pillWidth, pillHeight, cornerRadius)
    .stroke({ color: borderColor, width: borderWidth, alignment: 1, alpha: 0.45 });
  token.addChild(capsule);

  if (isSide) {
    const badgeCenterX = -halfWidth + cornerRadius;
    const badgeFill = mixColor(fillColor, 0x000000, 0.24);
    drawNumberCircle(token, badgeCenterX, 0, cornerRadius * 0.94, badgeFill, borderColor, borderWidth, numberLabel);
    labelText.anchor.set(0, 0.5);
    labelText.position.set(badgeCenterX + cornerRadius + innerGap, 0);
  } else {
    // Mathematically centred on both axes — text anchor 0.5/0.5 at the
    // capsule's own centre point.
    labelText.anchor.set(0.5, 0.5);
    labelText.position.set(0, pillCenterY);
  }
  token.addChild(labelText);

  if (isUnder) {
    // The circle is the tactical anchor — always draw it at the full token
    // radius (same as the standalone circle-only styles), reduced only by
    // the same Normal-Mode assembly shrink applied to the rest of the
    // token. Never shrink it relative to the pill; the pill is secondary.
    drawNumberCircle(token, 0, 0, underRadius, fillColor, borderColor, borderWidth, numberLabel, kitPattern, kitPatternColor);
  }

  return { token, shadow };
}
