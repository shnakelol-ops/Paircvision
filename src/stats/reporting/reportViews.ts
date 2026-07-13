/**
 * reportViews.ts
 *
 * Coach-facing views derived exclusively from MatchReport.
 * Renderers must use these helpers instead of recomputing from raw events.
 *
 * Chain-origin metrics (restartShare, turnoverShare, origin conversion) come
 * from restartMetrics / turnoverMetrics on the report.
 * Possession-family metrics come from report.possessions.
 */

import type { ChainableEvent } from "../chains/chain-types";
import type { MatchReport } from "./matchReport";
import type { MetricFraction } from "./report-types";
import { fraction } from "./report-types";

// ─── Chain-origin layer (PDF chain pages, intelligence summary tiles) ─────────

export function viewRestartShare<T extends ChainableEvent>(
  report: MatchReport<T>,
): MetricFraction {
  return report.restarts.restartShare.full;
}

export function viewOwnKickoutRetention<T extends ChainableEvent>(
  report: MatchReport<T>,
): MetricFraction {
  return report.restarts.ownKickoutRetention.full;
}

export function viewRestartWinsToScore<T extends ChainableEvent>(
  report: MatchReport<T>,
): MetricFraction {
  return report.restarts.restartToScore;
}

export function viewRestartLossPunishment<T extends ChainableEvent>(
  report: MatchReport<T>,
): MetricFraction {
  return report.restarts.restartLossPunishment;
}

export function viewTurnoverShare<T extends ChainableEvent>(
  report: MatchReport<T>,
): MetricFraction {
  return report.turnovers.turnoverShare.full;
}

export function viewTurnoverWinsToScore<T extends ChainableEvent>(
  report: MatchReport<T>,
): MetricFraction {
  return report.turnovers.turnoverWinsToScore;
}

export function viewTurnoverLossPunishment<T extends ChainableEvent>(
  report: MatchReport<T>,
): MetricFraction {
  return report.turnovers.turnoverLossPunishment;
}

export function viewTurnoverWonToShotOnly<T extends ChainableEvent>(
  report: MatchReport<T>,
): MetricFraction {
  return report.turnovers.turnoverWonToShotOnly;
}

// ─── Possession layer (PNG cards, live intelligence) ─────────────────────────

export function viewPossessionRetention<T extends ChainableEvent>(
  report: MatchReport<T>,
): MetricFraction {
  const p = report.possessions;
  const retained = p.kickouts.retainedCount + p.turnovers.retainedCount + p.frees.retainedCount;
  const total = p.kickouts.total + p.turnovers.total + p.frees.total;
  return fraction(retained, total);
}

export function viewKickoutPossessionScoringPct<T extends ChainableEvent>(
  report: MatchReport<T>,
): number {
  const ko = report.possessions.ourKickouts ?? report.possessions.kickouts;
  return ko.retained.scoringPct;
}

export function viewTurnoverPossessionScoringPct<T extends ChainableEvent>(
  report: MatchReport<T>,
): number {
  return report.possessions.turnovers.retained.scoringPct;
}

export function viewTurnoverPossessionDamagePct<T extends ChainableEvent>(
  report: MatchReport<T>,
): number {
  return report.possessions.turnovers.damagePct;
}

// ─── Raw event counts (match summary table — beneficiary mirror) ──────────────

export type MirroredPossessionCounts = {
  kickoutsWon: number;
  kickoutsLost: number;
  kickoutsTotal: number;
  turnoversWon: number;
  turnoversLost: number;
  turnoversTotal: number;
};

/**
 * Beneficiary-mirrored kickout/turnover counts for the statistics summary block.
 * Uses the same scoped events as the report.
 */
export function viewMirroredPossessionCounts<T extends ChainableEvent>(
  report: MatchReport<T>,
): MirroredPossessionCounts {
  let kickoutsWon = 0;
  let kickoutsLost = 0;
  let turnoversWon = 0;
  let turnoversLost = 0;

  for (const e of report.events) {
    if (e.kind === "KICKOUT_WON" && e.teamSide === "FOR") kickoutsWon++;
    else if (e.kind === "KICKOUT_CONCEDED" && e.teamSide === "OPP") kickoutsWon++;
    else if (e.kind === "KICKOUT_CONCEDED" && e.teamSide === "FOR") kickoutsLost++;
    else if (e.kind === "KICKOUT_WON" && e.teamSide === "OPP") kickoutsLost++;
    else if (e.kind === "TURNOVER_WON" && e.teamSide === "FOR") turnoversWon++;
    else if (e.kind === "TURNOVER_LOST" && e.teamSide === "OPP") turnoversWon++;
    else if (e.kind === "TURNOVER_LOST" && e.teamSide === "FOR") turnoversLost++;
    else if (e.kind === "TURNOVER_WON" && e.teamSide === "OPP") turnoversLost++;
  }

  const kickoutsTotal = kickoutsWon + kickoutsLost;
  const turnoversTotal = turnoversWon + turnoversLost;

  return {
    kickoutsWon,
    kickoutsLost,
    kickoutsTotal,
    turnoversWon,
    turnoversLost,
    turnoversTotal,
  };
}

/** Restart Share for targets / coaching brief — chain-origin canonical field. */
export function viewTargetsKickoutWinRate<T extends ChainableEvent>(
  report: MatchReport<T>,
): number | null {
  const f = viewRestartShare(report);
  return f.den > 0 ? f.pct : null;
}
