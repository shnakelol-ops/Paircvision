import type { Container, Graphics } from "pixi.js";

import {
  createCleanTacticalPlayerToken,
  type CleanTacticalPlayerTokenStyle,
} from "./createCleanTacticalPlayerToken";
import { createMicroAthleteToken, type MicroAthleteKitPattern, type MicroAthleteStyle } from "./createMicroAthleteToken";
import { createNamePillPlayerToken } from "./createNamePillPlayerToken";
import { createPremiumGlowPlayerToken } from "./createPremiumGlowPlayerToken";
import { createHeroiconUserCircleToken } from "./createHeroiconUserCircleToken";
import {
  VISION_V3_SLATE_ART_SCALE,
  createVisionV3PlayerToken,
  type VisionV3KitPattern,
} from "./createVisionV3PlayerToken";
import type { PremiumPlayerTokenColor } from "./createPremiumPlayerToken";

export type PlayerTokenStyle =
  | "vision-v3"
  | "classic"
  | "premium"
  | "pixi"
  | "phosphor"
  | "pill-under"
  | "bib";

/**
 * Styles a coach can pick in the Tactical Slate's Player Tokens menu, in
 * menu order. "classic" (Classic) and "premium" (Heroicon) are retired from
 * the menu but stay valid PlayerTokenStyle values: sanitizePlayerTokenStyle
 * still accepts them and resolvePlayerTokenRenderer still draws them with
 * their original renderers, so nothing that carries one stops rendering and
 * no stored value is rewritten.
 */
export const SELECTABLE_PLAYER_TOKEN_STYLES: readonly PlayerTokenStyle[] = [
  "vision-v3",
  "pixi",
  "phosphor",
  "pill-under",
  "bib",
];

/**
 * Supersampling factor for the Tactical Slate's upgraded token styles
 * (Vision V3, Pixi, Phosphor, Name Badge) — the same factor, and the same
 * inner-art-container approach, as VISION_V3_SLATE_ART_SCALE. Movement-board
 * calls the token factories directly and keeps their default of 1.
 */
const SLATE_TOKEN_ART_SCALE = VISION_V3_SLATE_ART_SCALE;

export type PlayerTokenRendererInput = {
  label: string;
  number: number;
  teamColor: PremiumPlayerTokenColor;
  scale: number;
  style: Partial<MicroAthleteStyle>;
  /**
   * Full six-pattern set. Vision V3, Pixi, Phosphor and Name Badge draw all
   * six (the last three via kitPatternAccent.ts, Vision V3's geometry); the
   * retired Classic and Heroicon renderers receive toLegacyKitPattern(kitPattern).
   */
  kitPattern: VisionV3KitPattern;
  kitPatternColor: number;
  radius: number;
  /**
   * Draw the identity label (number / initials / name). Defaults to true.
   * Only VisionV3Renderer honours false. It was used solely by Training's
   * retired Practice presentation; the Slate no longer passes it.
   */
  showLabel?: boolean;
};

export type PlayerTokenRendererOutput = {
  token: Container;
  shadow: Graphics;
};

export type PlayerTokenRenderer = (input: PlayerTokenRendererInput) => PlayerTokenRendererOutput;

/**
 * The retired Classic and Heroicon token styles (and the unused Premium
 * Glow) only know the original four patterns. Chest Dash and
 * Gradient render as plain on them rather than being
 * silently mis-drawn; the player's stored pattern is untouched.
 */
export function toLegacyKitPattern(pattern: VisionV3KitPattern): MicroAthleteKitPattern {
  return pattern === "chestDash" || pattern === "gradient" ? "plain" : pattern;
}

// "Classic" — retired from the Player Tokens menu; still drawn for the
// "classic" style value and the fallback below (see
// SELECTABLE_PLAYER_TOKEN_STYLES).
export const ClassicRingRenderer: PlayerTokenRenderer = ({
  label,
  teamColor,
  scale,
  style,
  kitPattern,
  kitPatternColor,
}) =>
  createMicroAthleteToken({
    label,
    teamColor,
    scale,
    style,
    kitPattern: toLegacyKitPattern(kitPattern),
    kitPatternColor,
  });

// Retired as of V1.5 — no longer coach-facing (see resolvePlayerTokenRenderer
// below). Kept, unused, only so a revert stays a one-line change if ever
// needed.
export const PremiumGlowRenderer: PlayerTokenRenderer = ({
  label,
  teamColor,
  scale,
  style,
  kitPattern,
  kitPatternColor,
}) =>
  createPremiumGlowPlayerToken({
    label,
    teamColor,
    scale,
    style,
    kitPattern: toLegacyKitPattern(kitPattern),
    kitPatternColor,
  });

// "Heroicon" — retired from the Player Tokens menu; still drawn for the
// "premium" style value (see SELECTABLE_PLAYER_TOKEN_STYLES). Formerly the
// official token style built from the Heroicons "user-circle"
// pictogram (MIT). See createHeroiconUserCircleToken.ts for the source
// verification trail.
export const HeroiconUserCircleRenderer: PlayerTokenRenderer = ({
  label,
  teamColor,
  scale,
  style,
  kitPattern,
  kitPatternColor,
}) =>
  createHeroiconUserCircleToken({
    label,
    teamColor,
    scale,
    style,
    kitPattern: toLegacyKitPattern(kitPattern),
    kitPatternColor,
  });

export const VisionV3Renderer: PlayerTokenRenderer = ({
  label,
  teamColor,
  scale,
  style,
  kitPattern,
  kitPatternColor,
  radius,
  showLabel,
}) =>
  createVisionV3PlayerToken({
    label,
    teamColor,
    radius,
    scale,
    style,
    kitPattern,
    kitPatternColor,
    ...(showLabel === false ? { showLabel: false } : {}),
    // Slate-only supersampling: sharp numbers and smooth rims at desktop
    // zoom. Movement-board calls createVisionV3PlayerToken directly and
    // keeps the default (1).
    artScale: VISION_V3_SLATE_ART_SCALE,
  });

// Bib Token — Vision V3's renderer in its flat "bib" variant: the same disc
// diameter, with a numberless jersey in the team's kit (all six patterns).
// The player's number/label fields are untouched; only the drawing omits them.
export const BibTokenRenderer: PlayerTokenRenderer = ({
  label,
  teamColor,
  scale,
  style,
  kitPattern,
  kitPatternColor,
  radius,
}) =>
  createVisionV3PlayerToken({
    label,
    teamColor,
    radius,
    scale,
    style,
    kitPattern,
    kitPatternColor,
    variant: "bib",
    artScale: VISION_V3_SLATE_ART_SCALE,
  });

export const ProceduralPixiRenderer: PlayerTokenRenderer = ({
  label,
  scale,
  style,
  kitPattern,
  kitPatternColor,
  radius,
}) => {
  const { token, shadow } = createCleanTacticalPlayerToken({
    label,
    style: style as Partial<CleanTacticalPlayerTokenStyle>,
    radius,
    kitPattern,
    kitPatternColor,
    variant: "pixi",
    artScale: SLATE_TOKEN_ART_SCALE,
  });
  token.scale.set(scale);
  return { token, shadow };
};

export const PhosphorRenderer: PlayerTokenRenderer = ({
  label,
  scale,
  style,
  kitPattern,
  kitPatternColor,
  radius,
}) => {
  const { token, shadow } = createCleanTacticalPlayerToken({
    label,
    style: style as Partial<CleanTacticalPlayerTokenStyle>,
    radius,
    kitPattern,
    kitPatternColor,
    variant: "phosphor",
    artScale: SLATE_TOKEN_ART_SCALE,
  });
  token.scale.set(scale);
  return { token, shadow };
};

export const UnderNamePillRenderer: PlayerTokenRenderer = ({
  label,
  number,
  style,
  scale,
  radius,
  kitPattern,
  kitPatternColor,
}) => {
  const { token, shadow } = createNamePillPlayerToken({
    label,
    style: style as Partial<CleanTacticalPlayerTokenStyle>,
    radius,
    number,
    kitPattern,
    kitPatternColor,
    artScale: SLATE_TOKEN_ART_SCALE,
  });
  token.scale.set(scale);
  return { token, shadow };
};

export function resolvePlayerTokenRenderer(style: PlayerTokenStyle): PlayerTokenRenderer {
  if (style === "vision-v3") return VisionV3Renderer;
  // The "premium" style value is unchanged for backwards compatibility with
  // existing saved boards — only which renderer it resolves to has changed,
  // from the retired PremiumGlowRenderer to HeroiconUserCircleRenderer.
  if (style === "premium") return HeroiconUserCircleRenderer;
  if (style === "pixi") return ProceduralPixiRenderer;
  if (style === "phosphor") return PhosphorRenderer;
  if (style === "pill-under") return UnderNamePillRenderer;
  if (style === "bib") return BibTokenRenderer;
  return ClassicRingRenderer;
}

/**
 * A token style stored with a board, or null when the value is missing or
 * unknown (the caller picks the fallback). Unlike sanitizePlayerTokenStyle,
 * it never maps legacy values or defaults.
 */
export function sanitizeStoredPlayerTokenStyle(value: unknown): PlayerTokenStyle | null {
  return typeof value === "string" && sanitizePlayerTokenStyle(value) === value ? (value as PlayerTokenStyle) : null;
}

export function sanitizePlayerTokenStyle(value: unknown): PlayerTokenStyle {
  if (
    value === "vision-v3" ||
    value === "classic" ||
    value === "premium" ||
    value === "pixi" ||
    value === "phosphor" ||
    value === "pill-under" ||
    value === "bib"
  ) {
    return value;
  }
  // Migrate old torso selections to classic so older saved states still render.
  if (value === "torso") return "classic";
  return "vision-v3";
}
