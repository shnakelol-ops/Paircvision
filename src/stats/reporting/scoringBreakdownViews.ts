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
