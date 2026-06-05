import { Graphics, type Container } from "pixi.js";

import {
  createCleanTacticalPlayerToken,
  type CleanTacticalPlayerTokenStyle,
} from "../../engine/pixi/createCleanTacticalPlayerToken";
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
    const { token, shadow } = createCleanTacticalPlayerToken({
      label: safeLabel,
      style: PALETTE[color],
      radius,
      kitPattern: "plain",
      variant,
    });
    const ballMarker = new Graphics();
    ballMarker
      .circle(0, radius * 1.04, radius * 0.105)
      .fill({ color: 0xffffff })
      .circle(0, radius * 1.04, radius * 0.105)
      .stroke({ color: 0xfbbf24, width: 1.2, alpha: 1 });
    ballMarker.visible = false;
    token.addChild(ballMarker);
    return { token, body: token, shadow, ballMarker };
  };
}

export const createPixiToken = makeCleanTokenFn("pixi");
export const createPhosphorToken = makeCleanTokenFn("phosphor");
