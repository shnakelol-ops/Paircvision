import type { LoggedMatchEvent } from "../core/stats/saved-match";
import type { MatchEventKind } from "../core/stats/stats-event-model";

// Shared by ProTaggerLiveScreen and ProTaggerReviewScreen so the live scoreline,
// the review scoreline, and the persisted scorelineSnapshot never disagree.

const TWO_POINT_KINDS: readonly MatchEventKind[] = ["TWO_POINTER", "FORTY_FIVE_TWO_POINT"];

export type SideScore = { goals: number; points: number; total: number };

export function computeScoreSide(
  events: readonly LoggedMatchEvent[],
  side: "FOR" | "OPP",
): SideScore {
  const scored      = events.filter((e) => e.teamSide === side);
  const goals       = scored.filter((e) => e.kind === "GOAL").length;
  const onePointers = scored.filter((e) => e.kind === "POINT").length;
  const twoPointers = scored.filter((e) => TWO_POINT_KINDS.includes(e.kind)).length;
  const pts = onePointers + twoPointers * 2;
  return { goals, points: pts, total: goals * 3 + pts };
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
