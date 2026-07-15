/**
 * matchReport.ts
 *
 * THE canonical reporting model for PáircVision.
 *
 * Every coach-facing export (PDF, snapshot, intelligence pack, PNG cards,
 * coaching brief, match targets) must consume a MatchReport built here.
 *
 * Design:
 *   - Chain engine and possession-outcomes engine remain separate layers.
 *   - MatchReport composes both without merging their semantics.
 *   - Named metric dictionaries (restartMetrics, turnoverMetrics) derive from
 *     chain datasets so PDF chain pages and summary tiles agree.
 *   - Possession families are exposed for PNG / live intelligence surfaces.
 */

import type { ChainableEvent, ChainAnalysis, PossessionOutcomeSummary } from "../chains/chain-types";
import { selectChainAnalysis, selectPossessionOutcomeSummary } from "../chains/chain-selectors";
import { buildScoreLedger, type ScoreLedger } from "../ledger/scoreLedger";
import { computeRestartMetrics, type RestartMetrics } from "../restarts/restartMetrics";
import { computeTurnoverMetrics, type TurnoverMetrics } from "./turnoverMetrics";
import { computeRestartTeamMetrics, type RestartTeamMetrics } from "./restartTeamMetrics";
import { computePlacedBallMetrics, type PlacedBallMetrics } from "./placedBallMetrics";
import { type ReportScope, scopeToPeriod } from "./report-types";

// ─── Public types ─────────────────────────────────────────────────────────────

export type MatchReport<TEvent extends ChainableEvent = ChainableEvent> = {
  scope: ReportScope;
  homeTeam: string;
  awayTeam: string;
  /** Events after scope filter — the input to every engine below. */
  events: readonly TEvent[];
  /** Rule matches, origin datasets, scoring runs. */
  chain: ChainAnalysis<TEvent>;
  /** Possession families for card / live intelligence surfaces. */
  possessions: PossessionOutcomeSummary<TEvent>;
  /** Canonical restart dictionary (chain-origin layer). */
  restarts: RestartMetrics;
  /** Per-team restart share vs own-kickout outcomes. */
  restartTeams: RestartTeamMetrics;
  /** Canonical turnover dictionary (chain-origin layer). */
  turnovers: TurnoverMetrics;
  /** Placed-ball attempts / scores / points / misses (ledger taxonomy). */
  placedBalls: PlacedBallMetrics;
  /** Direct score attribution — ledger partition. */
  ledger: ScoreLedger;
};

export type BuildMatchReportInput<TEvent extends ChainableEvent> = {
  events: readonly TEvent[];
  scope?: ReportScope;
  homeTeam: string;
  awayTeam: string;
};

// ─── Scope helper ─────────────────────────────────────────────────────────────

export function filterEventsForScope<TEvent extends ChainableEvent>(
  events: readonly TEvent[],
  scope: ReportScope,
): readonly TEvent[] {
  const period = scopeToPeriod(scope);
  if (period == null) return events;
  return events.filter((e) => e.period === period);
}

// ─── Builder ──────────────────────────────────────────────────────────────────

/**
 * Builds the canonical MatchReport for a scoped event set.
 *
 * Call once per export; pass the result to every renderer and insight builder.
 */
export function buildMatchReport<TEvent extends ChainableEvent>(
  input: BuildMatchReportInput<TEvent>,
): MatchReport<TEvent> {
  const scope = input.scope ?? "FULL";
  const events = filterEventsForScope(input.events, scope);

  const chain = selectChainAnalysis(events);
  const possessions = selectPossessionOutcomeSummary(events);
  const restarts = computeRestartMetrics(chain.kickouts.outcomes);
  const restartTeams = computeRestartTeamMetrics(chain.kickouts.outcomes);
  const turnovers = computeTurnoverMetrics(chain.turnovers.outcomes);
  const placedBalls = computePlacedBallMetrics(events);
  const ledger = buildScoreLedger(events, chain, input.homeTeam, input.awayTeam);

  return {
    scope,
    homeTeam: input.homeTeam,
    awayTeam: input.awayTeam,
    events,
    chain,
    possessions,
    restarts,
    restartTeams,
    turnovers,
    placedBalls,
    ledger,
  };
}
