import { Graphics, type Container } from "pixi.js";

import {
  createCleanTacticalPlayerToken,
  type CleanTacticalPlayerTokenStyle,
} from "../../engine/pixi/createCleanTacticalPlayerToken";
import { createNamePillPlayerToken } from "../../engine/pixi/createNamePillPlayerToken";
import {
  createVisionV3PlayerToken,
  type VisionV3TeamColor,
} from "../../engine/pixi/createVisionV3PlayerToken";
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

export function createPillToken({ color, number, label, radius }: CleanAdapterInput): CleanAdapterOutput {
  const safeLabel = (label?.trim() ?? "") || String(number);
  const { token, shadow } = createNamePillPlayerToken({
    label: safeLabel,
    style: PALETTE[color],
    radius,
  });
  const safeRadius = Math.max(2.8, radius);
  const ballMarker = new Graphics();
  ballMarker
    .circle(0, safeRadius * 1.4, safeRadius * 0.105)
    .fill({ color: 0xffffff })
    .circle(0, safeRadius * 1.4, safeRadius * 0.105)
    .stroke({ color: 0xfbbf24, width: 1.2, alpha: 1 });
  ballMarker.visible = false;
  token.addChild(ballMarker);
  return { token, body: token, shadow, ballMarker };
}

export function createVisionV3Token({ color, secondaryColor, number, label, radius }: CleanAdapterInput): CleanAdapterOutput {
  const safeLabel = (label?.trim().slice(0, 3) ?? "") || String(number);
  const teamColor = V3_TEAM_COLOR[color];
  const secHex = secondaryColor != null ? V3_SECONDARY_HEX[secondaryColor] : undefined;
  const { token, shadow } = createVisionV3PlayerToken({
    label: safeLabel,
    teamColor,
    style: secHex != null ? { secondaryColor: secHex } : undefined,
    radius,
  });
  const safeRadius = Math.max(2.8, radius);
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
