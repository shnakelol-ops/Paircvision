/**
 * pdfReportViews.ts
 *
 * Canonical coach-facing metric views for PDF page builders.
 * Every percentage, ratio, restart, turnover, chain, and scoring rate used
 * in reviewPdfExport.ts must come from this module.
 */

import type { ChainRuleId } from "../chains/chain-types";
import type { ChainableEvent } from "../chains/chain-types";
import type { MatchEventKind } from "../../core/stats/stats-event-model";
import type { MatchReport } from "./matchReport";
import { fraction, fmtFractionCounts, type MetricFraction } from "./report-types";
import {
  viewRestartLossPunishment,
  viewRestartShare,
  viewRestartWinsToScore,
  viewTurnoverLossPunishment,
  viewTurnoverShare,
  viewTurnoverWinsToScore,
  viewTurnoverWonToShotOnly,
} from "./reportViews";
import { viewRestartShareForTeam, viewShootingConversion } from "./teamStatsViews";

// ─── Formatting ───────────────────────────────────────────────────────────────

export function pctLabel(f: MetricFraction): string {
  return f.den > 0 ? `${f.pct}%` : "—";
}

export function countPctLabel(num: number, f: MetricFraction): string {
  return f.den > 0 ? `${num} (${f.pct}%)` : `${num} (—)`;
}

/** Bar width fraction 0–1 for comparison bars. */
export function shareBarFraction(f: MetricFraction): number {
  return f.den > 0 ? f.num / f.den : 0.5;
}

export function complementBarFraction(f: MetricFraction): number {
  return f.den > 0 ? 1 - f.num / f.den : 0.5;
}

/** Percent label from raw counts — canonical alternative to renderer-local Math.round. */
export function fractionPctLabel(num: number, den: number): string {
  return pctLabel(fraction(num, den));
}

export function countFractionPctLabel(num: number, den: number): string {
  return den > 0 ? `${num} (${fraction(num, den).pct}%)` : `${num} (—)`;
}

export function shareBarFromCounts(num: number, den: number): number {
  return shareBarFraction(fraction(num, den));
}

export function restartShareCountsLabel<T extends ChainableEvent>(
  report: MatchReport<T>,
): string {
  const f = viewRestartShare(report);
  return f.den > 0 ? `${f.pct}% (${fmtFractionCounts(f)})` : "—";
}

// ─── Restart (chain-origin) ───────────────────────────────────────────────────

export function viewRestartShareHalf<T extends ChainableEvent>(
  report: MatchReport<T>,
  half: "1H" | "2H",
): MetricFraction {
  return half === "1H" ? report.restarts.restartShare.h1 : report.restarts.restartShare.h2;
}

export function viewRestartShareOpposition<T extends ChainableEvent>(
  report: MatchReport<T>,
): MetricFraction {
  return viewRestartShareForTeam(report, "OPP");
}

export function viewOwnKickoutRetentionHalf<T extends ChainableEvent>(
  report: MatchReport<T>,
  half: "1H" | "2H",
): MetricFraction {
  return half === "1H"
    ? report.restarts.ownKickoutRetention.h1
    : report.restarts.ownKickoutRetention.h2;
}

// ─── Turnover (chain-origin) ──────────────────────────────────────────────────

export function viewTurnoverWinsToShot<T extends ChainableEvent>(
  report: MatchReport<T>,
): MetricFraction {
  const tv = report.chain.turnovers;
  return fraction(tv.wonToShot, tv.won);
}

export function viewTurnoverShareHalf<T extends ChainableEvent>(
  report: MatchReport<T>,
  half: "1H" | "2H",
): MetricFraction {
  return half === "1H"
    ? report.turnovers.turnoverShare.h1
    : report.turnovers.turnoverShare.h2;
}

// ─── Chain rule matches ───────────────────────────────────────────────────────

export function viewChainRuleCount<T extends ChainableEvent>(
  report: MatchReport<T>,
  ruleId: ChainRuleId,
  side?: "FOR" | "OPP",
): number {
  const chains = report.chain.byRule[ruleId] ?? [];
  return side == null ? chains.length : chains.filter((c) => c.teamSide === side).length;
}

export function viewChainForShare<T extends ChainableEvent>(
  report: MatchReport<T>,
): MetricFraction {
  const sm = report.chain.summary;
  return fraction(sm.forChains, sm.totalChains);
}

export function viewChainOppShare<T extends ChainableEvent>(
  report: MatchReport<T>,
): MetricFraction {
  const sm = report.chain.summary;
  return fraction(sm.oppChains, sm.totalChains);
}

export function viewChainSidePeriodCount<T extends ChainableEvent>(
  report: MatchReport<T>,
  side: "FOR" | "OPP",
  period: "1H" | "2H",
): number {
  return (report.chain.byPeriod[period] ?? []).filter((c) => c.teamSide === side).length;
}

// ─── Shooting & placed balls ──────────────────────────────────────────────────

const FREE_ATTEMPT_KINDS = new Set<MatchEventKind>(["FREE_SCORED", "FREE_MISSED"]);

export function viewFreeConversion<T extends ChainableEvent>(
  report: MatchReport<T>,
  team: "FOR" | "OPP",
): MetricFraction {
  const own = report.events.filter((e) => e.teamSide === team && FREE_ATTEMPT_KINDS.has(e.kind));
  const scored = own.filter((e) => e.kind === "FREE_SCORED").length;
  return fraction(scored, own.length);
}

export function viewShootingConversionPct<T extends ChainableEvent>(
  report: MatchReport<T>,
  team: "FOR" | "OPP",
): number {
  return viewShootingConversion(report, team).pct;
}

// ─── Kickout tag distribution (share of won restarts) ─────────────────────────

export function viewKickoutWonTagShare<T extends ChainableEvent>(
  report: MatchReport<T>,
  tag: string,
): MetricFraction {
  // Use chain won count as denominator
  const denom = report.chain.kickouts.won;
  let num = 0;
  for (const e of report.events) {
    if (e.kind !== "KICKOUT_WON" || e.teamSide !== "FOR") continue;
    if (e.tags?.includes(tag)) num++;
  }
  return fraction(num, denom);
}

// ─── Re-exports for convenience in PDF builders ───────────────────────────────

export {
  viewRestartShare,
  viewRestartWinsToScore,
  viewRestartLossPunishment,
  viewTurnoverShare,
  viewTurnoverWinsToScore,
  viewTurnoverLossPunishment,
  viewTurnoverWonToShotOnly,
};
