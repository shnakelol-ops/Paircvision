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

export type TacticalTemplateSport = "football" | "hurling" | "both";

export type TacticalTemplateSituation =
  | "restart"
  | "attack"
  | "defence"
  | "press"
  | "demo";

// ── Route ─────────────────────────────────────────────────────────────────────

export type TacticalTemplateRoute = {
  jerseyNumber: number;
  points: NormalizedPoint[];
};

// ── Template ──────────────────────────────────────────────────────────────────

export type TacticalTemplate = {
  id: string;
  name: string;
  sport: TacticalTemplateSport;
  situation: TacticalTemplateSituation;
  // Legacy grouping retained while older internal references are phased out.
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
  name: "Short Kickout",
  sport: "football",
  situation: "restart",
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
  name: "Attacking Shape",
  sport: "football",
  situation: "attack",
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
  sport: "both",
  situation: "defence",
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
  sport: "both",
  situation: "demo",
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

// ── Kickout: Flat 4 ───────────────────────────────────────────────────────────
// Four players (5, 8, 9, 7) spread flat across midfield at x=50.
// Backs hold deep, forwards pin opposition corner backs.

const kickoutFlat4Template: TacticalTemplate = {
  id: "kickout-flat-4",
  name: "Flat 4",
  sport: "football",
  situation: "restart",
  category: "KICKOUT",
  description: "Four players spread in a flat line across midfield — creates a width option from every angle.",
  positions: {
    1:  { x: 8,  y: 50 }, // GK
    2:  { x: 18, y: 22 }, // RCB
    3:  { x: 20, y: 50 }, // FB
    4:  { x: 18, y: 78 }, // LCB
    5:  { x: 50, y: 13 }, // RHB — flat 4, far right
    6:  { x: 36, y: 50 }, // CB  — sitting behind flat 4
    7:  { x: 50, y: 87 }, // LHB — flat 4, far left
    8:  { x: 50, y: 35 }, // RMid — flat 4, right center
    9:  { x: 50, y: 65 }, // LMid — flat 4, left center
    10: { x: 64, y: 26 }, // RHF — pulling defender
    11: { x: 64, y: 50 }, // CF  — pulling center
    12: { x: 64, y: 74 }, // LHF — pulling defender
    13: { x: 80, y: 22 }, // RCF — pinning right corner back
    14: { x: 80, y: 50 }, // FF  — pinning full back
    15: { x: 80, y: 78 }, // LCF — pinning left corner back
  },
};

// ── Kickout: Cluster & Break ───────────────────────────────────────────────────
// Midfielders and half-forwards cluster tightly in the 45 area to draw
// opposition, then quickly break to wide space on kick.

const kickoutClusterBreakTemplate: TacticalTemplate = {
  id: "kickout-cluster-break",
  name: "Long Kickout",
  sport: "football",
  situation: "restart",
  category: "KICKOUT",
  description: "Tight cluster in the 45 draws opposition — forwards break wide the moment the kick is struck.",
  positions: {
    1:  { x: 8,  y: 50 }, // GK
    2:  { x: 18, y: 22 }, // RCB
    3:  { x: 20, y: 50 }, // FB
    4:  { x: 18, y: 78 }, // LCB
    5:  { x: 32, y: 18 }, // RHB — wide right outlet
    6:  { x: 38, y: 50 }, // CB  — base of cluster
    7:  { x: 32, y: 82 }, // LHB — wide left outlet
    8:  { x: 50, y: 40 }, // RMid — cluster right
    9:  { x: 50, y: 60 }, // LMid — cluster left
    10: { x: 48, y: 28 }, // RHF — cluster edge right
    11: { x: 52, y: 50 }, // CF  — cluster center
    12: { x: 48, y: 72 }, // LHF — cluster edge left
    13: { x: 76, y: 22 }, // RCF — wide break target right
    14: { x: 78, y: 50 }, // FF  — deep forward
    15: { x: 76, y: 78 }, // LCF — wide break target left
  },
};

// ── Kickout: Midfield Contest ──────────────────────────────────────────────────
// Direct 2v2 midfield battle — 8 and 9 own the contest zone with 6 as
// a tight support option. Forwards stay wide to pin backs.

const kickoutMidfieldContestTemplate: TacticalTemplate = {
  id: "kickout-midfield-contest",
  name: "Midfield Contest",
  sport: "football",
  situation: "restart",
  category: "KICKOUT",
  description: "Clean midfield battle — 8 and 9 contest directly, 6 provides close support.",
  positions: {
    1:  { x: 8,  y: 50 }, // GK
    2:  { x: 18, y: 22 }, // RCB
    3:  { x: 20, y: 50 }, // FB
    4:  { x: 18, y: 78 }, // LCB
    5:  { x: 30, y: 18 }, // RHB
    6:  { x: 40, y: 50 }, // CB  — close support behind 8/9
    7:  { x: 30, y: 82 }, // LHB
    8:  { x: 52, y: 36 }, // RMid — primary contest, right
    9:  { x: 52, y: 64 }, // LMid — primary contest, left
    10: { x: 64, y: 24 }, // RHF — wide right, stretching defence
    11: { x: 60, y: 50 }, // CF  — just ahead of midfield
    12: { x: 64, y: 76 }, // LHF — wide left, stretching defence
    13: { x: 80, y: 22 }, // RCF — pinning right corner back
    14: { x: 80, y: 50 }, // FF  — pinning full back
    15: { x: 80, y: 78 }, // LCF — pinning left corner back
  },
};

// ── Attack: Umbrella ──────────────────────────────────────────────────────────
// Forward and midfield unit spread in a wide arc from right to left.
// Creates space at the apex and overloads wide channels simultaneously.

const attackUmbrellaTemplate: TacticalTemplate = {
  id: "attack-umbrella",
  name: "Umbrella",
  sport: "football",
  situation: "attack",
  category: "ATTACK",
  description: "Wide arc from right wing to left wing — overloads wide channels and creates the apex scoring run.",
  positions: {
    1:  { x: 10, y: 50 }, // GK
    2:  { x: 20, y: 22 }, // RCB
    3:  { x: 22, y: 50 }, // FB
    4:  { x: 20, y: 78 }, // LCB
    5:  { x: 42, y: 11 }, // RHB — far right arc
    6:  { x: 46, y: 50 }, // CB  — center arc support
    7:  { x: 42, y: 89 }, // LHB — far left arc
    8:  { x: 56, y: 27 }, // RMid — right arc
    9:  { x: 56, y: 73 }, // LMid — left arc
    10: { x: 68, y: 15 }, // RHF — wide right forward
    11: { x: 64, y: 50 }, // CF  — apex of arc
    12: { x: 68, y: 85 }, // LHF — wide left forward
    13: { x: 82, y: 24 }, // RCF — right corner
    14: { x: 85, y: 50 }, // FF  — full forward, center
    15: { x: 82, y: 76 }, // LCF — left corner
  },
};

// ── Attack: Channel Overload ───────────────────────────────────────────────────
// Stack right channel with numbers (5, 8, 10, 13) while 14 and 11 hold
// center. Left side remains as a pressure release valve.

const attackChannelOverloadTemplate: TacticalTemplate = {
  id: "attack-channel-overload",
  name: "Channel Overload",
  sport: "football",
  situation: "attack",
  category: "ATTACK",
  description: "Right channel flooded with runners — draw defenders across then switch to isolated left side.",
  positions: {
    1:  { x: 10, y: 50 }, // GK
    2:  { x: 22, y: 18 }, // RCB — pushed right
    3:  { x: 24, y: 50 }, // FB
    4:  { x: 22, y: 78 }, // LCB
    5:  { x: 44, y: 10 }, // RHB — far right channel
    6:  { x: 46, y: 42 }, // CB  — right of center
    7:  { x: 42, y: 76 }, // LHB
    8:  { x: 58, y: 16 }, // RMid — right channel runner
    9:  { x: 56, y: 62 }, // LMid — left, release valve
    10: { x: 70, y: 10 }, // RHF — far right overload
    11: { x: 68, y: 44 }, // CF  — right of center forward
    12: { x: 68, y: 80 }, // LHF — isolated left
    13: { x: 84, y: 14 }, // RCF — deep right overload
    14: { x: 84, y: 44 }, // FF  — right center forward
    15: { x: 84, y: 78 }, // LCF — isolated left corner
  },
};

// ── Hurling/Camogie Attack: language-only V1 templates ───────────────────────
// These deliberately reuse the current placeholder layouts. A later tactical
// content PR can tune positions, ball starts, routes, and opposition shape.

const hurlingHalfBackOutletTemplate: TacticalTemplate = {
  id: "hurling-half-back-outlet",
  name: "Half-Back Outlet",
  sport: "hurling",
  situation: "attack",
  category: "ATTACK",
  description: "Half-back line available as the first outlet, with midfield and forwards held as link options.",
  positions: attackingTemplate.positions,
};

const hurlingWingChannelAttackTemplate: TacticalTemplate = {
  id: "hurling-wing-channel-attack",
  name: "Wing Channel Attack",
  sport: "hurling",
  situation: "attack",
  category: "ATTACK",
  description: "Attack shape set to work the wing channel, with inside support ready for the next ball.",
  positions: attackChannelOverloadTemplate.positions,
};

const hurlingDiagonalBallTemplate: TacticalTemplate = {
  id: "hurling-diagonal-ball",
  name: "Diagonal Ball",
  sport: "hurling",
  situation: "attack",
  category: "ATTACK",
  description: "Forward line set to receive a diagonal ball, with support held underneath for the break.",
  positions: attackUmbrellaTemplate.positions,
};

// ── Defence: Sweeper ──────────────────────────────────────────────────────────
// 6 (CB) drops behind the full-back line as a free sweeper.
// The remaining 14 condense into a compact two-block shape in front.

const defenceSweepTemplate: TacticalTemplate = {
  id: "defence-sweeper",
  name: "Sweeper",
  sport: "both",
  situation: "defence",
  category: "DEFENCE",
  description: "CB drops as a free sweeper behind the full-back line — covers space and cleans up loose ball.",
  positions: {
    1:  { x: 5,  y: 50 }, // GK
    2:  { x: 14, y: 24 }, // RCB — tight right
    3:  { x: 15, y: 50 }, // FB  — center
    4:  { x: 14, y: 76 }, // LCB — tight left
    5:  { x: 28, y: 20 }, // RHB — narrow right
    6:  { x: 10, y: 50 }, // CB  — SWEEPER, drops behind FBs
    7:  { x: 28, y: 80 }, // LHB — narrow left
    8:  { x: 40, y: 33 }, // RMid — compact right center
    9:  { x: 40, y: 67 }, // LMid — compact left center
    10: { x: 52, y: 26 }, // RHF — tracking right
    11: { x: 52, y: 50 }, // CF  — holding line
    12: { x: 52, y: 74 }, // LHF — tracking left
    13: { x: 64, y: 28 }, // RCF — first press right
    14: { x: 63, y: 50 }, // FF  — first press center
    15: { x: 64, y: 72 }, // LCF — first press left
  },
};

// ── Defence: Arc ──────────────────────────────────────────────────────────────
// All players form a D-arc shape protecting the central scoring zone.
// Compact from GK to FF — no gaps through the middle.

const defenceArcTemplate: TacticalTemplate = {
  id: "defence-arc",
  name: "Arc Defence",
  sport: "both",
  situation: "defence",
  category: "DEFENCE",
  description: "D-shaped arc floods the central scoring zone — forces play wide and eliminates through-balls.",
  positions: {
    1:  { x: 5,  y: 50 }, // GK — in goal
    2:  { x: 12, y: 30 }, // RCB — arc base right
    3:  { x: 12, y: 50 }, // FB  — arc base center
    4:  { x: 12, y: 70 }, // LCB — arc base left
    5:  { x: 22, y: 20 }, // RHB — arc right
    6:  { x: 24, y: 50 }, // CB  — arc center
    7:  { x: 22, y: 80 }, // LHB — arc left
    8:  { x: 36, y: 26 }, // RMid — arc right mid
    9:  { x: 36, y: 74 }, // LMid — arc left mid
    10: { x: 46, y: 20 }, // RHF — outer right arc
    11: { x: 48, y: 50 }, // CF  — arc center, highest
    12: { x: 46, y: 80 }, // LHF — outer left arc
    13: { x: 56, y: 28 }, // RCF — arc tip right
    14: { x: 57, y: 50 }, // FF  — furthest forward
    15: { x: 56, y: 72 }, // LCF — arc tip left
  },
};

// ── Press: Full Press ─────────────────────────────────────────────────────────
// Extreme high press — all 14 outfield players pushed into opposition half.
// GK acts as sweeper at x=18 to cover the space left behind.

const pressFullPressTemplate: TacticalTemplate = {
  id: "press-full-press",
  name: "Full Press",
  sport: "both",
  situation: "press",
  category: "PRESS",
  description: "All 14 outfield players push into opposition half — GK sweeps behind to cover the vacated space.",
  positions: {
    1:  { x: 18, y: 50 }, // GK  — sweeper behind press
    2:  { x: 34, y: 22 }, // RCB — pushed right
    3:  { x: 36, y: 50 }, // FB  — pushed center
    4:  { x: 34, y: 78 }, // LCB — pushed left
    5:  { x: 52, y: 16 }, // RHB — high right
    6:  { x: 54, y: 50 }, // CB  — pressing midfield center
    7:  { x: 52, y: 84 }, // LHB — high left
    8:  { x: 66, y: 30 }, // RMid — high right center
    9:  { x: 66, y: 70 }, // LMid — high left center
    10: { x: 76, y: 22 }, // RHF — pressing
    11: { x: 74, y: 50 }, // CF  — pressing center
    12: { x: 76, y: 78 }, // LHF — pressing
    13: { x: 86, y: 26 }, // RCF — very high right
    14: { x: 86, y: 50 }, // FF  — very high center
    15: { x: 86, y: 74 }, // LCF — very high left
  },
};

// ── Press: Funnel Press ───────────────────────────────────────────────────────
// Diagonal press shape that channels the ball-carrier toward the right
// touchline. Right side packed; left side passive and covering.

const pressFunnelPressTemplate: TacticalTemplate = {
  id: "press-funnel-press",
  name: "Funnel Press",
  sport: "both",
  situation: "press",
  category: "PRESS",
  description: "Diagonal press funnels play to the right sideline — trap, turn over, counter from a packed right side.",
  positions: {
    1:  { x: 12, y: 50 }, // GK  — slightly forward as sweeper
    2:  { x: 26, y: 18 }, // RCB — pressing right
    3:  { x: 28, y: 44 }, // FB  — shifted right of center
    4:  { x: 24, y: 70 }, // LCB — dropping left
    5:  { x: 42, y: 12 }, // RHB — high right
    6:  { x: 44, y: 44 }, // CB  — right of center
    7:  { x: 38, y: 76 }, // LHB — dropping left
    8:  { x: 58, y: 18 }, // RMid — high right channel
    9:  { x: 54, y: 62 }, // LMid — passive left
    10: { x: 70, y: 12 }, // RHF — very high right
    11: { x: 66, y: 46 }, // CF  — right of center
    12: { x: 62, y: 76 }, // LHF — dropping left
    13: { x: 82, y: 18 }, // RCF — highest right
    14: { x: 80, y: 46 }, // FF  — right center
    15: { x: 76, y: 76 }, // LCF — angled left
  },
};

// ── Hurling/Camogie Restart: Short Puckout ───────────────────────────────────
// Goalkeeper has close puckout options, half-backs show wide, and midfield
// staggers for the second ball. Shared by Hurling and Camogie.

const hurlingShortPuckoutTemplate: TacticalTemplate = {
  id: "hurling-short-puckout",
  name: "Short Puckout",
  sport: "hurling",
  situation: "restart",
  category: "KICKOUT",
  description: "Short puckout shape with split backs, wide half-backs, and midfield staggered for the next ball.",
  positions: {
    1:  { x: 8,  y: 50 }, // GK
    2:  { x: 17, y: 24 }, // RCB - close right option
    3:  { x: 18, y: 50 }, // FB  - central short option
    4:  { x: 17, y: 76 }, // LCB - close left option
    5:  { x: 32, y: 18 }, // RHB - wide outlet
    6:  { x: 34, y: 50 }, // CB  - central outlet
    7:  { x: 32, y: 82 }, // LHB - wide outlet
    8:  { x: 48, y: 38 }, // RMid - second-ball support
    9:  { x: 50, y: 62 }, // LMid - staggered support
    10: { x: 62, y: 24 }, // RHF - holds channel
    11: { x: 62, y: 50 }, // CF  - centre link
    12: { x: 62, y: 76 }, // LHF - holds channel
    13: { x: 80, y: 24 }, // RCF - high right
    14: { x: 80, y: 50 }, // FF
    15: { x: 80, y: 76 }, // LCF - high left
  },
};

// ── Hurling/Camogie Restart: Puckout Contest ─────────────────────────────────
// Direct puckout contest through midfield with half-forward support underneath.

const hurlingPuckoutContestTemplate: TacticalTemplate = {
  id: "hurling-puckout-contest",
  name: "Puckout Contest",
  sport: "hurling",
  situation: "restart",
  category: "KICKOUT",
  description: "Direct puckout contest with midfield up, half-forwards underneath, and backs held for cover.",
  positions: {
    1:  { x: 8,  y: 50 }, // GK
    2:  { x: 18, y: 24 }, // RCB
    3:  { x: 19, y: 50 }, // FB
    4:  { x: 18, y: 76 }, // LCB
    5:  { x: 30, y: 18 }, // RHB
    6:  { x: 35, y: 50 }, // CB  - cover
    7:  { x: 30, y: 82 }, // LHB
    8:  { x: 54, y: 40 }, // RMid - contest
    9:  { x: 54, y: 60 }, // LMid - contest
    10: { x: 58, y: 28 }, // RHF - break support
    11: { x: 60, y: 50 }, // CF  - underneath
    12: { x: 58, y: 72 }, // LHF - break support
    13: { x: 78, y: 24 }, // RCF
    14: { x: 78, y: 50 }, // FF
    15: { x: 78, y: 76 }, // LCF
  },
};

// ── Hurling/Camogie Restart: Break Ball ──────────────────────────────────────
// Compress around the landing zone with inside and outside players ready for
// the broken ball.

const hurlingBreakBallTemplate: TacticalTemplate = {
  id: "hurling-break-ball",
  name: "Break Ball",
  sport: "hurling",
  situation: "restart",
  category: "KICKOUT",
  description: "Compact puckout contest shape with players set inside and outside the landing zone for the break.",
  positions: {
    1:  { x: 8,  y: 50 }, // GK
    2:  { x: 18, y: 26 }, // RCB
    3:  { x: 18, y: 50 }, // FB
    4:  { x: 18, y: 74 }, // LCB
    5:  { x: 34, y: 24 }, // RHB
    6:  { x: 40, y: 50 }, // CB  - base support
    7:  { x: 34, y: 76 }, // LHB
    8:  { x: 51, y: 43 }, // RMid - contest edge
    9:  { x: 51, y: 57 }, // LMid - contest edge
    10: { x: 55, y: 34 }, // RHF - outside break
    11: { x: 57, y: 50 }, // CF  - under break
    12: { x: 55, y: 66 }, // LHF - outside break
    13: { x: 72, y: 28 }, // RCF
    14: { x: 74, y: 50 }, // FF
    15: { x: 72, y: 72 }, // LCF
  },
};

// ── Hurling/Camogie Restart: Wing Channel ────────────────────────────────────
// Opens one wing channel while the middle line protects the break.

const hurlingWingChannelTemplate: TacticalTemplate = {
  id: "hurling-wing-channel",
  name: "Wing Channel",
  sport: "hurling",
  situation: "restart",
  category: "KICKOUT",
  description: "Wing-channel puckout with the half-back and wing-forward showing wide while midfield protects inside.",
  positions: {
    1:  { x: 8,  y: 50 }, // GK
    2:  { x: 17, y: 24 }, // RCB
    3:  { x: 19, y: 50 }, // FB
    4:  { x: 17, y: 76 }, // LCB
    5:  { x: 38, y: 13 }, // RHB - channel receiver
    6:  { x: 35, y: 48 }, // CB  - inside cover
    7:  { x: 30, y: 80 }, // LHB - balance
    8:  { x: 50, y: 30 }, // RMid - inside support
    9:  { x: 48, y: 60 }, // LMid - cover
    10: { x: 63, y: 12 }, // RHF - wide channel
    11: { x: 62, y: 48 }, // CF  - link
    12: { x: 61, y: 74 }, // LHF - far-side hold
    13: { x: 80, y: 20 }, // RCF
    14: { x: 80, y: 50 }, // FF
    15: { x: 80, y: 76 }, // LCF
  },
};

// ── Registry ──────────────────────────────────────────────────────────────────
// Display order matches the Setup panel button order.
// To add a new template: insert one object here — no other files need changing.

export const TACTICAL_TEMPLATES: TacticalTemplate[] = [
  kickoutTemplate,
  kickoutFlat4Template,
  kickoutClusterBreakTemplate,
  kickoutMidfieldContestTemplate,
  hurlingShortPuckoutTemplate,
  hurlingPuckoutContestTemplate,
  hurlingBreakBallTemplate,
  hurlingWingChannelTemplate,
  attackingTemplate,
  attackUmbrellaTemplate,
  attackChannelOverloadTemplate,
  hurlingHalfBackOutletTemplate,
  hurlingWingChannelAttackTemplate,
  hurlingDiagonalBallTemplate,
  defensiveTemplate,
  defenceSweepTemplate,
  defenceArcTemplate,
  pressFullPressTemplate,
  pressFunnelPressTemplate,
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
