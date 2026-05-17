import { Container, Graphics, Text } from "pixi.js";

export type VisionV3PlayerTokenStyle = {
  primaryColor: number;
  secondaryColor?: number;
  badgeColor: number;
  outlineColor: number;
  textColor: number;
  goalkeeper?: boolean;
};

export type VisionV3TeamColor = "blue" | "red" | "green" | "yellow" | "black" | "white";
export type VisionV3KitPattern = "plain" | "hoops" | "stripes" | "slash" | "chestDash" | "gradient";
const VISION_V3_SIZE_SCALE = 1.06;

const DEFAULT_STYLE_BY_TEAM: Record<VisionV3TeamColor, VisionV3PlayerTokenStyle> = {
  blue: {
    primaryColor: 0x2563eb,
    secondaryColor: 0x60a5fa,
    badgeColor: 0x1d4ed8,
    outlineColor: 0x0f172a,
    textColor: 0xffffff,
  },
  red: {
    primaryColor: 0xdc2626,
    secondaryColor: 0xf87171,
    badgeColor: 0xb91c1c,
    outlineColor: 0x0f172a,
    textColor: 0xffffff,
  },
  green: {
    primaryColor: 0x16a34a,
    secondaryColor: 0x4ade80,
    badgeColor: 0x166534,
    outlineColor: 0x0b1220,
    textColor: 0xffffff,
  },
  yellow: {
    primaryColor: 0xfacc15,
    secondaryColor: 0xfde68a,
    badgeColor: 0xca8a04,
    outlineColor: 0x111827,
    textColor: 0x0f172a,
  },
  black: {
    primaryColor: 0x1f2937,
    secondaryColor: 0x4b5563,
    badgeColor: 0x020617,
    outlineColor: 0x000000,
    textColor: 0xffffff,
  },
  white: {
    primaryColor: 0xe5e7eb,
    secondaryColor: 0xffffff,
    badgeColor: 0x94a3b8,
    outlineColor: 0x0f172a,
    textColor: 0x0f172a,
  },
};

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

function luminance(color: number): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function drawPatternAccent(
  target: Graphics,
  pattern: VisionV3KitPattern,
  accentColor: number,
  innerRadius: number,
): void {
  if (pattern === "plain" || pattern === "gradient") return;

  const alpha = 0.72;

  if (pattern === "hoops") {
    const bandH = innerRadius * 0.28;
    const positions = [
      -innerRadius * 0.58,
      -innerRadius * 0.02,
       innerRadius * 0.54,
    ];
    for (const y of positions) {
      target
        .rect(-innerRadius, y, innerRadius * 2, bandH)
        .fill({ color: accentColor, alpha });
    }
    return;
  }

  if (pattern === "stripes") {
    const stripeW = innerRadius * 0.28;
    const positions = [
      -innerRadius * 0.58,
      -innerRadius * 0.14,
       innerRadius * 0.30,
    ];
    for (const x of positions) {
      target
        .rect(x, -innerRadius, stripeW, innerRadius * 2)
        .fill({ color: accentColor, alpha });
    }
    return;
  }

  if (pattern === "slash") {
    const sashW = innerRadius * 0.82;
    const len   = innerRadius * 2.2;
    const angle = -38 * (Math.PI / 180);
    const cos   = Math.cos(angle);
    const sin   = Math.sin(angle);
    const half  = sashW / 2;
    const corners: [number, number][] = [
      [-len / 2, -half],
      [ len / 2, -half],
      [ len / 2,  half],
      [-len / 2,  half],
    ];
    const rotated = corners.flatMap(([x, y]) => [
      x * cos - y * sin,
      x * sin + y * cos,
    ]);
    target
      .poly(rotated)
      .fill({ color: accentColor, alpha });
    return;
  }

  if (pattern === "chestDash") {
    const bandH = innerRadius * 0.62;
    target
      .rect(-innerRadius, -bandH / 2, innerRadius * 2, bandH)
      .fill({ color: accentColor, alpha });
    return;
  }
}

function drawShirtGlyph(target: Graphics, centerY: number, size: number, color: number): void {
  const top = centerY - size * 0.5;
  const bottom = centerY + size * 0.5;
  target
    .poly([
      -size * 0.64,
      top + size * 0.16,
      -size * 0.3,
      top,
      -size * 0.12,
      top + size * 0.14,
      size * 0.12,
      top + size * 0.14,
      size * 0.3,
      top,
      size * 0.64,
      top + size * 0.16,
      size * 0.42,
      top + size * 0.5,
      size * 0.38,
      bottom,
      -size * 0.38,
      bottom,
      -size * 0.42,
      top + size * 0.5,
    ])
    .fill({ color, alpha: 0.18 });
}

function drawPersonCircleGlyph(target: Graphics, radius: number, color: number): void {
  target
    .circle(0, 0, radius)
    .stroke({ color, width: Math.max(0.14, radius * 0.12), alpha: 0.2, alignment: 0.5 })
    .circle(0, -radius * 0.18, radius * 0.26)
    .fill({ color, alpha: 0.16 })
    .roundRect(-radius * 0.44, radius * 0.06, radius * 0.88, radius * 0.46, radius * 0.22)
    .fill({ color, alpha: 0.12 });
}

export function createVisionV3PlayerToken({
  label,
  teamColor,
  style,
  scale,
  radius,
  kitPattern = "plain",
  kitPatternColor,
}: {
  label: string;
  teamColor: VisionV3TeamColor;
  style?: Partial<VisionV3PlayerTokenStyle>;
  scale?: number;
  radius?: number;
  kitPattern?: VisionV3KitPattern;
  kitPatternColor?: number;
}): { token: Container; shadow: Graphics } {
  const defaults = DEFAULT_STYLE_BY_TEAM[teamColor];
  const resolved: VisionV3PlayerTokenStyle = {
    ...defaults,
    ...style,
    secondaryColor: style?.secondaryColor ?? defaults.secondaryColor,
    goalkeeper: style?.goalkeeper ?? defaults.goalkeeper,
  };

  const token = new Container();
  token.eventMode = "static";
  token.cursor = "grab";
  token.scale.set(scale ?? 1);

  const baseDiscRadius = Number.isFinite(radius) ? Math.max(2.8, Number(radius)) : 3.66;
  const discRadius = baseDiscRadius * VISION_V3_SIZE_SCALE;
  const ringWidth = Math.max(0.58, discRadius * 0.2);
  const innerRadius = discRadius - ringWidth;
  const baseColor =
    resolved.goalkeeper && resolved.secondaryColor != null
      ? resolved.secondaryColor
      : resolved.primaryColor;
  const pitchBlendSensitivePalette = teamColor === "green" || teamColor === "white";
  const accentColor = Number.isFinite(kitPatternColor)
    ? Number(kitPatternColor)
    : (resolved.secondaryColor ?? mixColor(baseColor, 0xffffff, 0.3));
  const ringColor = mixColor(baseColor, accentColor, 0.3);
  const coreColor = mixColor(baseColor, 0x020617, pitchBlendSensitivePalette ? 0.23 : 0.18);
  const highlightColor = mixColor(coreColor, 0xffffff, 0.2);
  const edgeColor = mixColor(resolved.outlineColor, 0x000000, pitchBlendSensitivePalette ? 0.3 : 0.24);

  const shadow = new Graphics();
  shadow
    .circle(0, 0, discRadius * 1.4)
    .fill({ color: ringColor, alpha: 0.1 })
    .ellipse(0.2, discRadius * 1.04, discRadius * 0.98, discRadius * 0.26)
    .fill({ color: 0x020617, alpha: 0.21 });
  shadow.alpha = 0.24;
  token.addChild(shadow);

  const disc = new Graphics();
  disc
    .circle(0, 0, discRadius)
    .fill({ color: 0x0b1120 })
    .circle(0, 0, discRadius - 0.08)
    .fill({ color: ringColor })
    .circle(0, 0, innerRadius)
    .fill({ color: kitPattern === "gradient" ? mixColor(baseColor, 0xffffff, 0.12) : coreColor })
    .ellipse(0, -innerRadius * 0.34, innerRadius * 0.72, innerRadius * 0.22)
    .fill({ color: highlightColor, alpha: 0.3 });
  drawPatternAccent(
    disc,
    kitPattern,
    mixColor(accentColor, 0xffffff, pitchBlendSensitivePalette ? 0.2 : 0.1),
    innerRadius * 0.9,
  );
  const patternMask = new Graphics();
  patternMask.circle(0, 0, innerRadius).fill({ color: 0xffffff });
  disc.mask = patternMask;
  disc.addChild(patternMask);
  disc
    .circle(0, 0, discRadius)
    .stroke({ color: edgeColor, width: Math.max(0.22, discRadius * 0.13), alpha: 0.74, alignment: 0.5 })
    .circle(0, 0, innerRadius)
    .stroke({ color: mixColor(edgeColor, 0xffffff, 0.08), width: Math.max(0.12, discRadius * 0.06), alpha: 0.42, alignment: 0.5 });
  token.addChild(disc);

  const iconLayer = new Graphics();
  drawShirtGlyph(iconLayer, -innerRadius * 0.02, innerRadius * 0.98, 0xffffff);
  iconLayer.position.y = -innerRadius * 0.06;
  token.addChild(iconLayer);

  const personLayer = new Graphics();
  drawPersonCircleGlyph(personLayer, innerRadius * 0.42, 0xffffff);
  personLayer.position.y = -innerRadius * 0.62;
  token.addChild(personLayer);

  const orientationTick = new Graphics();
  orientationTick
    .roundRect(-innerRadius * 0.16, -discRadius + ringWidth * 0.16, innerRadius * 0.32, Math.max(0.2, discRadius * 0.14), innerRadius * 0.08)
    .fill({ color: mixColor(ringColor, 0xffffff, 0.16), alpha: 0.36 });
  token.addChild(orientationTick);

  const safeLabel = label.trim().slice(0, 3) || "?";
  const isNumericLabel = /^\d+$/.test(safeLabel);
  const labelColor = isNumericLabel ? 0xffffff : resolved.textColor;
  const labelStroke = isNumericLabel
    ? mixColor(edgeColor, 0x000000, 0.52)
    : (luminance(labelColor) > 140 ? 0x0f172a : 0xf8fafc);
  const labelFontSize = isNumericLabel
    ? safeLabel.length >= 2 ? innerRadius * 1.16 : innerRadius * 1.32
    : innerRadius * 0.86;
  const labelBaseY = isNumericLabel ? innerRadius * 0.03 : 0;
  const labelLetterSpacing = isNumericLabel && safeLabel.length >= 2 ? 0 : 0.04;
  const textResolution =
    typeof window !== "undefined" ? Math.max(2, Math.min(3, window.devicePixelRatio || 1)) : 2;

  const labelPlate = new Graphics();
  labelPlate
    .roundRect(
      -innerRadius * 0.92,
      -innerRadius * 0.5,
      innerRadius * 1.84,
      innerRadius * 1.08,
      innerRadius * 0.32,
    )
    .fill({ color: mixColor(coreColor, 0x020617, 0.46), alpha: 0.24 });
  labelPlate.position.y = labelBaseY;
  token.addChild(labelPlate);

  const labelShadow = new Text({
    text: safeLabel,
    style: {
      fill: mixColor(labelStroke, 0x020617, 0.35),
      fontSize: labelFontSize,
      fontWeight: isNumericLabel ? "bolder" : "900",
      fontFamily: "\"Barlow Condensed\", \"Inter Tight\", Inter, system-ui, sans-serif",
      align: "center",
      letterSpacing: labelLetterSpacing,
    },
  });
  labelShadow.anchor.set(0.5);
  labelShadow.position.y = labelBaseY + 0.09;
  labelShadow.alpha = isNumericLabel ? 0.36 : 0.3;
  labelShadow.resolution = textResolution;
  labelShadow.roundPixels = true;
  token.addChild(labelShadow);

  const labelText = new Text({
    text: safeLabel,
    style: {
      fill: labelColor,
      fontSize: labelFontSize,
      fontWeight: isNumericLabel ? "bolder" : "900",
      fontFamily: "\"Barlow Condensed\", \"Inter Tight\", Inter, system-ui, sans-serif",
      align: "center",
      letterSpacing: labelLetterSpacing,
      stroke: {
        color: labelStroke,
        width: isNumericLabel ? Math.max(0.46, innerRadius * 0.22) : Math.max(0.32, innerRadius * 0.14),
        join: "round",
      },
    },
  });
  labelText.anchor.set(0.5);
  labelText.position.y = labelBaseY;
  labelText.resolution = textResolution;
  labelText.roundPixels = true;
  token.addChild(labelText);

  return { token, shadow };
}
