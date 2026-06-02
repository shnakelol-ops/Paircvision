import type { MovementBoardToken } from "../shell/types";

export type RouteColorStyle = {
  coreColor: number;
  highlightColor: number;
  shadowColor: number;
};

function hslToHex(h: number, s: number, l: number): number {
  const hue = ((h % 360) + 360) % 360;
  const sat = Math.max(0, Math.min(100, s)) / 100;
  const light = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - c / 2;
  let rPrime = 0;
  let gPrime = 0;
  let bPrime = 0;
  if (hue < 60) {
    rPrime = c;
    gPrime = x;
  } else if (hue < 120) {
    rPrime = x;
    gPrime = c;
  } else if (hue < 180) {
    gPrime = c;
    bPrime = x;
  } else if (hue < 240) {
    gPrime = x;
    bPrime = c;
  } else if (hue < 300) {
    rPrime = x;
    bPrime = c;
  } else {
    rPrime = c;
    bPrime = x;
  }
  const r = Math.round((rPrime + m) * 255);
  const g = Math.round((gPrime + m) * 255);
  const b = Math.round((bPrime + m) * 255);
  return (r << 16) | (g << 8) | b;
}

export function routeStyleForToken(token: MovementBoardToken | null): RouteColorStyle {
  if (!token) {
    return {
      coreColor: 0xf59e0b,
      highlightColor: 0xffd8a1,
      shadowColor: 0x1c1205,
    };
  }
  const hueBaseByColor: Record<MovementBoardToken["color"], number> = {
    blue: 210,
    red: 8,
    yellow: 42,
    black: 240,
  };
  const hueOffset = (token.number * 23) % 38;
  const coreHue = hueBaseByColor[token.color] + hueOffset;
  return {
    coreColor: hslToHex(coreHue, 84, 54),
    highlightColor: hslToHex(coreHue + 7, 88, 80),
    shadowColor: hslToHex(coreHue - 8, 44, 14),
  };
}
