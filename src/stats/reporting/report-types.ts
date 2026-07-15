/**
 * report-types.ts
 *
 * Shared types for the canonical PáircVision reporting model.
 * Every coach-facing number is exposed as an explicit fraction (num/den/pct)
 * or as a reference into chain / possession engine outputs on MatchReport.
 */

import type { MatchEventPeriod } from "../../core/stats/stats-event-model";

/** Scope applied before any engine runs. */
export type ReportScope = "FULL" | "1H" | "2H";

export function scopeToPeriod(scope: ReportScope): MatchEventPeriod | null {
  if (scope === "1H") return "1H";
  if (scope === "2H") return "2H";
  return null;
}

/** A numerator/denominator pair with a pre-rounded 0–100 integer percent. */
export type MetricFraction = {
  num: number;
  den: number;
  /** Math.round(num / den × 100); 0 when den === 0. */
  pct: number;
};

export type MetricHalfSplit = {
  full: MetricFraction;
  h1: MetricFraction;
  h2: MetricFraction;
};

/** "15 of 24" */
export function fmtFractionCounts(f: MetricFraction): string {
  return `${f.num} of ${f.den}`;
}

/** "63% (15 of 24)" — dash when the denominator is zero. */
export function fmtFractionPct(f: MetricFraction): string {
  return f.den > 0 ? `${f.pct}% (${fmtFractionCounts(f)})` : "—";
}

export function fraction(num: number, den: number): MetricFraction {
  return { num, den, pct: den > 0 ? Math.round((num / den) * 100) : 0 };
}
