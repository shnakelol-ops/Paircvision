import type { LoggedMatchEvent } from "../core/stats/saved-match";
import { SCORE_KINDS, scoreValue } from "../stats/ledger/scoreLedger";

// Shared by ProTaggerLiveScreen and ProTaggerReviewScreen so the live scoreline,
// the review scoreline, and the persisted scorelineSnapshot never disagree.
//
// Score-kind membership and point values are read from scoreLedger.ts's
// SCORE_KINDS/scoreValue — the same canonical definition the report layer
// (teamStatsViews, chain-engine, possession-outcomes-engine) uses. This is
// the only allowlist; a kind can't count here without also counting in the
// canonical report score, so the live header and a report-derived score can
// never disagree (e.g. after a FREE_SCORED reclassification in the review
// screen — previously uncounted here despite being a real score).

export type SideScore = { goals: number; points: number; total: number };

export function computeScoreSide(
  events: readonly LoggedMatchEvent[],
  side: "FOR" | "OPP",
): SideScore {
  let goals = 0;
  let points = 0;
  for (const e of events) {
    if (e.teamSide !== side || !SCORE_KINDS.has(e.kind)) continue;
    if (e.kind === "GOAL") goals++;
    else points += scoreValue(e.kind);
  }
  return { goals, points, total: goals * 3 + points };
}

export function fmtGP(goals: number, points: number): string {
  return `${goals}-${String(points).padStart(2, "0")}`;
}

export function fmtScore(s: SideScore): string {
  return `${s.goals}-${String(s.points).padStart(2, "0")} (${s.total})`;
}

/**
 * Builds the "Home G-P (T) v Away G-P (T)" string persisted as
 * ProTaggerSavedMatch.scorelineSnapshot — matches the format ProTaggerLiveScreen's
 * buildSaveRecords already writes, so an in-review edit doesn't change the
 * snapshot's display format, only its numbers.
 */
export function computeScorelineSnapshot(
  events: readonly LoggedMatchEvent[],
  homeTeamName: string,
  awayTeamName: string,
): string {
  const forS = computeScoreSide(events, "FOR");
  const oppS = computeScoreSide(events, "OPP");
  return `${homeTeamName} ${fmtScore(forS)} v ${awayTeamName} ${fmtScore(oppS)}`;
}
