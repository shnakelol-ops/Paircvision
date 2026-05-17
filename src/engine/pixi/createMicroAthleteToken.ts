import { Container, Graphics, Text } from "pixi.js";

export type MicroAthleteStyle = {
  primaryColor: number;
  secondaryColor?: number;
  badgeColor: number;
  outlineColor: number;
  textColor: number;
  goalkeeper?: boolean;
};

export type MicroAthleteTeamColor = "blue" | "red" | "green" | "yellow" | "black" | "white";
export type MicroAthleteKitPattern = "plain" | "hoops" | "slash" | "stripes";

const DEFAULT_STYLE_BY_TEAM: Record<MicroAthleteTeamColor, MicroAthleteStyle> = {
  blue: {
    primaryColor: 0x2563eb,
    secondaryColor: 0x60a5fa,
    badgeColor: 0x1e40af,
    outlineColor: 0x0b1220,
    textColor: 0xffffff,
  },
  red: {
    primaryColor: 0xdc2626,
    secondaryColor: 0xf87171,
    badgeColor: 0x991b1b,
    outlineColor: 0x0b1220,
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
    textColor: 0xffffff,
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
    textColor: 0xffffff,
  },
};

const TOKEN_BASE_COLOR = 0x191919;
const TOKEN_RADIUS = 3.66;
const TOKEN_RING_WIDTH = 1.02;
const TOKEN_IDLE_HALO_ALPHA = 0.24;
const TOKEN_OUTLINE_WIDTH = 0.64;

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

function lineHalfExtentAtOffset(radius: number, offset: number): number {
  const inside = radius * radius - offset * offset;
  if (inside <= 0) return 0;
  return Math.sqrt(inside);
}

function drawPatternAccent(
  target: Graphics,
  pattern: MicroAthleteKitPattern,
  accentColor: number,
  innerRadius: number,
): void {
  if (pattern === "plain") return;
  const clippedInnerRadius = Math.max(0, innerRadius - 0.12);
  const accentWidth = 0.38;
  if (pattern === "hoops") {
    const yOffset = clippedInnerRadius * 0.34;
    const halfSpan = lineHalfExtentAtOffset(clippedInnerRadius, yOffset);
    target
      .moveTo(-halfSpan, -yOffset)
      .lineTo(halfSpan, -yOffset)
      .moveTo(-halfSpan, yOffset)
      .lineTo(halfSpan, yOffset);
  } else if (pattern === "stripes") {
    const xOffset = clippedInnerRadius * 0.34;
    const halfSpan = lineHalfExtentAtOffset(clippedInnerRadius, xOffset);
    target
      .moveTo(-xOffset, -halfSpan)
      .lineTo(-xOffset, halfSpan)
      .moveTo(xOffset, -halfSpan)
      .lineTo(xOffset, halfSpan);
  } else if (pattern === "slash") {
    const slashAngle = -Math.PI * 0.22;
    const dx = Math.cos(slashAngle) * clippedInnerRadius;
    const dy = Math.sin(slashAngle) * clippedInnerRadius;
    target.moveTo(-dx, -dy).lineTo(dx, dy);
  }
  target.stroke({
    color: accentColor,
    width: accentWidth,
    alpha: 0.24,
    cap: "round",
    join: "round",
  });
}

export function createMicroAthleteToken({
  label,
  teamColor,
  style,
  scale,
  kitPattern = "plain",
  kitPatternColor,
}: {
  label: string;
  teamColor: MicroAthleteTeamColor;
  style?: Partial<MicroAthleteStyle>;
  scale?: number;
  kitPattern?: MicroAthleteKitPattern;
  kitPatternColor?: number;
}): { token: Container; shadow: Graphics } {
  const defaults = DEFAULT_STYLE_BY_TEAM[teamColor];
  const resolved: MicroAthleteStyle = {
    ...defaults,
    ...style,
    secondaryColor: style?.secondaryColor ?? defaults.secondaryColor,
    goalkeeper: style?.goalkeeper ?? defaults.goalkeeper,
  };

  const token = new Container();
  token.eventMode = "static";
  token.cursor = "grab";
  token.scale.set(scale ?? 1);

  const innerColor = resolved.goalkeeper && resolved.secondaryColor != null
    ? resolved.secondaryColor
    : resolved.primaryColor;
  const patternAccentColor = Number.isFinite(kitPatternColor)
    ? Number(kitPatternColor)
    : (resolved.secondaryColor ?? mixColor(innerColor, 0xffffff, 0.24));
  const ringColor = mixColor(innerColor, patternAccentColor, 0.34);
  const bodyColor = mixColor(innerColor, TOKEN_BASE_COLOR, 0.18);
  const bodyShadeColor = mixColor(bodyColor, TOKEN_BASE_COLOR, 0.24);
  const bodyHighlightColor = mixColor(bodyColor, 0xffffff, 0.22);
  const outlineColor = resolved.outlineColor;
  const innerRadius = TOKEN_RADIUS - TOKEN_RING_WIDTH;
  const ringOuterRadius = TOKEN_RADIUS - 0.08;

  const shadow = new Graphics();
  shadow
    .circle(0, 0, TOKEN_RADIUS * 1.28)
    .fill({ color: ringColor, alpha: 0.22 })
    .circle(0, 0, TOKEN_RADIUS * 1.48)
    .fill({ color: ringColor, alpha: 0.1 });
  shadow.alpha = TOKEN_IDLE_HALO_ALPHA;
  token.addChild(shadow);

  const baseShadow = new Graphics();
  baseShadow
    .ellipse(0.2, TOKEN_RADIUS * 1.08, TOKEN_RADIUS * 1.04, TOKEN_RADIUS * 0.24)
    .fill({ color: 0x020617, alpha: 0.19 });
  token.addChild(baseShadow);

  const tokenDisc = new Graphics();
  tokenDisc
    .circle(0, 0, TOKEN_RADIUS)
    .fill({ color: TOKEN_BASE_COLOR })
    .circle(0, 0, ringOuterRadius)
    .fill({ color: ringColor })
    .circle(0, 0, innerRadius)
    .fill({ color: bodyColor })
    .circle(0, innerRadius * 0.18, innerRadius * 0.96)
    .fill({ color: bodyShadeColor, alpha: 0.26 });
  drawPatternAccent(
    tokenDisc,
    kitPattern,
    mixColor(patternAccentColor, 0xffffff, 0.16),
    innerRadius * 0.88,
  );
  tokenDisc
    .circle(0, 0, TOKEN_RADIUS)
    .stroke({
      color: mixColor(outlineColor, 0x000000, 0.34),
      width: TOKEN_OUTLINE_WIDTH,
      alpha: 0.7,
      alignment: 0.5,
    })
    .circle(0, 0, innerRadius)
    .stroke({
      color: mixColor(outlineColor, 0x000000, 0.24),
      width: 0.24,
      alpha: 0.58,
      alignment: 0.5,
    });
  token.addChild(tokenDisc);

  const innerGloss = new Graphics();
  innerGloss
    .ellipse(0, -innerRadius * 0.34, innerRadius * 0.78, innerRadius * 0.28)
    .fill({ color: bodyHighlightColor, alpha: 0.34 })
    .ellipse(-innerRadius * 0.16, -innerRadius * 0.48, innerRadius * 0.46, innerRadius * 0.16)
    .fill({ color: 0xffffff, alpha: 0.14 });
  token.addChild(innerGloss);

  const safeLabel = label.trim().slice(0, 3) || "?";
  const isNumericLabel = /^\d+$/.test(safeLabel);
  const labelBaseY = isNumericLabel ? 0 : -0.04;
  const labelFontSize = isNumericLabel
    ? safeLabel.length >= 2 ? 4.3 : 4.9
    : 3.4;
  const labelLetterSpacing = isNumericLabel ? 0.04 : 0.1;
  const labelTextColor = 0xffffff;

  const textResolution =
    typeof window !== "undefined" ? Math.max(2, Math.min(3, window.devicePixelRatio || 1)) : 2;
  const labelShadow = new Text({
    text: safeLabel,
    style: {
      fill: 0x020617,
      fontSize: labelFontSize,
      fontWeight: "900",
      fontFamily: "\"Barlow Condensed\", \"Inter Tight\", Inter, system-ui, sans-serif",
      align: "center",
      letterSpacing: labelLetterSpacing,
    },
  });
  labelShadow.anchor.set(0.5, 0.5);
  labelShadow.position.y = labelBaseY + 0.1;
  labelShadow.alpha = 0.32;
  labelShadow.resolution = textResolution;
  labelShadow.roundPixels = true;
  token.addChild(labelShadow);

  const labelText = new Text({
    text: safeLabel,
    style: {
      fill: labelTextColor,
      fontSize: labelFontSize,
      fontWeight: "900",
      fontFamily: "\"Barlow Condensed\", \"Inter Tight\", Inter, system-ui, sans-serif",
      align: "center",
      letterSpacing: labelLetterSpacing,
      stroke: {
        color: mixColor(outlineColor, 0x000000, 0.22),
        width: isNumericLabel ? 0.84 : 0.62,
        join: "round",
      },
    },
  });
  labelText.anchor.set(0.5, 0.5);
  labelText.position.y = labelBaseY;
  labelText.resolution = textResolution;
  labelText.roundPixels = true;
  token.addChild(labelText);

  return { token, shadow };
}
