import { Container, Graphics, Text } from "pixi.js";

import type { CleanTacticalPlayerTokenStyle } from "./createCleanTacticalPlayerToken";

const FALLBACK_PRIMARY_COLOR = 0x2563eb;
const FALLBACK_OUTLINE_COLOR = 0x0f172a;
const MAX_PILL_WIDTH_RATIO = 4.0;
const MIN_LABEL_FONT_SCALE = 0.62;

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

/**
 * Renders a player token as a rounded name-pill capsule instead of a disc.
 * Width auto-fits the label up to a fixed maximum, so a long display name
 * shrinks/truncates rather than growing the token without bound.
 *
 * When showNumberBadge is set, a small circular jersey-number badge is fused
 * to the left cap of the same capsule (e.g. "④ Jordan") — still one Container,
 * one render object, so it drags/animates/exports exactly like the plain pill.
 */
export function createNamePillPlayerToken({
  label,
  style,
  radius,
  number,
  showNumberBadge,
}: {
  label: string;
  style?: Partial<CleanTacticalPlayerTokenStyle>;
  radius: number;
  number?: number;
  showNumberBadge?: boolean;
}): { token: Container; shadow: Graphics } {
  const fillColor = safeColor(style?.primaryColor, FALLBACK_PRIMARY_COLOR);
  const outlineColor = safeColor(style?.outlineColor, FALLBACK_OUTLINE_COLOR);
  const textColor = safeColor(style?.textColor, readableTextColor(fillColor));
  const borderColor = mixColor(outlineColor, fillColor, 0.5);

  const safeRadius = Math.max(2.8, radius);
  const pillHeight = safeRadius * 1.86;
  const cornerRadius = pillHeight / 2;
  const paddingX = safeRadius * 0.66;
  const borderWidth = Math.max(safeRadius * 0.045, 0.12);
  const maxPillWidth = pillHeight * MAX_PILL_WIDTH_RATIO;

  const badgeNumberLabel =
    showNumberBadge && Number.isFinite(number) ? String(Math.max(0, Math.trunc(Number(number)))) : "";
  const hasBadge = badgeNumberLabel.length > 0;
  const innerGap = hasBadge ? safeRadius * 0.34 : 0;
  // Space the badge + gap (or plain left padding) reserve before the name starts.
  const leadingWidth = hasBadge ? cornerRadius * 2 + innerGap : paddingX;

  const token = new Container();
  token.eventMode = "static";
  token.cursor = "grab";

  // Soft two-layer chip shadow — a tight contact shadow plus a wider, fainter
  // halo instead of a single hard-edged blob, closer to iOS/Android chip elevation.
  const shadow = new Graphics();
  shadow
    .ellipse(0.16, pillHeight * 0.58, pillHeight * 0.86, pillHeight * 0.3)
    .fill({ color: 0x020617, alpha: 0.1 })
    .ellipse(0.12, pillHeight * 0.54, pillHeight * 0.6, pillHeight * 0.2)
    .fill({ color: 0x020617, alpha: 0.16 });
  token.addChild(shadow);

  const safeLabel = label.trim() || "?";
  const baseFontSize = pillHeight * 0.5;
  const textResolution =
    typeof window !== "undefined" ? Math.max(2, Math.min(3, window.devicePixelRatio || 1)) : 2;

  const labelText = new Text({
    text: safeLabel,
    style: {
      fill: textColor,
      fontSize: baseFontSize,
      fontWeight: "700",
      fontFamily: "\"Barlow Condensed\", \"Inter Tight\", Inter, system-ui, sans-serif",
      align: "center",
      letterSpacing: 0.02,
    },
  });
  labelText.resolution = textResolution;
  labelText.roundPixels = true;

  const maxTextWidth = Math.max(pillHeight * 0.6, maxPillWidth - leadingWidth - paddingX);
  fitLabelToWidth(labelText, maxTextWidth, baseFontSize);

  const minPillWidth = hasBadge ? leadingWidth + pillHeight * 0.5 : pillHeight * 1.2;
  const naturalPillWidth = leadingWidth + labelText.width + paddingX;
  const pillWidth = Math.min(maxPillWidth, Math.max(minPillWidth, naturalPillWidth));
  const halfWidth = pillWidth / 2;
  const halfHeight = pillHeight / 2;

  const capsule = new Graphics();
  capsule
    .roundRect(-halfWidth, -halfHeight, pillWidth, pillHeight, cornerRadius)
    .fill({ color: fillColor })
    .roundRect(-halfWidth, -halfHeight, pillWidth, pillHeight, cornerRadius)
    .stroke({ color: borderColor, width: borderWidth, alignment: 1, alpha: 0.55 });
  token.addChild(capsule);

  if (hasBadge) {
    const badgeCenterX = -halfWidth + cornerRadius;
    const badgeFill = mixColor(fillColor, 0x000000, 0.24);
    const badgeTextColor = readableTextColor(badgeFill);
    const badgeRadius = cornerRadius * 0.94;

    const badge = new Graphics();
    badge
      .circle(badgeCenterX, 0, badgeRadius)
      .fill({ color: badgeFill })
      .circle(badgeCenterX, 0, badgeRadius)
      .stroke({ color: borderColor, width: borderWidth, alignment: 1, alpha: 0.6 });
    token.addChild(badge);

    const badgeText = new Text({
      text: badgeNumberLabel.slice(0, 2),
      style: {
        fill: badgeTextColor,
        fontSize: badgeRadius * (badgeNumberLabel.length >= 2 ? 1.0 : 1.16),
        fontWeight: "800",
        fontFamily: "\"Barlow Condensed\", \"Inter Tight\", Inter, system-ui, sans-serif",
        align: "center",
      },
    });
    badgeText.anchor.set(0.5);
    badgeText.position.set(badgeCenterX, 0);
    badgeText.resolution = textResolution;
    badgeText.roundPixels = true;
    token.addChild(badgeText);

    labelText.anchor.set(0, 0.5);
    labelText.position.set(badgeCenterX + cornerRadius + innerGap, 0);
  } else {
    labelText.anchor.set(0.5);
    labelText.position.set(0, 0);
  }
  token.addChild(labelText);

  return { token, shadow };
}
