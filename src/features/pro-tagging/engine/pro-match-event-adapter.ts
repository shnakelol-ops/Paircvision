/**
 * pro-match-event-adapter.ts
 *
 * Bridge between ProEventKind and the existing MatchEventKind system.
 *
 * ISOLATION RULE:
 *   This is the ONLY file in the pro-tagging feature that imports from
 *   the core stats-event-model. All other Pro files use ProEventKind only.
 *
 * Chain Engine Compatibility:
 *   The existing analyseChains() expects events with kind: MatchEventKind.
 *   Pro events that map to existing kinds can be adapted.
 *   Pro events with no MatchEventKind equivalent return null and cannot
 *   be used with the legacy chain engine until Phase 6+.
 */

import type { MatchEventKind } from "../../../core/stats/stats-event-model";
import type { ProEventKind } from "../model/pro-event-model";

// ---------------------------------------------------------------------------
// Mapping: ProEventKind → MatchEventKind
// ---------------------------------------------------------------------------

const PRO_TO_MATCH_KIND: Partial<Record<ProEventKind, MatchEventKind>> = {
  // Scoring
  GOAL:                 "GOAL",
  POINT:                "POINT",
  WIDE:                 "WIDE",
  SHOT:                 "SHOT",
  FREE_SCORED:          "FREE_SCORED",
  FREE_MISSED:          "FREE_MISSED",
  TWO_POINTER:          "TWO_POINTER",
  FORTY_FIVE_TWO_POINT: "FORTY_FIVE_TWO_POINT",

  // Restarts — both map to the KICKOUT_* pair (semantic label from profile)
  RESTART_WON:          "KICKOUT_WON",
  RESTART_LOST:         "KICKOUT_CONCEDED",

  // Possession — direct mapping
  TURNOVER_WON:         "TURNOVER_WON",
  TURNOVER_LOST:        "TURNOVER_LOST",

  // Frees — direct mapping
  FREE_WON:             "FREE_WON",
  FREE_CONCEDED:        "FREE_CONCEDED",

  // The following Pro events have NO MatchEventKind equivalent:
  //   SHORT_RESTART, LONG_RESTART
  //   POSSESSION_WON, POSSESSION_LOST
  //   DELIVERY_WON, DELIVERY_LOST
  //   INSIDE_BALL_WON, INSIDE_BALL_LOST
  //   BREAK_WON, BREAK_LOST
  //   HOOK, BLOCK
  //   SIXTY_FIVE, SIDELINE
  //   GOOD_DECISION, BAD_DECISION
  //   GOOD_PASS, BAD_PASS
  //   WORK_RATE_PLUS, WORK_RATE_MINUS
  //   REPEATED_MISTAKE
  // These return null from toMatchEventKind().
};

/**
 * Map a ProEventKind to its MatchEventKind equivalent.
 * Returns null if the Pro event has no equivalent in the existing system.
 */
export function toMatchEventKind(kind: ProEventKind): MatchEventKind | null {
  return PRO_TO_MATCH_KIND[kind] ?? null;
}

/**
 * Returns true if the given ProEventKind maps to an existing MatchEventKind.
 * Useful for filtering which Pro events can feed legacy analytics.
 */
export function isMappedToMatchEventKind(kind: ProEventKind): boolean {
  return PRO_TO_MATCH_KIND[kind] !== undefined;
}

/**
 * Returns all ProEventKinds that map to existing MatchEventKinds.
 */
export function getMappedProEventKinds(): ProEventKind[] {
  return Object.keys(PRO_TO_MATCH_KIND) as ProEventKind[];
}
