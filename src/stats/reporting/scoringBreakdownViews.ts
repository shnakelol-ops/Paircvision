/**
 * scoringBreakdownViews.ts
 *
 * Read-only views that collect canonical score events for each reporting
 * context, then delegate to scoringBreakdownFormat for coach-facing copy.
 */

import type { MatchEventKind } from "../../core/stats/stats-event-model";
import type { ChainableEvent, ChainAnalysis } from "../chains/chain-types";
import type { LedgerRowId } from "../ledger/scoreLedger";
import { isPlacedScore } from "../ledger/scoreLedger";
import { eventSource } from "../eventSource";
import { resolveRestartOwner } from "../restarts/restartMetrics";
import type { MatchReport } from "./matchReport";
import {
  breakdownFromScoreEvents,
  formatScoringBreakdown,
  formatScoringBreakdownOrDash,
  type ScoringBreakdown,
} from "./scoringBreakdownFormat";

const SCORE_KINDS = new Set<MatchEventKind>([
  "GOAL", "POINT", "TWO_POINTER", "FORTY_FIVE_TWO_POINT", "FREE_SCORED",
]);

// ─── Chain-origin breakdowns ──────────────────────────────────────────────────

export function viewRestartOriginScoredFor<T extends ChainableEvent>(
  analysis: ChainAnalysis<T>,
): ScoringBreakdown {
  const events = analysis.kickouts.outcomes
    .filter((o) => o.winningSide === "FOR" && o.nextScore != null)
    .map((o) => o.nextScore!);
  return breakdownFromScoreEvents(events);
}

export function viewRestartOriginScoredOpp<T extends ChainableEvent>(
  analysis: ChainAnalysis<T>,
): ScoringBreakdown {
  const events = analysis.kickouts.outcomes
    .filter((o) => o.winningSide === "OPP" && o.nextScore != null)
    .map((o) => o.nextScore!);
  return breakdownFromScoreEvents(events);
}

export function viewRestartOriginConcededFor<T extends ChainableEvent>(
  analysis: ChainAnalysis<T>,
): ScoringBreakdown {
  return viewRestartOriginScoredOpp(analysis);
}

/**
 * Scores conceded from kickouts this team physically took and lost
 * (restartOwner = FOR, winner = OPP) — narrower than
 * viewRestartOriginConcededFor, which also includes scores off restarts
 * the opposition took and retained (their own restart, not ours to lose).
 * Pair only with an own-kickout-lost occurrence count (e.g.
 * RestartTeamMetrics.ownRestartsLost) — never with the all-restarts figure.
 */
export function viewOwnKickoutLossOriginConcededFor<T extends ChainableEvent>(
  analysis: ChainAnalysis<T>,
): ScoringBreakdown {
  const events = analysis.kickouts.outcomes
    .filter(
      (o) =>
        resolveRestartOwner(o.kickoutEvent) === "FOR"
        && o.winningSide === "OPP"
        && o.nextScore != null,
    )
    .map((o) => o.nextScore!);
  return breakdownFromScoreEvents(events);
}

export function viewTurnoverOriginScoredFor<T extends ChainableEvent>(
  analysis: ChainAnalysis<T>,
): ScoringBreakdown {
  const events = analysis.turnovers.outcomes
    .filter(
      (o) =>
        o.direction === "WON"
        && o.turnoverEvent.teamSide === "FOR"
        && o.resultedInScore
        && o.nextEvent != null,
    )
    .map((o) => o.nextEvent!);
  return breakdownFromScoreEvents(events);
}

export function viewTurnoverOriginScoredOpp<T extends ChainableEvent>(
  analysis: ChainAnalysis<T>,
): ScoringBreakdown {
  const events = analysis.turnovers.outcomes
    .filter(
      (o) =>
        o.direction === "LOST"
        && o.turnoverEvent.teamSide === "FOR"
        && o.resultedInScore
        && o.nextEvent != null,
    )
    .map((o) => o.nextEvent!);
  return breakdownFromScoreEvents(events);
}

export function viewTurnoverOriginConcededFor<T extends ChainableEvent>(
  analysis: ChainAnalysis<T>,
): ScoringBreakdown {
  return viewTurnoverOriginScoredOpp(analysis);
}

// ─── De-duplicated possession-origin split (Full Review Part 3) ──────────────

export type ScoringPossessionOrigins = {
  restartOrigin: ScoringBreakdown;
  turnoverOrigin: ScoringBreakdown;
};

/**
 * De-duplicated possession-origin split for one team's scores: every scoring
 * event is attributed to AT MOST ONE origin (restart or turnover), using the
 * same nearer-origin-wins tie-break as the score ledger (buildOriginClockMaps
 * + "later clock wins" below), so a score whose forward-scan is claimed by
 * both a kickout outcome and a turnover outcome is never double-counted
 * across the two totals. Unlike buildScoreLedger, this does NOT give placed
 * balls precedence — a placed free scored inside a restart-origin possession
 * still counts as a restart-origin score here, because Part 3 answers "where
 * did the possession begin," not "how was the score recorded."
 */
export function viewScoringPossessionOrigins<T extends ChainableEvent>(
  report: MatchReport<T>,
  team: "FOR" | "OPP",
): ScoringPossessionOrigins {
  const maps = buildOriginClockMaps(report.chain);
  const restartEvents: T[] = [];
  const turnoverEvents: T[] = [];

  for (const e of report.events) {
    if (e.id.includes("-instant-score-")) continue;
    if (e.teamSide !== team) continue;
    if (!SCORE_KINDS.has(e.kind)) continue;

    const koClock = maps.restart.get(e.id);
    const toClock = maps.turnover.get(e.id);
    if (koClock != null && toClock != null) {
      (toClock >= koClock ? turnoverEvents : restartEvents).push(e);
    } else if (koClock != null) {
      restartEvents.push(e);
    } else if (toClock != null) {
      turnoverEvents.push(e);
    }
  }

  return {
    restartOrigin: breakdownFromScoreEvents(restartEvents),
    turnoverOrigin: breakdownFromScoreEvents(turnoverEvents),
  };
}

// ─── Ledger-row breakdowns (read-only classification mirror) ─────────────────

function buildOriginClockMaps<T extends ChainableEvent>(
  analysis: ChainAnalysis<T>,
): { restart: Map<string, number>; turnover: Map<string, number> } {
  const restart = new Map<string, number>();
  for (const o of analysis.kickouts.outcomes) {
    if (o.nextScore != null) {
      restart.set(o.nextScore.id, o.kickoutEvent.matchClockSeconds ?? 0);
    }
  }
  const turnover = new Map<string, number>();
  for (const o of analysis.turnovers.outcomes) {
    if (o.nextEvent != null && o.resultedInScore) {
      turnover.set(o.nextEvent.id, o.turnoverEvent.matchClockSeconds ?? 0);
    }
  }
  return { restart, turnover };
}

function classifyLedgerRow<T extends ChainableEvent>(
  e: T,
  maps: { restart: Map<string, number>; turnover: Map<string, number> },
): LedgerRowId {
  if (isPlacedScore(e)) return "PLACED";
  const koClock = maps.restart.get(e.id);
  const toClock = maps.turnover.get(e.id);
  if (koClock != null && toClock != null) {
    return toClock >= koClock ? "TURNOVER_WON" : "RESTART_WON";
  }
  if (koClock != null) return "RESTART_WON";
  if (toClock != null) return "TURNOVER_WON";
  return eventSource(e) === "UNKNOWN" ? "UNATTRIBUTED" : "FROM_PLAY";
}

export function viewLedgerRowBreakdown<T extends ChainableEvent>(
  report: MatchReport<T>,
  rowId: LedgerRowId,
  team: "FOR" | "OPP",
): ScoringBreakdown {
  const maps = buildOriginClockMaps(report.chain);
  const events = report.events.filter((e) => {
    if (e.id.includes("-instant-score-")) return false;
    if (e.teamSide !== team) return false;
    if (!SCORE_KINDS.has(e.kind)) return false;
    return classifyLedgerRow(e, maps) === rowId;
  });
  return breakdownFromScoreEvents(events);
}

export function viewPlacedBallBreakdownFor<T extends ChainableEvent>(
  report: MatchReport<T>,
  team: "FOR" | "OPP",
): ScoringBreakdown {
  return viewLedgerRowBreakdown(report, "PLACED", team);
}

export function viewGeneralPlayBreakdownFor<T extends ChainableEvent>(
  report: MatchReport<T>,
  team: "FOR" | "OPP",
): ScoringBreakdown {
  return viewLedgerRowBreakdown(report, "FROM_PLAY", team);
}

// ─── Formatted coach-facing strings ──────────────────────────────────────────

export function fmtRestartOriginScoredFor<T extends ChainableEvent>(
  analysis: ChainAnalysis<T>,
): string {
  return formatScoringBreakdown(viewRestartOriginScoredFor(analysis));
}

export function fmtRestartOriginScoredOpp<T extends ChainableEvent>(
  analysis: ChainAnalysis<T>,
): string {
  return formatScoringBreakdown(viewRestartOriginScoredOpp(analysis));
}

export function fmtRestartOriginConcededFor<T extends ChainableEvent>(
  analysis: ChainAnalysis<T>,
): string {
  return formatScoringBreakdown(viewRestartOriginConcededFor(analysis));
}

export function fmtOwnKickoutLossOriginConcededFor<T extends ChainableEvent>(
  analysis: ChainAnalysis<T>,
): string {
  return formatScoringBreakdown(viewOwnKickoutLossOriginConcededFor(analysis));
}

export function fmtTurnoverOriginScoredFor<T extends ChainableEvent>(
  analysis: ChainAnalysis<T>,
): string {
  return formatScoringBreakdown(viewTurnoverOriginScoredFor(analysis));
}

export function fmtTurnoverOriginScoredOpp<T extends ChainableEvent>(
  analysis: ChainAnalysis<T>,
): string {
  return formatScoringBreakdown(viewTurnoverOriginScoredOpp(analysis));
}

export function fmtTurnoverOriginConcededFor<T extends ChainableEvent>(
  analysis: ChainAnalysis<T>,
): string {
  return formatScoringBreakdown(viewTurnoverOriginConcededFor(analysis));
}

export function fmtLedgerRowForTeam<T extends ChainableEvent>(
  report: MatchReport<T>,
  rowId: LedgerRowId,
  team: "FOR" | "OPP",
): string {
  return formatScoringBreakdownOrDash(viewLedgerRowBreakdown(report, rowId, team));
}
