import type { NormalizedPoint } from "../../movement-board/coordinates/normalization";
import type { MovementBoardToken } from "../../movement-board/shell/types";

// ── Category ──────────────────────────────────────────────────────────────────

export type TacticalTemplateCategory =
  | "KICKOUT"
  | "ATTACK"
  | "DEFENCE"
  | "PRESS"
  | "COUNTER"
  | "DEMO";

// ── Route ─────────────────────────────────────────────────────────────────────

export type TacticalTemplateRoute = {
  jerseyNumber: number;
  points: NormalizedPoint[];
};

// ── Template ──────────────────────────────────────────────────────────────────

export type TacticalTemplate = {
  id: string;
  name: string;
  category: TacticalTemplateCategory;
  description: string;
  // jersey number (1-15) → normalized position (0-100 each axis)
  positions: Record<number, { x: number; y: number }>;
  // optional movement routes — jersey-number-keyed, resolved to token ids at runtime
  routes?: TacticalTemplateRoute[];
};

// ── Kickout ───────────────────────────────────────────────────────────────────
// Short kickout options with a spread receiving structure.
// Defending end = left (low x). Attacking end = right (high x).
// Traditional GAA numbering: 1=GK, 2=RCB, 3=FB, 4=LCB, 5=RHB, 6=CB, 7=LHB,
// 8=RMid, 9=LMid, 10=RHF, 11=CF, 12=LHF, 13=RCF, 14=FF, 15=LCF.

const kickoutTemplate: TacticalTemplate = {
  id: "kickout",
  name: "Kickout",
  category: "KICKOUT",
  description: "Short kickout shape with a spread receiving structure across three lines.",
  positions: {
    1:  { x: 8,  y: 50 }, // GK  — near own goal, center
    2:  { x: 16, y: 22 }, // RCB — right side, wide short option
    3:  { x: 18, y: 50 }, // FB  — center, short option
    4:  { x: 16, y: 78 }, // LCB — left side, wide short option
    5:  { x: 30, y: 18 }, // RHB — right wing, medium range
    6:  { x: 32, y: 50 }, // CB  — center, medium option
    7:  { x: 30, y: 82 }, // LHB — left wing, medium range
    8:  { x: 48, y: 35 }, // RMid — kickout target zone, right
    9:  { x: 48, y: 65 }, // LMid — kickout target zone, left
    10: { x: 62, y: 26 }, // RHF — pulling right defender
    11: { x: 62, y: 50 }, // CF  — pulling center defender
    12: { x: 62, y: 74 }, // LHF — pulling left defender
    13: { x: 80, y: 22 }, // RCF — pinning right corner back
    14: { x: 80, y: 50 }, // FF  — pinning full back
    15: { x: 80, y: 78 }, // LCF — pinning left corner back
  },
};

// ── Attacking ─────────────────────────────────────────────────────────────────
// Forward unit high and wide, support runners behind.

const attackingTemplate: TacticalTemplate = {
  id: "attacking",
  name: "Attacking",
  category: "ATTACK",
  description: "Forward unit pushed high and wide with support runners in behind.",
  positions: {
    1:  { x: 10, y: 50 }, // GK  — high sweeper position
    2:  { x: 20, y: 22 }, // RCB
    3:  { x: 22, y: 50 }, // FB
    4:  { x: 20, y: 78 }, // LCB
    5:  { x: 38, y: 18 }, // RHB — pushed wide right
    6:  { x: 40, y: 50 }, // CB  — driving through center
    7:  { x: 38, y: 82 }, // LHB — pushed wide left
    8:  { x: 55, y: 38 }, // RMid — advanced right center
    9:  { x: 55, y: 62 }, // LMid — advanced left center
    10: { x: 70, y: 22 }, // RHF — right attack channel
    11: { x: 68, y: 50 }, // CF  — centre half forward
    12: { x: 70, y: 78 }, // LHF — left attack channel
    13: { x: 84, y: 24 }, // RCF — right corner forward
    14: { x: 85, y: 50 }, // FF  — full forward
    15: { x: 84, y: 76 }, // LCF — left corner forward
  },
};

// ── Defensive ─────────────────────────────────────────────────────────────────
// Compact low block with bodies behind the ball.

const defensiveTemplate: TacticalTemplate = {
  id: "defensive",
  name: "Defensive",
  category: "DEFENCE",
  description: "Compact low block — bodies behind the ball, forward unit in first-press positions.",
  positions: {
    1:  { x: 5,  y: 50 }, // GK  — in goal
    2:  { x: 14, y: 25 }, // RCB — tight right
    3:  { x: 15, y: 50 }, // FB  — center compact
    4:  { x: 14, y: 75 }, // LCB — tight left
    5:  { x: 26, y: 22 }, // RHB — narrow right
    6:  { x: 28, y: 50 }, // CB  — second line center
    7:  { x: 26, y: 78 }, // LHB — narrow left
    8:  { x: 40, y: 35 }, // RMid — compact right center
    9:  { x: 40, y: 65 }, // LMid — compact left center
    10: { x: 52, y: 28 }, // RHF — tracking right
    11: { x: 52, y: 50 }, // CF  — holding line
    12: { x: 52, y: 72 }, // LHF — tracking left
    13: { x: 64, y: 30 }, // RCF — first press right
    14: { x: 63, y: 50 }, // FF  — first press center
    15: { x: 64, y: 70 }, // LCF — first press left
  },
};

// ── Demo ──────────────────────────────────────────────────────────────────────
// Forward support movement — attacking shape, 4 converging runs toward goal.
// Player 14 (FF) drives center; 11 (CHF) curves right; 13/15 diagonal cuts inward.

const demoTemplate: TacticalTemplate = {
  id: "demo",
  name: "Demo",
  category: "DEMO",
  description: "Forward support movement — four converging runs from the attacking shape.",
  positions: attackingTemplate.positions,
  routes: [
    {
      jerseyNumber: 14,
      points: [
        { x: 85, y: 50 },
        { x: 90, y: 48 },
        { x: 95, y: 46 },
      ],
    },
    {
      jerseyNumber: 11,
      points: [
        { x: 68, y: 50 },
        { x: 72, y: 42 },
        { x: 78, y: 36 },
        { x: 84, y: 34 },
      ],
    },
    {
      jerseyNumber: 13,
      points: [
        { x: 84, y: 24 },
        { x: 87, y: 32 },
        { x: 91, y: 40 },
      ],
    },
    {
      jerseyNumber: 15,
      points: [
        { x: 84, y: 76 },
        { x: 87, y: 68 },
        { x: 91, y: 60 },
      ],
    },
  ],
};

// ── Registry ──────────────────────────────────────────────────────────────────
// Display order matches the Setup panel button order.
// To add a new template: insert one object here — no other files need changing.

export const TACTICAL_TEMPLATES: TacticalTemplate[] = [
  kickoutTemplate,
  attackingTemplate,
  defensiveTemplate,
  demoTemplate,
];

// ── Helpers ───────────────────────────────────────────────────────────────────

export function applyTemplatePositions(
  tokens: MovementBoardToken[],
  template: TacticalTemplate,
): MovementBoardToken[] {
  return tokens.map((token) => {
    const pos = template.positions[token.number];
    if (!pos) return token;
    return { ...token, position: { x: pos.x, y: pos.y } };
  });
}
