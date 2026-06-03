import { Container, Graphics, Text } from "pixi.js";

import { PREMIUM_TOKEN_IDLE_SHADOW_ALPHA, type PremiumPlayerTokenColor } from "./createPremiumPlayerToken";

/**
 * Jersey Token V2 — silhouette derived from ProTaggerMiniJersey.tsx.
 *
 * Source SVG: viewBox "0 0 20 22"
 *   Body path:  M4,21 L4,8 L0,8 L0,4 L4,2 L7,5 L10,8 L13,5 L16,2 L20,4 L20,8 L16,8 L16,21 Z
 *   Collar:     M7,5 L10,8 L13,5 Q10,2 7,5 Z   (approximated as polygon)
 *   Chest band: rect x=4 y=10 w=12 h=3
 *
 * Coordinate transform:  subtract SVG centre (10,11), multiply by (radius / 10).
 * Result is centred at the token container origin, scales with radius.
 *
 * Resulting anatomy:
 *
 *      ___   ___           shoulder stubs  (y ≈ −0.7r … −0.3r)
 *     /  \ /  \
 *    |  ╭─V─╮  |          V-neck collar   (y ≈ −0.9r … −0.3r)
 *    |  │[7]│  |          chest number    (y ≈  0.15r)
 *    |  │═══│  |          secondary stripe (y ≈ −0.1r … +0.2r)
 *    |  │   │  |
 *     \_│   │_/           hem             (y ≈ +1.0r)
 *   ˜˜˜˜˜˜˜˜˜˜˜˜˜         ground shadow
 *
 * No head. No legs. No arms. No anatomy. Team colour + number only.
 *
 * Same return shape as createPremiumPlayerToken — token-layer state system
 * (rotation, ghost, ball carrier, selection ring) unchanged.
 */

const PALETTE: Record<
  PremiumPlayerTokenColor,
  { primary: number; secondary: number }
> = {
  blue:   { primary: 0x2563eb, secondary: 0x1e40af },
  red:    { primary: 0xdc2626, secondary: 0x991b1b },
  yellow: { primary: 0xf2c94c, secondary: 0xd4a021 },
  black:  { primary: 0x111827, secondary: 0x4b5563 },
};

export function createJerseyTokenV2({
  color,
  number,
  label,
  radius,
}: {
  color: PremiumPlayerTokenColor;
  number: number;
  label?: string;
  radius: number;
}): { token: Container; body: Container; shadow: Graphics; ballMarker: Graphics; numberLabel: Text } {
  const { primary, secondary } = PALETTE[color];
  const r = radius;
  // Each SVG unit = r/10 world units, SVG centre (10,11) maps to (0,0).
  const s = r / 10;

  // ── Outer container ──────────────────────────────────────────────────────
  const token = new Container();
  token.eventMode = "static";
  token.cursor = "grab";

  // Ground shadow — in outer container, never rotates
  const shadow = new Graphics();
  shadow
    .ellipse(0, r * 1.10, r * 0.80, r * 0.25)
    .fill({ color: 0x020617, alpha: PREMIUM_TOKEN_IDLE_SHADOW_ALPHA });
  token.addChild(shadow);

  // ── Body container — rotates toward movement heading ─────────────────────
  const body = new Container();
  token.addChild(body);

  const g = new Graphics();
  body.addChild(g);

  // Jersey body + sleeve stubs — primary fill, subtle white border
  // Points converted from SVG: (svgX − 10) * s, (svgY − 11) * s
  g.poly([
    (4  - 10) * s, (21 - 11) * s,  // bottom-left hem
    (4  - 10) * s, (8  - 11) * s,  // left body/sleeve junction
    (0  - 10) * s, (8  - 11) * s,  // left sleeve outer bottom
    (0  - 10) * s, (4  - 11) * s,  // left shoulder outer
    (4  - 10) * s, (2  - 11) * s,  // left shoulder inner
    (7  - 10) * s, (5  - 11) * s,  // left collar
    (10 - 10) * s, (8  - 11) * s,  // V-neck bottom
    (13 - 10) * s, (5  - 11) * s,  // right collar
    (16 - 10) * s, (2  - 11) * s,  // right shoulder inner
    (20 - 10) * s, (4  - 11) * s,  // right shoulder outer
    (20 - 10) * s, (8  - 11) * s,  // right sleeve outer bottom
    (16 - 10) * s, (8  - 11) * s,  // right body/sleeve junction
    (16 - 10) * s, (21 - 11) * s,  // bottom-right hem
  ])
    .fill({ color: primary })
    .stroke({ color: 0xffffff, width: 0.75 * s, alpha: 0.15 });

  // Collar band — secondary colour, polygon approximation of the SVG bezier
  // SVG: M7,5 L10,8 L13,5 Q10,2 7,5 Z  →  approximated as quad
  g.poly([
    (7  - 10) * s, (5  - 11) * s,
    (10 - 10) * s, (8  - 11) * s,
    (13 - 10) * s, (5  - 11) * s,
    (10 - 10) * s, (2  - 11) * s,
  ]).fill({ color: secondary });

  // Chest stripe — secondary colour
  // SVG: rect x=4 y=10 w=12 h=3
  g.rect(
    (4  - 10) * s,   // x  = −0.6r
    (10 - 11) * s,   // y  = −0.1r
    12 * s,          // w  =  1.2r
    3  * s,          // h  =  0.3r
  ).fill({ color: secondary });

  // ── Jersey number — chest centre ─────────────────────────────────────────
  const textResolution =
    typeof window !== "undefined" ? Math.max(2, Math.min(3, window.devicePixelRatio || 1)) : 2;
  const safeLabel = (label?.trim().slice(0, 3) ?? "") || String(number);
  const isNumeric = /^\d+$/.test(safeLabel);
  const fontSize = isNumeric
    ? safeLabel.length >= 2 ? r * 0.84 : r * 1.04
    : r * 0.66;

  const numberLabel = new Text({
    text: safeLabel,
    style: {
      fill: 0xffffff,
      fontSize,
      fontWeight: "900",
      align: "center",
      fontFamily: '"Barlow Condensed", "Inter Tight", Inter, system-ui, sans-serif',
      letterSpacing: isNumeric && safeLabel.length >= 2 ? 0 : 0.1,
      stroke: { color: 0x000000, width: 1.8, join: "round" },
    },
  });
  numberLabel.anchor.set(0.5);
  // Chest position: below the collar/stripe, upper half of jersey body
  numberLabel.position.set(0, r * 0.28);
  numberLabel.resolution = textResolution;
  numberLabel.roundPixels = true;
  body.addChild(numberLabel);

  // ── Ball marker — outer container, never rotates ─────────────────────────
  const ballMarker = new Graphics();
  ballMarker
    .circle(0, r * 1.04, r * 0.105)
    .fill({ color: 0xffffff })
    .circle(0, r * 1.04, r * 0.105)
    .stroke({ color: 0xfbbf24, width: 1.2, alpha: 1 });
  ballMarker.visible = false;
  token.addChild(ballMarker);

  return { token, body, shadow, ballMarker, numberLabel };
}
