/**
 * chain-selectors.ts
 *
 * Public API façade for the chain analysis system.
 *
 * Usage pattern:
 *   // In a PDF page builder (or any future consumer):
 *   const analysis = selectChainAnalysis(events);         // run once
 *   const kickouts = selectKickoutChains(analysis);       // future kickout page
 *   const turnovers = selectTurnoverChains(analysis);     // future turnover page
 *   const momentum = selectMomentumRuns(analysis);        // future momentum page
 *   const rule = selectChainsForRule(analysis, "TURNOVER_TO_SCORE");
 *
 * Dependency note:
 *   This file intentionally accepts ChainableEvent (not PdfExportEvent) so
 *   there is zero circular import risk with reviewPdfExport.ts.
 *   PdfExportEvent structurally satisfies ChainableEvent — TypeScript accepts
 *   PdfExportEvent[] wherever ChainableEvent[] is expected.
 */

import { analyseChains } from "./chain-engine";
import { CHAIN_RULES } from "./chain-rules";
import { buildPossessionOutcomeSummary, buildMatchIntelligence } from "./possession-outcomes-engine";
import type {
  ChainableEvent,
  ChainAnalysis,
  ChainMatch,
  ChainRuleId,
  ChainRule,
  KickoutChainDataset,
  TurnoverChainDataset,
  ScoringRunDataset,
  ScoringRun,
  PossessionOutcomeSummary,
  MatchIntelligence,
} from "./chain-types";
import type { MatchEventPeriod, MatchEventSegment } from "../../core/stats/stats-event-model";

// ─── Primary selector ─────────────────────────────────────────────────────────

/**
 * Run full chain analysis on a raw event array.
 *
 * Call once per PDF export; share the result across all page builders.
 * PdfExportEvent[] satisfies readonly ChainableEvent[] by TypeScript
 * structural subtyping — no cast needed at the call site.
 */
export function selectChainAnalysis<TEvent extends ChainableEvent>(
  events: readonly TEvent[],
  rules: readonly ChainRule[] = CHAIN_RULES,
): ChainAnalysis<TEvent> {
  return analyseChains(events, rules);
}

// ─── Named tactical selectors (future page consumers) ────────────────────────

/**
 * Returns the kickout chain dataset.
 * Intended to power a future "Kickout Analysis" page.
 */
export function selectKickoutChains<TEvent extends ChainableEvent>(
  analysis: ChainAnalysis<TEvent>,
): KickoutChainDataset<TEvent> {
  return analysis.kickouts;
}

/**
 * Returns the turnover chain dataset.
 * Intended to power a future "Turnover Punishment" page.
 */
export function selectTurnoverChains<TEvent extends ChainableEvent>(
  analysis: ChainAnalysis<TEvent>,
): TurnoverChainDataset<TEvent> {
  return analysis.turnovers;
}

/**
 * Returns the scoring run dataset.
 * Intended to power a future "Momentum" page.
 */
export function selectScoringRuns<TEvent extends ChainableEvent>(
  analysis: ChainAnalysis<TEvent>,
): ScoringRunDataset<TEvent> {
  return analysis.scoringRuns;
}

/**
 * Returns all momentum scoring runs (length ≥ 2) sorted longest-first.
 * Convenience accessor for the momentum page or summary widgets.
 */
export function selectMomentumRuns<TEvent extends ChainableEvent>(
  analysis: ChainAnalysis<TEvent>,
): readonly ScoringRun<TEvent>[] {
  return [...analysis.scoringRuns.runs].sort((a, b) => b.count - a.count);
}

// ─── Filter selectors (for flexible page composition) ────────────────────────

/**
 * Returns all detected chains for a specific rule ID.
 * Useful when a page only cares about one chain pattern.
 */
export function selectChainsForRule<TEvent extends ChainableEvent>(
  analysis: ChainAnalysis<TEvent>,
  ruleId: ChainRuleId,
): readonly ChainMatch<TEvent>[] {
  return analysis.byRule[ruleId] ?? [];
}

/**
 * Returns all detected chains for a specific period (1H or 2H).
 * Useful for period-split tactical pages.
 */
export function selectChainsForPeriod<TEvent extends ChainableEvent>(
  analysis: ChainAnalysis<TEvent>,
  period: MatchEventPeriod,
): readonly ChainMatch<TEvent>[] {
  return analysis.byPeriod[period] ?? [];
}

/**
 * Returns all detected chains for a specific segment (1–6).
 * Useful for segment-level breakdown pages.
 */
export function selectChainsForSegment<TEvent extends ChainableEvent>(
  analysis: ChainAnalysis<TEvent>,
  segment: MatchEventSegment,
): readonly ChainMatch<TEvent>[] {
  return analysis.bySegment[segment] ?? [];
}

/**
 * Returns all detected chains for a specific team side.
 * Useful for opposition trend pages (pass analysis.byTeamSide.opp).
 */
export function selectChainsForSide<TEvent extends ChainableEvent>(
  analysis: ChainAnalysis<TEvent>,
  side: "FOR" | "OPP",
): readonly ChainMatch<TEvent>[] {
  return side === "FOR" ? analysis.byTeamSide.for : analysis.byTeamSide.opp;
}

// ─── Possession Outcomes selectors (V1.1) ─────────────────────────────────────

/**
 * Computes the full Possession Outcomes summary from raw events.
 *
 * Call once per export alongside selectChainAnalysis() — they share the same
 * raw event array and are independently pure, so both can run in sequence with
 * no redundant computation beyond the two separate clock-sort passes.
 *
 * Covers: kickouts, turnovers, frees (all six origin event kinds).
 */
export function selectPossessionOutcomeSummary<TEvent extends ChainableEvent>(
  events: readonly TEvent[],
): PossessionOutcomeSummary<TEvent> {
  return buildPossessionOutcomeSummary(events);
}

/**
 * Derives MatchIntelligence from a pre-computed PossessionOutcomeSummary.
 *
 * Intended usage:
 *   const summary = selectPossessionOutcomeSummary(events);
 *   const intel   = selectMatchIntelligence(summary);
 */
export function selectMatchIntelligence(
  summary: PossessionOutcomeSummary,
): MatchIntelligence {
  return buildMatchIntelligence(summary);
}
