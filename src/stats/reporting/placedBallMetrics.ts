/**
 * placedBallMetrics.ts
 *
 * Canonical placed-ball counts — same classification as the score ledger
 * (frees, 45s, penalties, marks by kind or source tag).
 */

import type { MatchEventKind } from "../../core/stats/stats-event-model";
import type { ChainableEvent } from "../chains/chain-types";
import { isPlacedMiss, isPlacedScore } from "../ledger/scoreLedger";

const SCORE_KINDS = new Set<MatchEventKind>([
  "GOAL", "POINT", "TWO_POINTER", "FORTY_FIVE_TWO_POINT", "FREE_SCORED",
]);

function scoreValue(kind: MatchEventKind): number {
  if (kind === "GOAL") return 3;
  if (kind === "TWO_POINTER" || kind === "FORTY_FIVE_TWO_POINT") return 2;
  return 1;
}

export type TeamPlacedBallCounts = {
  attempts: number;
  scores: number;
  points: number;
  misses: number;
};

export type PlacedBallMetrics = {
  for: TeamPlacedBallCounts;
  opp: TeamPlacedBallCounts;
};

function emptyCounts(): TeamPlacedBallCounts {
  return { attempts: 0, scores: 0, points: 0, misses: 0 };
}

function countTeamPlaced<TEvent extends ChainableEvent>(
  events: readonly TEvent[],
  team: "FOR" | "OPP",
): TeamPlacedBallCounts {
  const counts = emptyCounts();
  const own = events.filter(
    (e) => e.teamSide === team && !e.id.includes("-instant-score-"),
  );
  for (const e of own) {
    if (isPlacedScore(e)) {
      counts.scores++;
      counts.points += scoreValue(e.kind);
      counts.attempts++;
    } else if (isPlacedMiss(e)) {
      counts.misses++;
      counts.attempts++;
    }
  }
  return counts;
}

export function computePlacedBallMetrics<TEvent extends ChainableEvent>(
  events: readonly TEvent[],
): PlacedBallMetrics {
  return {
    for: countTeamPlaced(events, "FOR"),
    opp: countTeamPlaced(events, "OPP"),
  };
}
