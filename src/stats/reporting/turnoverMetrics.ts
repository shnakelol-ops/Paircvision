/**
 * turnoverMetrics.ts
 *
 * Canonical turnover metric computation AND naming — mirrors restartMetrics.ts.
 * Derives from the chain engine's TurnoverOutcome dataset so figures printed
 * under these names always agree with Chain Intelligence pages.
 */

import type { TurnoverOutcome } from "../chains/chain-types";
import type { ChainableEvent } from "../chains/chain-types";
import {
  type MetricFraction,
  type MetricHalfSplit,
  fmtFractionCounts,
  fraction,
} from "./report-types";

// ─── Metric identity ──────────────────────────────────────────────────────────

export type TurnoverMetricId =
  | "turnoverShare"
  | "turnoverWinsToScore"
  | "turnoverLossPunishment"
  | "turnoverWonToShotOnly";

export function turnoverMetricLabel(id: TurnoverMetricId): string {
  switch (id) {
    case "turnoverShare":           return "Turnover Share";
    case "turnoverWinsToScore":     return "Turnover Wins → Scores";
    case "turnoverLossPunishment":  return "Turnover Losses → Scored Against";
    case "turnoverWonToShotOnly":   return "Turnover Wins → Shot, No Score";
  }
}

export type TurnoverMetrics = {
  /** Turnovers won by us ÷ all turnover events (with per-half splits). */
  turnoverShare: MetricHalfSplit;
  /** Origin scores from turnovers we won ÷ turnovers we won. */
  turnoverWinsToScore: MetricFraction;
  /** Opposition origin scores after turnovers we lost ÷ turnovers we lost. */
  turnoverLossPunishment: MetricFraction;
  /** Shot but no score after turnovers we won ÷ turnovers we won. */
  turnoverWonToShotOnly: MetricFraction;
};

// ─── Acting-side resolution ───────────────────────────────────────────────────

/** Which side gained possession from this turnover event. */
export function turnoverGainedByFor<TEvent extends ChainableEvent>(
  outcome: TurnoverOutcome<TEvent>,
): boolean {
  const e = outcome.turnoverEvent;
  if (e.kind === "TURNOVER_WON") return e.teamSide === "FOR";
  return e.teamSide === "OPP";
}

function splitFraction<TEvent extends ChainableEvent>(
  outcomes: readonly TurnoverOutcome<TEvent>[],
  isNum: (o: TurnoverOutcome<TEvent>) => boolean,
): MetricHalfSplit {
  const h1 = outcomes.filter((o) => o.turnoverEvent.period === "1H");
  const h2 = outcomes.filter((o) => o.turnoverEvent.period === "2H");
  const count = (arr: readonly TurnoverOutcome<TEvent>[]) => arr.filter(isNum).length;
  return {
    full: fraction(count(outcomes), outcomes.length),
    h1:   fraction(count(h1), h1.length),
    h2:   fraction(count(h2), h2.length),
  };
}

/**
 * Computes every canonical turnover metric from the chain engine's turnover
 * outcome dataset (analysis.turnovers.outcomes).
 */
export function computeTurnoverMetrics<TEvent extends ChainableEvent>(
  outcomes: readonly TurnoverOutcome<TEvent>[],
): TurnoverMetrics {
  const gainedByFor = (o: TurnoverOutcome<TEvent>) => turnoverGainedByFor(o);
  const lostByFor   = (o: TurnoverOutcome<TEvent>) => !gainedByFor(o);

  const wins  = outcomes.filter(gainedByFor);
  const losses = outcomes.filter(lostByFor);

  return {
    turnoverShare: splitFraction(outcomes, gainedByFor),
    turnoverWinsToScore: fraction(
      wins.filter((o) => o.resultedInScore).length,
      wins.length,
    ),
    turnoverLossPunishment: fraction(
      losses.filter((o) => o.resultedInScore).length,
      losses.length,
    ),
    turnoverWonToShotOnly: fraction(
      wins.filter((o) => o.resultedInShot && !o.resultedInScore).length,
      wins.length,
    ),
  };
}

/** "Ballylanders won 58% Turnover Share (7 of 12)." */
export function turnoverShareSentence(team: string, f: MetricFraction): string {
  return `${team} won ${f.pct}% Turnover Share (${fmtFractionCounts(f)})`;
}
