/**
 * pro-event-model.ts
 *
 * PáircVision Pro Tagging — core event type system.
 *
 * ISOLATION RULE:
 *   This file does NOT import from MATCH_EVENT_KINDS or extend MatchEventKind.
 *   The adapter in engine/pro-match-event-adapter.ts handles the bridge.
 *
 * ProEventKind is a superset of events needed across all 4 GAA codes:
 *   - Gaelic Football
 *   - Ladies Football
 *   - Hurling
 *   - Camogie
 *
 * Events are grouped into semantic categories.
 * Not all events are enabled on every sport profile.
 * Sport profiles (sport-profiles/*.ts) define the enabled set per code.
 */

import type { SportProfileId } from "./sport-profile-types";

// ---------------------------------------------------------------------------
// Event Kind
// ---------------------------------------------------------------------------

export const PRO_EVENT_KINDS = [
  // SCORING — universal
  "GOAL",
  "POINT",
  "WIDE",
  "SHOT",
  "FREE_SCORED",
  "FREE_MISSED",

  // SCORING — football/ladies specific
  "TWO_POINTER",
  "FORTY_FIVE_TWO_POINT",

  // RESTARTS — semantic label comes from sport profile
  // "RESTART_WON" means kickout won (football) or puckout won (hurling)
  "RESTART_WON",
  "RESTART_LOST",
  "SHORT_RESTART",
  "LONG_RESTART",

  // POSSESSION
  "TURNOVER_WON",
  "TURNOVER_LOST",
  "POSSESSION_WON",
  "POSSESSION_LOST",

  // FREES
  "FREE_WON",
  "FREE_CONCEDED",

  // DELIVERY / ATTACK
  "DELIVERY_WON",
  "DELIVERY_LOST",
  "INSIDE_BALL_WON",
  "INSIDE_BALL_LOST",

  // FOOTBALL / LADIES FOOTBALL SPECIFIC
  // MARK: player claims a mark from a kickout or kick-pass (20m+).
  // No MatchEventKind equivalent — stays as ProEventKind only.
  "MARK",

  // HURLING / CAMOGIE SPECIFIC
  "BREAK_WON",
  "BREAK_LOST",
  "HOOK",
  "BLOCK",
  "SIXTY_FIVE",    // 65
  "SIDELINE",

  // QUALITY / EFFORT — all codes
  "GOOD_DECISION",
  "BAD_DECISION",
  "GOOD_PASS",
  "BAD_PASS",
  "WORK_RATE_PLUS",
  "WORK_RATE_MINUS",
  "REPEATED_MISTAKE",
] as const;

export type ProEventKind = (typeof PRO_EVENT_KINDS)[number];

// ---------------------------------------------------------------------------
// Event Category — for keyboard grouping and reporting
// ---------------------------------------------------------------------------

export type ProEventCategory =
  | "scoring"
  | "restarts"
  | "possession"
  | "frees"
  | "delivery"
  | "football-specific"
  | "hurling-specific"
  | "effort";

export const PRO_EVENT_CATEGORY_MAP: Record<ProEventKind, ProEventCategory> = {
  GOAL:                 "scoring",
  POINT:                "scoring",
  WIDE:                 "scoring",
  SHOT:                 "scoring",
  FREE_SCORED:          "scoring",
  FREE_MISSED:          "scoring",
  TWO_POINTER:          "scoring",
  FORTY_FIVE_TWO_POINT: "scoring",
  MARK:                 "football-specific",
  RESTART_WON:          "restarts",
  RESTART_LOST:         "restarts",
  SHORT_RESTART:        "restarts",
  LONG_RESTART:         "restarts",
  TURNOVER_WON:         "possession",
  TURNOVER_LOST:        "possession",
  POSSESSION_WON:       "possession",
  POSSESSION_LOST:      "possession",
  FREE_WON:             "frees",
  FREE_CONCEDED:        "frees",
  DELIVERY_WON:         "delivery",
  DELIVERY_LOST:        "delivery",
  INSIDE_BALL_WON:      "delivery",
  INSIDE_BALL_LOST:     "delivery",
  BREAK_WON:            "hurling-specific",
  BREAK_LOST:           "hurling-specific",
  HOOK:                 "hurling-specific",
  BLOCK:                "hurling-specific",
  SIXTY_FIVE:           "hurling-specific",
  SIDELINE:             "hurling-specific",
  GOOD_DECISION:        "effort",
  BAD_DECISION:         "effort",
  GOOD_PASS:            "effort",
  BAD_PASS:             "effort",
  WORK_RATE_PLUS:       "effort",
  WORK_RATE_MINUS:      "effort",
  REPEATED_MISTAKE:     "effort",
};

// ---------------------------------------------------------------------------
// Possession boundary classification
// (used by possession-engine to determine possession start/end)
// ---------------------------------------------------------------------------

export type PossessionStartReason =
  | "RESTART_WON"
  | "TURNOVER_WON"
  | "POSSESSION_WON"
  | "BREAK_WON"
  | "FREE_WON"
  | "DELIVERY_WON"
  | "MARK"
  | "MATCH_START";

export type PossessionEndReason =
  | "SCORE"
  | "SHOT_MISSED"
  | "TURNOVER_LOST"
  | "FREE_CONCEDED"
  | "POSSESSION_LOST"
  | "PERIOD_END"
  | "RESTART_AGAINST";

export const POSSESSION_START_KINDS: ReadonlySet<ProEventKind> = new Set<ProEventKind>([
  "RESTART_WON",
  "TURNOVER_WON",
  "POSSESSION_WON",
  "BREAK_WON",
  "FREE_WON",
  "DELIVERY_WON",
  "MARK",  // a mark = ball won + free position
]);

export const POSSESSION_END_KINDS: ReadonlySet<ProEventKind> = new Set<ProEventKind>([
  "GOAL",
  "POINT",
  "TWO_POINTER",
  "FORTY_FIVE_TWO_POINT",
  "FREE_SCORED",
  "WIDE",
  "FREE_MISSED",
  "TURNOVER_LOST",
  "FREE_CONCEDED",
  "POSSESSION_LOST",
  "RESTART_LOST",
]);

export const SCORING_KINDS: ReadonlySet<ProEventKind> = new Set<ProEventKind>([
  "GOAL",
  "POINT",
  "TWO_POINTER",
  "FORTY_FIVE_TWO_POINT",
  "FREE_SCORED",
]);

export const SHOT_OR_SCORE_KINDS: ReadonlySet<ProEventKind> = new Set<ProEventKind>([
  "GOAL",
  "POINT",
  "TWO_POINTER",
  "FORTY_FIVE_TWO_POINT",
  "FREE_SCORED",
  "WIDE",
  "SHOT",
  "FREE_MISSED",
]);

// ---------------------------------------------------------------------------
// ProEvent — the core logged event shape
// ---------------------------------------------------------------------------

export type ProEvent = {
  /** Unique event id */
  id: string;
  /** Pro event kind — superset of MatchEventKind */
  proKind: ProEventKind;
  /** Mapped MatchEventKind for legacy chain engine compatibility (null if unmapped) */
  mappedKind: string | null;
  /** Normalised pitch x (0–1, left = defensive goal) */
  nx: number;
  /** Normalised pitch y (0–1, top touchline) */
  ny: number;
  /** Match half */
  half: 1 | 2;
  /** Period — always derived and set (not optional unlike MatchEvent) */
  period: "1H" | "2H";
  /** Segment 1–6 — always derived and set */
  segment: 1 | 2 | 3 | 4 | 5 | 6;
  /** Wall clock ms since epoch at event creation */
  timestamp: number;
  /** Match clock seconds at event creation */
  matchClockSeconds: number;
  /** Team side — always set in Pro (not optional unlike MatchEvent) */
  teamSide: "FOR" | "OPP";
  /** Sport profile this event was logged under */
  sportProfile: SportProfileId;
  /** Player attribution — optional (analyst can skip) */
  playerId?: string | null;
  playerName?: string | null;
  playerNumber?: number | null;
  /** Optional chip metadata — enrichment only, event already saved before chips */
  tags?: string[] | null;
  /** Possession linkage — set by possession engine post-capture */
  possessionId?: string | null;
};

// ---------------------------------------------------------------------------
// ProPlayer — player shape for the Pro picker
// ---------------------------------------------------------------------------

export type ProPlayer = {
  id: string;
  number: number;
  name: string;
  role: "STARTER" | "SUB";
  isActive: boolean;
};

// ---------------------------------------------------------------------------
// ProSession — complete session state
// ---------------------------------------------------------------------------

export type ProSessionState = {
  id: string;
  createdAt: number;
  updatedAt: number;
  homeTeamName: string;
  awayTeamName: string;
  venueName: string;
  sportProfile: SportProfileId;
  /** Which side the home team is (always FOR in Pro V1) */
  homeSide: "FOR";
  attackingDirection: "LEFT" | "RIGHT";
  half: 1 | 2;
  matchClockSeconds: number;
  isRunning: boolean;
  hasStarted: boolean;
  players: readonly ProPlayer[];
  events: readonly ProEvent[];
  activePlayerId: string | null;
};
