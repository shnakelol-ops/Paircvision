/**
 * chain-rules.ts
 *
 * Deterministic, rule-based tactical sequence definitions for PáircVision.
 *
 * Rules are PURE DATA — no logic lives here.
 * The chain engine (chain-engine.ts) processes all rules identically.
 * New rules can be added here without touching the engine.
 *
 * Rule authoring guide:
 *   - Each rule is a named sequence of steps.
 *   - Step 0 is the "anchor" — the triggering event.
 *   - Subsequent steps look forward in time from the anchor.
 *   - Side is relative to the anchor's teamSide unless "FOR"/"OPP" is absolute.
 *   - Use "ANY" for the anchor step to detect both FOR and OPP perspectives.
 *   - Use "SAME" for follow-up steps that should match the anchor's teamSide.
 *   - Use "OPPOSITE" for follow-up steps that should match the other team.
 *   - maxGapSeconds: hard cap between consecutive steps (uses clock data when available).
 *   - maxWindowSeconds: hard cap from anchor to final step.
 *
 * Current rules (Phase 1):
 *   KICKOUT_TO_SCORE              — won kickout leads to a score
 *   KICKOUT_LOST_TO_SCORE_AGAINST — conceded kickout, opposition scored
 *   TURNOVER_TO_SCORE             — won turnover leads to a score
 *   TURNOVER_TO_SHOT              — won turnover leads to any shot attempt
 *   FREE_WON_TO_GOAL              — free kick won and converted to a goal
 *
 * Future rules to add here (Phase 2+):
 *   KICKOUT_TO_TURNOVER_LOST      — won kickout but then lost possession via turnover
 *   TURNOVER_TO_TURNOVER          — rapid back-to-back turnover exchanges
 *   FREE_WON_TO_WIDE              — free conceded but no score
 *   MOMENTUM_RUN_3                — 3+ consecutive scores same side (handled by scoring run builder)
 */

import type { ChainRule } from "./chain-types";

const SCORE_KINDS = new Set([
  "GOAL",
  "POINT",
  "TWO_POINTER",
  "FORTY_FIVE_TWO_POINT",
  "FREE_SCORED",
] as const);

const SHOT_AND_SCORE_KINDS = new Set([
  "GOAL",
  "POINT",
  "TWO_POINTER",
  "FORTY_FIVE_TWO_POINT",
  "FREE_SCORED",
  "SHOT",
  "WIDE",
  "FREE_MISSED",
] as const);

// TypeScript needs a concrete Set<MatchEventKind> — use a cast via 'as' on
// each set literal to avoid a separate import of all 14 kind literals here.
/* eslint-disable @typescript-eslint/no-explicit-any */
const SCORES = SCORE_KINDS as unknown as ReadonlySet<import("../../core/stats/stats-event-model").MatchEventKind>;
const SHOTS_AND_SCORES = SHOT_AND_SCORE_KINDS as unknown as ReadonlySet<import("../../core/stats/stats-event-model").MatchEventKind>;
const GOALS = new Set(["GOAL"]) as unknown as ReadonlySet<import("../../core/stats/stats-event-model").MatchEventKind>;
const KICKOUTS_WON = new Set(["KICKOUT_WON"]) as unknown as ReadonlySet<import("../../core/stats/stats-event-model").MatchEventKind>;
const KICKOUTS_CONCEDED = new Set(["KICKOUT_CONCEDED"]) as unknown as ReadonlySet<import("../../core/stats/stats-event-model").MatchEventKind>;
const TURNOVERS_WON = new Set(["TURNOVER_WON"]) as unknown as ReadonlySet<import("../../core/stats/stats-event-model").MatchEventKind>;
const FREES_WON = new Set(["FREE_WON"]) as unknown as ReadonlySet<import("../../core/stats/stats-event-model").MatchEventKind>;
/* eslint-enable @typescript-eslint/no-explicit-any */

export const CHAIN_RULES: readonly ChainRule[] = [
  // ── Kickout chains ──────────────────────────────────────────────────────────

  {
    id: "KICKOUT_TO_SCORE",
    label: "Kickout Won → Score",
    description:
      "Team won possession from a kickout and scored within the next possession window.",
    steps: [
      { kinds: KICKOUTS_WON, side: "ANY" },
      { kinds: SCORES,        side: "SAME", maxGapSeconds: 90 },
    ],
    maxWindowSeconds: 90,
  },

  {
    id: "KICKOUT_LOST_TO_SCORE_AGAINST",
    label: "Kickout Lost → Score Against",
    description:
      "Team conceded a kickout and opposition scored directly from the resulting possession.",
    steps: [
      { kinds: KICKOUTS_CONCEDED, side: "ANY" },
      { kinds: SCORES,             side: "OPPOSITE", maxGapSeconds: 90 },
    ],
    maxWindowSeconds: 90,
  },

  // ── Turnover chains ─────────────────────────────────────────────────────────

  {
    id: "TURNOVER_TO_SCORE",
    label: "Turnover Won → Score",
    description:
      "Team won a turnover and converted the resulting possession directly into a score.",
    steps: [
      { kinds: TURNOVERS_WON, side: "ANY" },
      { kinds: SCORES,         side: "SAME", maxGapSeconds: 60 },
    ],
    maxWindowSeconds: 60,
  },

  {
    id: "TURNOVER_TO_SHOT",
    label: "Turnover Won → Shot",
    description:
      "Team won a turnover and generated any shot attempt (score, wide, or missed free) directly.",
    steps: [
      { kinds: TURNOVERS_WON,   side: "ANY" },
      { kinds: SHOTS_AND_SCORES, side: "SAME", maxGapSeconds: 60 },
    ],
    maxWindowSeconds: 60,
  },

  // ── Free kick chains ────────────────────────────────────────────────────────

  {
    id: "FREE_WON_TO_GOAL",
    label: "Free Won → Goal",
    description:
      "A free kick awarded directly resulted in a goal being scored.",
    steps: [
      { kinds: FREES_WON, side: "ANY" },
      { kinds: GOALS,      side: "SAME", maxGapSeconds: 30 },
    ],
    maxWindowSeconds: 30,
  },
] as const;
