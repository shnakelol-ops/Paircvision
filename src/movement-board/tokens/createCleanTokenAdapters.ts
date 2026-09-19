import { Graphics, type Container } from "pixi.js";

import {
  createCleanTacticalPlayerToken,
  type CleanTacticalPlayerTokenStyle,
} from "../../engine/pixi/createCleanTacticalPlayerToken";
import { createNamePillPlayerToken } from "../../engine/pixi/createNamePillPlayerToken";
import {
  createVisionV3PlayerToken,
  type VisionV3TeamColor,
  type VisionV3KitPattern,
} from "../../engine/pixi/createVisionV3PlayerToken";
import { KIT_COLOR_NUMERIC } from "../../engine/pixi/createTacticalPadLiteSurface";
import type { PremiumPlayerTokenColor } from "./createPremiumPlayerToken";

const PALETTE: Record<PremiumPlayerTokenColor, CleanTacticalPlayerTokenStyle> = {
  blue:   { primaryColor: 0x2563eb, secondaryColor: 0x60a5fa },
  red:    { primaryColor: 0xdc2626, secondaryColor: 0xf87171 },
  yellow: { primaryColor: 0xf2c94c, secondaryColor: 0xfde68a },
  black:  { primaryColor: 0x1f2937, secondaryColor: 0x6b7280 },
  green:  { primaryColor: 0x16a34a, secondaryColor: 0x4ade80 },
  orange: { primaryColor: 0xea580c, secondaryColor: 0xfb923c },
  purple: { primaryColor: 0x7c3aed, secondaryColor: 0xa78bfa },
  white:  { primaryColor: 0xf1f5f9, secondaryColor: 0x9aa3b5 },
};

// VisionV3 supports 6 team colours — map the 2 missing ones to nearest equivalent
const V3_TEAM_COLOR: Record<PremiumPlayerTokenColor, VisionV3TeamColor> = {
  blue:   "blue",
  red:    "red",
  green:  "green",
  yellow: "yellow",
  black:  "black",
  white:  "white",
  orange: "red",
  purple: "blue",
};

// Secondary colour expressed as a hex number for the V3 style override
const V3_SECONDARY_HEX: Record<PremiumPlayerTokenColor, number> = {
  blue:   0x60a5fa,
  red:    0xf87171,
  yellow: 0xfde68a,
  black:  0x6b7280,
  green:  0x4ade80,
  orange: 0xfb923c,
  purple: 0xa78bfa,
  white:  0x9aa3b5,
};

type CleanAdapterInput = {
  color: PremiumPlayerTokenColor;
  secondaryColor?: PremiumPlayerTokenColor;
  number: number;
  label?: string;
  radius: number;
  // PR2B: consumed only by createVisionV3Token below. The other adapters in
  // this file (pixi/phosphor/pill-under) simply don't destructure these, so
  // they are unaffected — Standard Slate never calls through this file at
  // all (it calls createVisionV3PlayerToken directly).
  kitPattern?: VisionV3KitPattern;
  kitPatternColor?: PremiumPlayerTokenColor;
};

type CleanAdapterOutput = {
  token: Container;
  body: Container;
  shadow: Graphics;
  ballMarker: Graphics;
};

function makeCleanTokenFn(variant: "pixi" | "phosphor"): (input: CleanAdapterInput) => CleanAdapterOutput {
  return ({ color, number, label, radius }) => {
    const safeLabel = (label?.trim().slice(0, 3) ?? "") || String(number);
    const visualRadius = variant === "pixi" ? radius * 0.88 : radius;
    const { token, shadow } = createCleanTacticalPlayerToken({
      label: safeLabel,
      style: PALETTE[color],
      radius: visualRadius,
      kitPattern: "plain",
      variant,
    });
    const ballMarker = new Graphics();
    ballMarker
      .circle(0, visualRadius * 1.04, visualRadius * 0.105)
      .fill({ color: 0xffffff })
      .circle(0, visualRadius * 1.04, visualRadius * 0.105)
      .stroke({ color: 0xfbbf24, width: 1.2, alpha: 1 });
    ballMarker.visible = false;
    token.addChild(ballMarker);
    return { token, body: token, shadow, ballMarker };
  };
}

export const createPixiToken = makeCleanTokenFn("pixi");
export const createPhosphorToken = makeCleanTokenFn("phosphor");

export function createUnderPillToken({ color, number, label, radius }: CleanAdapterInput): CleanAdapterOutput {
  const safeLabel = (label?.trim() ?? "") || String(number);
  const { token, shadow } = createNamePillPlayerToken({
    label: safeLabel,
    style: PALETTE[color],
    radius,
    number,
  });
  const safeRadius = Math.max(2.8, radius);
  // Below the circle-anchor + compact pill stack, clear of both.
  const ballMarkerY = safeRadius * 2.5;
  const ballMarker = new Graphics();
  ballMarker
    .circle(0, ballMarkerY, safeRadius * 0.105)
    .fill({ color: 0xffffff })
    .circle(0, ballMarkerY, safeRadius * 0.105)
    .stroke({ color: 0xfbbf24, width: 1.2, alpha: 1 });
  ballMarker.visible = false;
  token.addChild(ballMarker);
  return { token, body: token, shadow, ballMarker };
}

// Game Timing's Vision V3 tokens are corrected here to match Standard
// Slate's exact on-screen token size. Both surfaces share the identical
// underlying geometry constants (Game Timing's TOKEN_RADIUS in
// token-layer.ts and Slate's PLAYER_RADIUS are both 4.1; both go through
// the same createVisionV3PlayerToken, whose internal VISION_V3_SIZE_SCALE
// is 1.06 either way) — so reusing Slate's own visual-scale correction
// (TACTICAL_PLAYER_VISUAL_SCALE = 0.8 in createTacticalPadLiteSurface.ts,
// applied identically to both `radius` and `scale`) reproduces Slate's
// rendered size exactly, by construction, not approximation:
//   naive (radius=4.1, scale=1):      max(2.8,4.1)*1.06*1        = 4.346
//   Slate (radius=4.1*0.8, scale=0.8): max(2.8,3.28)*1.06*0.8    = 2.781
//   Game Timing with this constant:   max(2.8,4.1*0.8)*1.06*0.8 = 2.781
// i.e. naively activating Vision V3 without this constant would render
// Game Timing's tokens ~56% larger in radius than Standard Slate's (4.346
// vs 2.781). This is a presentation-layer-only correction: it does not
// touch TOKEN_RADIUS, hit-testing (setTouchHitArea in token-layer.ts
// derives its hit radius from the unscaled TOKEN_RADIUS constant,
// independent of this value), the small/medium/large size-mode
// multiplier, or any world coordinate.
const GAME_TIMING_VISION_VISUAL_SCALE = 0.8;

export function createVisionV3Token({
  color,
  secondaryColor,
  number,
  label,
  radius,
  kitPattern,
  kitPatternColor,
}: CleanAdapterInput): CleanAdapterOutput {
  // No length slice here (unlike the other adapters in this file) — not
  // because the disc shows more text, but because createVisionV3PlayerToken
  // itself already caps its drawn text to 3 characters
  // (safeLabel = label.trim().slice(0, 3) || "?", untouched by PR2B — the
  // same limit Standard Slate's own Vision V3 tokens have always rendered
  // under). Re-slicing here would just be redundant. The caller
  // (token-layer.ts's resolveTokenDisplayLabel) applies its own bound
  // before this adapter is ever reached, purely as a defensive cap on an
  // arbitrarily long stored name — not a claim that more of it renders.
  const safeLabel = label?.trim() || String(number);
  const teamColor = V3_TEAM_COLOR[color];
  const secHex = secondaryColor != null ? V3_SECONDARY_HEX[secondaryColor] : undefined;
  // Colour-fidelity fix (PR2B revision 3): the disc's own primary colour and
  // its pattern-accent colour must be Slate's canonical, true hex value —
  // never Vision's own internal per-team default (silently duller/darker,
  // see KIT_COLOR_NUMERIC vs DEFAULT_STYLE_BY_TEAM) and never
  // V3_SECONDARY_HEX (a pastel *accent*-tint table, not a true-colour table
  // — using it for kitPatternColor was why patterns rendered as a muddy
  // grey/green smear instead of the selected colour). V3_SECONDARY_HEX is
  // kept only for `secondaryColor` above, an accent field team-kit tokens
  // never actually populate today.
  const primaryColorHex = KIT_COLOR_NUMERIC[color];
  const kitPatternColorHex = kitPatternColor != null ? KIT_COLOR_NUMERIC[kitPatternColor] : undefined;
  const visualRadius = radius * GAME_TIMING_VISION_VISUAL_SCALE;
  const { token, shadow } = createVisionV3PlayerToken({
    label: safeLabel,
    teamColor,
    style: { primaryColor: primaryColorHex, ...(secHex != null ? { secondaryColor: secHex } : null) },
    radius: visualRadius,
    scale: GAME_TIMING_VISION_VISUAL_SCALE,
    kitPattern,
    kitPatternColor: kitPatternColorHex,
  });
  // Ball marker geometry uses the same corrected radius so it stays
  // correctly proportioned/positioned relative to the (now Slate-matched)
  // disc — it is added as a child of `token` below, so it is carried by
  // the same outer container scale automatically.
  const safeRadius = Math.max(2.8, visualRadius);
  const discRadius = safeRadius * 1.06;
  const ballMarker = new Graphics();
  ballMarker
    .circle(0, discRadius * 1.14, safeRadius * 0.105)
    .fill({ color: 0xffffff })
    .circle(0, discRadius * 1.14, safeRadius * 0.105)
    .stroke({ color: 0xfbbf24, width: 1.2, alpha: 1 });
  ballMarker.visible = false;
  token.addChild(ballMarker);
  return { token, body: token, shadow, ballMarker };
}
