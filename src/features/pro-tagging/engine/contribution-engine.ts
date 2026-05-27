/**
 * contribution-engine.ts
 *
 * PáircVision Pro Tagging — Player Contribution Engine
 *
 * Pure function. No side effects. No imports from React or DOM.
 *
 * Given logged ProEvents and derived Possessions, computes a
 * PlayerContributionCard per player.
 *
 * Design notes:
 *   - Weights are modelled after trainingScoring.ts but extended for Pro events.
 *   - Scoring involvements: any player who appeared in a possession that ended in score.
 *   - Contribution score is NEVER shown during live logging.
 *   - It is computed post-session in the review screen only.
 *
 * Phase 6 — Player Contribution Prototype
 */

import type { ProEvent, ProEventKind } from "../model/pro-event-model";
import type { Possession } from "./possession-engine";

// ---------------------------------------------------------------------------
// Weights
// ---------------------------------------------------------------------------

/**
 * Point weights for each Pro event kind.
 * Positive = good contribution, Negative = costly event.
 * Values intentionally simple (−3 to +3 range) for readability.
 */
export type ProContributionWeights = Partial<Record<ProEventKind, number>>;

export const DEFAULT_WEIGHTS: ProContributionWeights = {
  // Scoring
  GOAL:                  3,
  POINT:                 1,
  TWO_POINTER:           2,
  FORTY_FIVE_TWO_POINT:  2,
  FREE_SCORED:           1,
  WIDE:                 -1,
  SHOT:                  0,  // neutral — neither positive nor negative by default
  FREE_MISSED:          -1,

  // Restarts
  RESTART_WON:           1,
  RESTART_LOST:         -1,
  SHORT_RESTART:         0,  // neutral — strategy, not quality
  LONG_RESTART:          0,

  // Possession
  TURNOVER_WON:          1,
  TURNOVER_LOST:        -1,
  POSSESSION_WON:        1,
  POSSESSION_LOST:      -1,

  // Frees
  FREE_WON:              1,
  FREE_CONCEDED:        -1,

  // Delivery
  DELIVERY_WON:          1,
  DELIVERY_LOST:        -1,
  INSIDE_BALL_WON:       1,
  INSIDE_BALL_LOST:     -1,

  // Hurling-specific
  BREAK_WON:             1,
  BREAK_LOST:           -1,
  HOOK:                  1,
  BLOCK:                 1,
  SIXTY_FIVE:            0,  // neutral
  SIDELINE:              0,  // neutral

  // Quality / Effort
  GOOD_DECISION:         1,
  BAD_DECISION:         -1,
  GOOD_PASS:             1,
  BAD_PASS:             -1,
  WORK_RATE_PLUS:        1,
  WORK_RATE_MINUS:      -1,
  REPEATED_MISTAKE:     -3,
};

// ---------------------------------------------------------------------------
// Output Types
// ---------------------------------------------------------------------------

export type PlayerContributionCard = {
  playerId: string;
  playerName: string | null;
  playerNumber: number | null;
  /** Total contribution score — sum of all weighted events */
  totalScore: number;
  /** Count of each event kind logged for this player */
  eventCounts: Partial<Record<ProEventKind, number>>;
  /** Possessions in which this player appeared */
  possessionInvolvements: number;
  /** Possessions in which player appeared and team scored */
  scoringInvolvements: number;
  /** Total positive event count */
  positiveCount: number;
  /** Total negative event count */
  negativeCount: number;
  /** Breakdown by category */
  breakdown: {
    scoring: number;
    restarts: number;
    possession: number;
    delivery: number;
    effort: number;
    hurlingSpecific: number;
  };
};

export type ContributionDataset = {
  /** All players sorted by totalScore descending */
  players: readonly PlayerContributionCard[];
  topContributor: PlayerContributionCard | null;
  lowestContributor: PlayerContributionCard | null;
  /** Total event count across all players (excluding unattributed) */
  totalAttributedEvents: number;
  /** Event count with no player attribution */
  unattributedEvents: number;
};

// ---------------------------------------------------------------------------
// Category mapping for breakdown
// ---------------------------------------------------------------------------

type BreakdownKey = "scoring" | "restarts" | "possession" | "delivery" | "effort" | "hurlingSpecific";

const KIND_TO_BREAKDOWN: Partial<Record<ProEventKind, BreakdownKey>> = {
  GOAL:                  "scoring",
  POINT:                 "scoring",
  TWO_POINTER:           "scoring",
  FORTY_FIVE_TWO_POINT:  "scoring",
  FREE_SCORED:           "scoring",
  WIDE:                  "scoring",
  SHOT:                  "scoring",
  FREE_MISSED:           "scoring",
  RESTART_WON:           "restarts",
  RESTART_LOST:          "restarts",
  SHORT_RESTART:         "restarts",
  LONG_RESTART:          "restarts",
  TURNOVER_WON:          "possession",
  TURNOVER_LOST:         "possession",
  POSSESSION_WON:        "possession",
  POSSESSION_LOST:       "possession",
  FREE_WON:              "possession",
  FREE_CONCEDED:         "possession",
  DELIVERY_WON:          "delivery",
  DELIVERY_LOST:         "delivery",
  INSIDE_BALL_WON:       "delivery",
  INSIDE_BALL_LOST:      "delivery",
  BREAK_WON:             "hurlingSpecific",
  BREAK_LOST:            "hurlingSpecific",
  HOOK:                  "hurlingSpecific",
  BLOCK:                 "hurlingSpecific",
  SIXTY_FIVE:            "hurlingSpecific",
  SIDELINE:              "hurlingSpecific",
  GOOD_DECISION:         "effort",
  BAD_DECISION:          "effort",
  GOOD_PASS:             "effort",
  BAD_PASS:              "effort",
  WORK_RATE_PLUS:        "effort",
  WORK_RATE_MINUS:       "effort",
  REPEATED_MISTAKE:      "effort",
};

// ---------------------------------------------------------------------------
// Core derivation
// ---------------------------------------------------------------------------

/**
 * Derive player contribution cards from logged events and optional possessions.
 *
 * @param events   - All logged ProEvents for the session
 * @param possessions - Derived possessions (from possession-engine)
 * @param weights  - Override weights (defaults to DEFAULT_WEIGHTS)
 */
export function deriveContributions(
  events: readonly ProEvent[],
  possessions: readonly Possession[] = [],
  weights: ProContributionWeights = DEFAULT_WEIGHTS,
): ContributionDataset {
  // Build player map
  const playerMap = new Map<string, {
    playerId: string;
    playerName: string | null;
    playerNumber: number | null;
    events: ProEvent[];
  }>();

  let unattributedEvents = 0;

  for (const event of events) {
    if (!event.playerId) {
      unattributedEvents++;
      continue;
    }
    const existing = playerMap.get(event.playerId);
    if (existing) {
      existing.events.push(event);
    } else {
      playerMap.set(event.playerId, {
        playerId: event.playerId,
        playerName: event.playerName ?? null,
        playerNumber: event.playerNumber ?? null,
        events: [event],
      });
    }
  }

  // Build possession involvement map (playerId → possessions they appeared in)
  const playerPossessionMap = new Map<string, Set<string>>();
  const playerScoringPossessionMap = new Map<string, Set<string>>();

  for (const possession of possessions) {
    const playerIds = new Set(
      possession.events
        .map((e) => e.playerId)
        .filter((id): id is string => id !== null && id !== undefined),
    );
    for (const playerId of playerIds) {
      if (!playerPossessionMap.has(playerId)) {
        playerPossessionMap.set(playerId, new Set());
      }
      playerPossessionMap.get(playerId)!.add(possession.id);

      if (possession.resultedInScore) {
        if (!playerScoringPossessionMap.has(playerId)) {
          playerScoringPossessionMap.set(playerId, new Set());
        }
        playerScoringPossessionMap.get(playerId)!.add(possession.id);
      }
    }
  }

  // Build contribution cards
  const cards: PlayerContributionCard[] = [];
  let totalAttributedEvents = 0;

  for (const [, player] of playerMap) {
    const eventCounts: Partial<Record<ProEventKind, number>> = {};
    let totalScore = 0;
    let positiveCount = 0;
    let negativeCount = 0;
    const breakdown: PlayerContributionCard["breakdown"] = {
      scoring: 0,
      restarts: 0,
      possession: 0,
      delivery: 0,
      effort: 0,
      hurlingSpecific: 0,
    };

    for (const event of player.events) {
      const kind = event.proKind;
      eventCounts[kind] = (eventCounts[kind] ?? 0) + 1;

      const weight = weights[kind] ?? 0;
      totalScore += weight;
      if (weight > 0) positiveCount++;
      else if (weight < 0) negativeCount++;

      const cat = KIND_TO_BREAKDOWN[kind];
      if (cat) breakdown[cat] += weight;

      totalAttributedEvents++;
    }

    const possInvolvements = playerPossessionMap.get(player.playerId)?.size ?? 0;
    const scoringInvolvements = playerScoringPossessionMap.get(player.playerId)?.size ?? 0;

    cards.push({
      playerId: player.playerId,
      playerName: player.playerName,
      playerNumber: player.playerNumber,
      totalScore,
      eventCounts,
      possessionInvolvements: possInvolvements,
      scoringInvolvements,
      positiveCount,
      negativeCount,
      breakdown,
    });
  }

  // Sort by total score descending
  cards.sort((a, b) => b.totalScore - a.totalScore);

  return {
    players: cards,
    topContributor: cards.length > 0 ? cards[0] ?? null : null,
    lowestContributor: cards.length > 0 ? cards[cards.length - 1] ?? null : null,
    totalAttributedEvents,
    unattributedEvents,
  };
}

// ---------------------------------------------------------------------------
// Colour helper (copied from trainingScoring.ts — pure function, no dep)
// ---------------------------------------------------------------------------

/** Returns a CSS colour string based on a contribution score value. */
export function contributionRatingColor(score: number): string {
  if (score >= 5)  return "#24c15e";
  if (score >= 2)  return "#9fd84d";
  if (score >= 0)  return "#e1a500";
  if (score >= -3) return "#e67e22";
  return "#d73a49";
}
