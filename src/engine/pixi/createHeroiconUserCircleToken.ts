import { Container, Graphics, Text } from "pixi.js";

// "Heroicon" token renderer — the official player-token style built from the
// Heroicons "user-circle" pictogram (see playerTokenRenderer.ts: style ===
// "premium"). Replaces the retired "Glow" style as of V1.5.
//
// Icon source (MIT License, verified against the official Tailwind Labs repo,
// pinned to the v2.2.0 tag so the reference cannot drift):
//   Path:    https://github.com/tailwindlabs/heroicons/blob/v2.2.0/optimized/24/solid/user-circle.svg
//   License: https://github.com/tailwindlabs/heroicons/blob/v2.2.0/LICENSE
// Heroicons v2.2.0, "user-circle" (solid, 24px), by Tailwind Labs, Inc.

export type HeroiconTeamColor = "blue" | "red" | "green" | "yellow" | "black" | "white";
export type HeroiconKitPattern = "plain" | "hoops" | "slash" | "stripes";

export type HeroiconPlayerTokenStyle = {
  primaryColor: number;
  secondaryColor?: number;
  badgeColor: number;
  outlineColor: number;
  textColor: number;
  goalkeeper?: boolean;
};

// Same palette values as createPremiumGlowPlayerToken.ts so home/away tinting
// is pixel-identical to the token this style replaces.
const DEFAULT_STYLE_BY_TEAM: Record<HeroiconTeamColor, HeroiconPlayerTokenStyle> = {
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

// Matches createPremiumGlowPlayerToken.ts's TOKEN_RADIUS exactly, so the two
// styles occupy identical on-screen space and are a fair visual A/B.
const TOKEN_RADIUS = 3.66;
const TOKEN_RING_WIDTH = 0.34;
const ICON_VIEWBOX = 24;
const ICON_FILL_RATIO = 0.86; // icon diameter as a fraction of the token diameter
const ICON_WATERMARK_ALPHA = 0.42;

// Heroicons "user-circle" (solid), 24x24 viewBox, fill-rule: evenodd.
const USER_CIRCLE_PATH =
  "M18.685 19.097A9.723 9.723 0 0 0 21.75 12c0-5.385-4.365-9.75-9.75-9.75S2.25 6.615 2.25 12a9.723 9.723 0 0 0 3.065 7.097A9.716 9.716 0 0 0 12 21.75a9.716 9.716 0 0 0 6.685-2.653Zm-12.54-1.285A7.486 7.486 0 0 1 12 15a7.486 7.486 0 0 1 5.855 2.812A8.224 8.224 0 0 1 12 20.25a8.224 8.224 0 0 1-5.855-2.438ZM15.75 9a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z";

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

function readableFillHex(backgroundColor: number): string {
  const value = relativeLuminance(backgroundColor) > 0.58 ? 0x0f172a : 0xffffff;
  return `#${value.toString(16).padStart(6, "0")}`;
}

export function createHeroiconUserCircleToken({
  label,
  teamColor,
  style,
  scale,
  kitPattern = "plain",
  kitPatternColor,
}: {
  label: string;
  teamColor: HeroiconTeamColor;
  style?: Partial<HeroiconPlayerTokenStyle>;
  scale?: number;
  kitPattern?: HeroiconKitPattern;
  kitPatternColor?: number;
}): { token: Container; shadow: Graphics } {
  const defaults = DEFAULT_STYLE_BY_TEAM[teamColor] ?? DEFAULT_STYLE_BY_TEAM.blue;
  const resolved: HeroiconPlayerTokenStyle = {
    ...defaults,
    ...style,
    secondaryColor: style?.secondaryColor ?? defaults.secondaryColor,
    goalkeeper: style?.goalkeeper ?? defaults.goalkeeper,
  };

  const token = new Container();
  token.eventMode = "static";
  token.cursor = "grab";
  token.scale.set(scale ?? 1);

  const baseColor = resolved.goalkeeper && resolved.secondaryColor != null
    ? resolved.secondaryColor
    : resolved.primaryColor;
  const patternTintSource = Number.isFinite(kitPatternColor) ? Number(kitPatternColor) : baseColor;
  const discFill = kitPattern === "plain" ? baseColor : mixColor(baseColor, patternTintSource, 0.16);

  // Drop shadow — the wrapper drives this Graphics' alpha for idle/drag
  // transitions (createTacticalPadLiteSurface.ts: animatePlayerDragVisuals),
  // so only its shape needs to be authored here.
  const shadow = new Graphics();
  shadow
    .ellipse(0.3, TOKEN_RADIUS * 1.08, TOKEN_RADIUS * 1.05, TOKEN_RADIUS * 0.3)
    .fill({ color: 0x020617, alpha: 0.9 });
  token.addChild(shadow);

  const disc = new Graphics();
  disc
    .circle(0, 0, TOKEN_RADIUS)
    .fill({ color: discFill })
    .circle(0, 0, TOKEN_RADIUS - TOKEN_RING_WIDTH * 0.5)
    .stroke({ color: resolved.outlineColor, width: TOKEN_RING_WIDTH, alpha: 0.9 });
  token.addChild(disc);

  // Heroicons "user-circle" (solid) — parsed directly from its own path data
  // via Pixi's native SVG support, rendered as a low-alpha watermark so the
  // jersey number (below) stays the primary, highest-contrast element.
  const iconFillHex = readableFillHex(discFill);
  const icon = new Graphics();
  // Pixi's SVGParser requires a full <svg> document (it calls querySelectorAll
  // on the parsed root) — a bare <path> fragment throws at runtime.
  icon.svg(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${ICON_VIEWBOX}" height="${ICON_VIEWBOX}" viewBox="0 0 ${ICON_VIEWBOX} ${ICON_VIEWBOX}">` +
      `<path fill-rule="evenodd" clip-rule="evenodd" fill="${iconFillHex}" d="${USER_CIRCLE_PATH}"/>` +
      `</svg>`,
  );
  icon.pivot.set(ICON_VIEWBOX / 2, ICON_VIEWBOX / 2);
  const iconScale = (TOKEN_RADIUS * 2 * ICON_FILL_RATIO) / ICON_VIEWBOX;
  icon.scale.set(iconScale);
  icon.alpha = ICON_WATERMARK_ALPHA;
  token.addChild(icon);

  const safeLabel = label.trim().slice(0, 3) || "?";
  const isNumericLabel = /^\d+$/.test(safeLabel);
  const labelFontSize = isNumericLabel ? (safeLabel.length >= 2 ? 4.6 : 5.1) : 3.4;
  const labelLetterSpacing = isNumericLabel ? 0.04 : 0.1;
  const textResolution =
    typeof window !== "undefined" ? Math.max(2, Math.min(3, window.devicePixelRatio || 1)) : 2;

  const labelText = new Text({
    text: safeLabel,
    style: {
      fill: isNumericLabel ? 0xffffff : resolved.textColor,
      fontSize: labelFontSize,
      fontWeight: isNumericLabel ? "bolder" : "900",
      fontFamily: "\"Barlow Condensed\", \"Inter Tight\", Inter, system-ui, sans-serif",
      align: "center",
      letterSpacing: labelLetterSpacing,
      stroke: {
        color: mixColor(resolved.outlineColor, 0x000000, 0.3),
        width: isNumericLabel ? 1.02 : 0.62,
        join: "round",
      },
    },
  });
  labelText.anchor.set(0.5, 0.5);
  labelText.resolution = textResolution;
  labelText.roundPixels = true;
  token.addChild(labelText);

  return { token, shadow };
}

// Exported for the documentation/README trail and for future automated
// regression checks — not consumed by the renderer itself.
export const HEROICON_USER_CIRCLE_SOURCE = {
  icon: "user-circle",
  variant: "solid",
  size: 24,
  packageVersion: "2.2.0",
  pinnedRef: "https://github.com/tailwindlabs/heroicons/blob/v2.2.0/optimized/24/solid/user-circle.svg",
  license: "MIT",
  licenseUrl: "https://github.com/tailwindlabs/heroicons/blob/v2.2.0/LICENSE",
} as const;
