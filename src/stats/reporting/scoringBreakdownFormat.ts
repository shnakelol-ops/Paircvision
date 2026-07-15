/**
 * scoringBreakdownFormat.ts
 *
 * Shared coach-facing scoring breakdown formatter.
 * Language only — no engine or ledger calculation changes.
 *
 * Examples:
 *   1 Goal, 6 Points & 1 Two-Point score (11 pts)
 *   2 Goals, 3 Points (9 pts)
 *   8 Points & 2 Two-Point scores (12 pts)
 *   5 Points (5 pts)
 */

import type { MatchEventKind } from "../../core/stats/stats-event-model";
import type { ChainableEvent } from "../chains/chain-types";

const SCORE_KINDS = new Set<MatchEventKind>([
  "GOAL", "POINT", "TWO_POINTER", "FORTY_FIVE_TWO_POINT", "FREE_SCORED",
]);

const TWO_POINTER_KINDS = new Set<MatchEventKind>([
  "TWO_POINTER", "FORTY_FIVE_TWO_POINT",
]);

const ONE_POINT_KINDS = new Set<MatchEventKind>([
  "POINT", "FREE_SCORED",
]);

export type ScoringBreakdown = {
  goals: number;
  /** Ordinary 1-point scores — excludes goals and two-pointers. */
  points: number;
  twoPointers: number;
};

export function emptyScoringBreakdown(): ScoringBreakdown {
  return { goals: 0, points: 0, twoPointers: 0 };
}

/** Derive breakdown from canonical score events (read-only). */
export function breakdownFromScoreEvents(
  events: readonly ChainableEvent[],
): ScoringBreakdown {
  const b = emptyScoringBreakdown();
  for (const e of events) {
    if (!SCORE_KINDS.has(e.kind)) continue;
    if (e.kind === "GOAL") b.goals++;
    else if (TWO_POINTER_KINDS.has(e.kind)) b.twoPointers++;
    else if (ONE_POINT_KINDS.has(e.kind)) b.points++;
  }
  return b;
}

/** Total point value — never labelled "scores". */
export function scoringBreakdownTotal(b: ScoringBreakdown): number {
  return b.goals * 3 + b.points + b.twoPointers * 2;
}

function joinParts(parts: string[]): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) {
    // "2 Goals, 3 Points" vs "8 Points & 2 Two-Point scores"
    return parts[0].includes("Goal")
      ? `${parts[0]}, ${parts[1]}`
      : `${parts[0]} & ${parts[1]}`;
  }
  return `${parts.slice(0, -1).join(", ")} & ${parts[parts.length - 1]}`;
}

/**
 * Formats a scoring breakdown for coach-facing copy.
 * Omits zero categories; always includes total point value in parentheses.
 */
export function formatScoringBreakdown(b: ScoringBreakdown): string {
  const total = scoringBreakdownTotal(b);
  if (total === 0) return "0 pts";

  const parts: string[] = [];
  if (b.goals > 0) {
    parts.push(`${b.goals} Goal${b.goals !== 1 ? "s" : ""}`);
  }
  if (b.points > 0) {
    parts.push(`${b.points} Point${b.points !== 1 ? "s" : ""}`);
  }
  if (b.twoPointers > 0) {
    const label = b.twoPointers === 1 ? "Two-Point score" : "Two-Point scores";
    parts.push(`${b.twoPointers} ${label}`);
  }

  return `${joinParts(parts)} (${total} pts)`;
}

/** Same as formatScoringBreakdown but returns "—" when total is zero. */
export function formatScoringBreakdownOrDash(b: ScoringBreakdown): string {
  return scoringBreakdownTotal(b) === 0 ? "—" : formatScoringBreakdown(b);
}
