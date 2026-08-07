import type { Container, Graphics } from "pixi.js";

import {
  createCleanTacticalPlayerToken,
  type CleanTacticalPlayerTokenStyle,
} from "./createCleanTacticalPlayerToken";
import { createMicroAthleteToken, type MicroAthleteKitPattern, type MicroAthleteStyle } from "./createMicroAthleteToken";
import { createNamePillPlayerToken } from "./createNamePillPlayerToken";
import { createPremiumGlowPlayerToken } from "./createPremiumGlowPlayerToken";
import { createHeroiconUserCircleToken } from "./createHeroiconUserCircleToken";
import { createVisionV3PlayerToken } from "./createVisionV3PlayerToken";
import type { PremiumPlayerTokenColor } from "./createPremiumPlayerToken";

export type PlayerTokenStyle =
  | "vision-v3"
  | "classic"
  | "premium"
  | "pixi"
  | "phosphor"
  | "pill-under";

export type PlayerTokenRendererInput = {
  label: string;
  number: number;
  teamColor: PremiumPlayerTokenColor;
  scale: number;
  style: Partial<MicroAthleteStyle>;
  kitPattern: MicroAthleteKitPattern;
  kitPatternColor: number;
  radius: number;
};

export type PlayerTokenRendererOutput = {
  token: Container;
  shadow: Graphics;
};

export type PlayerTokenRenderer = (input: PlayerTokenRendererInput) => PlayerTokenRendererOutput;

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
    kitPattern,
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
    kitPattern,
    kitPatternColor,
  });

// "Heroicon" — official token style built from the Heroicons "user-circle"
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
    kitPattern,
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
}) =>
  createVisionV3PlayerToken({
    label,
    teamColor,
    radius,
    scale,
    style,
    kitPattern,
    kitPatternColor,
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
  return ClassicRingRenderer;
}

export function sanitizePlayerTokenStyle(value: unknown): PlayerTokenStyle {
  if (
    value === "vision-v3" ||
    value === "classic" ||
    value === "premium" ||
    value === "pixi" ||
    value === "phosphor" ||
    value === "pill-under"
  ) {
    return value;
  }
  // Migrate old torso selections to classic so older saved states still render.
  if (value === "torso") return "classic";
  return "vision-v3";
}
