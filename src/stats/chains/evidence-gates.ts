/**
 * evidence-gates.ts
 *
 * Pure suppression gates for coach-facing intelligence sentences.
 *
 * A gate never changes a statistic. It only decides whether the recorded
 * evidence is strong enough for a sentence to be printed. When the evidence
 * cannot be established, the sentence is suppressed — never replaced with an
 * inferred alternative.
 *
 * Gates in this file:
 *   measureHalfCoverage / halfCoverageComparable
 *       — is the event log complete enough, in both halves, to compare them?
 *   halfComparisonVerdict
 *       — coverage + per-metric sample size + one-event sensitivity for a
 *         first-half vs second-half rate comparison.
 *   turnoverRulesMeasurable / freeRulesMeasurable
 *       — can the chain engine's turnover / free rules see this side's wins
 *         at all, given how those events were logged?
 *   formatRunWindow
 *       — clock label for a scoring run that names each end in its own half.
 *
 * KNOWN LIMITATIONS of the half-coverage gate (it is a heuristic, not proof):
 *   - It cannot see events that were never logged. A half can pass every
 *     check and still be selectively logged (e.g. scores logged, kickouts
 *     not). It only catches the visible signs of partial logging: a late
 *     start, an early stop, long silent gaps, or too few events.
 *   - It needs the scheduled half length. Match Stats does not save one, so
 *     half comparisons are always suppressed for Match Stats reports.
 *   - Stoppage time is not modelled: a half that ends at 85% of its
 *     scheduled length with no further events is treated as complete.
 *   - Thresholds below are working values chosen to be conservative. They
 *     are not validated against a corpus of fully-logged matches.
 *
 * Pure TypeScript — no canvas, DOM, jsPDF or React. Imports only chain-types.
 */

import type { MatchEventPeriod } from "../../core/stats/stats-event-model";
import type { ChainableEvent, ChainAnalysis, ScoringRun } from "./chain-types";

// ─── Half-time comparison thresholds ─────────────────────────────────────────

export const HALF_COMPARISON_LIMITS = {
  /** First logged event of each half must be at or before this clock. */
  maxStartSeconds: 300,
  /** Last logged event of each half must reach this share of the scheduled half. */
  minEndFraction: 0.85,
  /** No silence between consecutive logged events longer than this. */
  maxGapSeconds: 480,
  /** Minimum logged events (all kinds) in each half. */
  minEventsPerHalf: 20,
  /** Shorter recorded window ÷ longer recorded window must be at least this. */
  minWindowRatio: 0.8,
  /** Minimum events behind the compared metric in each half. */
  minMetricEventsPerHalf: 6,
} as const;

// ─── Half coverage ───────────────────────────────────────────────────────────

export type HalfWindow = {
  /** Logged events in the half (virtual instant-score markers excluded). */
  events: number;
  /** Events in the half with no usable match clock. */
  untimedEvents: number;
  /** Earliest logged clock in the half (seconds into the half), or null. */
  firstClock: number | null;
  /** Latest logged clock in the half (seconds into the half), or null. */
  lastClock: number | null;
  /** Longest silence between consecutive timed events in the half. */
  maxGapSeconds: number;
};

export type HalfCoverage = {
  /** Scheduled half length in seconds; null when the capture tool did not save one. */
  halfDurationSeconds: number | null;
  halves: Record<"1H" | "2H", HalfWindow>;
};

function hasClock(e: ChainableEvent): e is ChainableEvent & { matchClockSeconds: number } {
  const c = e.matchClockSeconds;
  return typeof c === "number" && Number.isFinite(c) && c >= 0;
}

function measureHalf(events: readonly ChainableEvent[], period: MatchEventPeriod): HalfWindow {
  const inHalf = events.filter(
    (e) => e.period === period && !e.id.includes("-instant-score-"),
  );
  const clocks = inHalf.filter(hasClock).map((e) => e.matchClockSeconds).sort((a, b) => a - b);
  let maxGapSeconds = 0;
  for (let i = 1; i < clocks.length; i++) {
    maxGapSeconds = Math.max(maxGapSeconds, clocks[i] - clocks[i - 1]);
  }
  return {
    events: inHalf.length,
    untimedEvents: inHalf.length - clocks.length,
    firstClock: clocks.length > 0 ? clocks[0] : null,
    lastClock: clocks.length > 0 ? clocks[clocks.length - 1] : null,
    maxGapSeconds,
  };
}

/**
 * Measures how much of each half the event log covers. Read-only: the
 * events are not modified and no statistic is derived from the result.
 */
export function measureHalfCoverage(
  events: readonly ChainableEvent[],
  halfDurationMinutes?: number | null,
): HalfCoverage {
  const halfDurationSeconds =
    typeof halfDurationMinutes === "number" && Number.isFinite(halfDurationMinutes) && halfDurationMinutes > 0
      ? halfDurationMinutes * 60
      : null;
  return {
    halfDurationSeconds,
    halves: { "1H": measureHalf(events, "1H"), "2H": measureHalf(events, "2H") },
  };
}

export type CoverageVerdict =
  | { comparable: true }
  | { comparable: false; reason: string };

/**
 * True only when BOTH halves are demonstrably logged from start to finish
 * over comparable windows. Any doubt suppresses the comparison.
 */
export function halfCoverageComparable(coverage: HalfCoverage | null | undefined): CoverageVerdict {
  if (coverage == null) return { comparable: false, reason: "no coverage information" };
  const L = HALF_COMPARISON_LIMITS;
  const duration = coverage.halfDurationSeconds;
  if (duration == null) return { comparable: false, reason: "scheduled half length unknown" };

  for (const period of ["1H", "2H"] as const) {
    const h = coverage.halves[period];
    if (h.events < L.minEventsPerHalf) return { comparable: false, reason: `${period}: too few events` };
    if (h.untimedEvents > 0) return { comparable: false, reason: `${period}: events without a match clock` };
    if (h.firstClock == null || h.lastClock == null) return { comparable: false, reason: `${period}: no timed events` };
    if (h.firstClock > L.maxStartSeconds) return { comparable: false, reason: `${period}: logging started late` };
    if (h.lastClock < duration * L.minEndFraction) return { comparable: false, reason: `${period}: logging stopped early` };
    if (h.maxGapSeconds > L.maxGapSeconds) return { comparable: false, reason: `${period}: long gap between logged events` };
  }

  const w1 = coverage.halves["1H"].lastClock! - coverage.halves["1H"].firstClock!;
  const w2 = coverage.halves["2H"].lastClock! - coverage.halves["2H"].firstClock!;
  const longer = Math.max(w1, w2);
  if (longer <= 0 || Math.min(w1, w2) / longer < L.minWindowRatio) {
    return { comparable: false, reason: "recording windows not comparable" };
  }
  return { comparable: true };
}

// ─── Half-time rate comparison ───────────────────────────────────────────────

/** A per-half rate: `successes` out of `total` events. */
export type HalfRate = { total: number; successes: number };

export type HalfComparisonVerdict =
  | { show: false; reason: string }
  | { show: true; direction: "UP" | "DOWN"; h1Pct: number; h2Pct: number };

function rate(r: HalfRate): number {
  return r.total > 0 ? r.successes / r.total : 0;
}

/**
 * Decides whether a first-half vs second-half rate difference may be printed.
 *
 * All of the following must hold:
 *   1. halfCoverageComparable(coverage).
 *   2. Each half has at least minMetricEventsPerHalf events behind the rate.
 *   3. The difference is at least `thresholdPts` percentage points.
 *   4. One-event sensitivity: moving one success from the higher half to the
 *      lower half leaves a difference, in the same direction, of at least
 *      half the threshold.
 *
 * Reports a rise as readily as a fall.
 */
export function halfComparisonVerdict(
  coverage: HalfCoverage | null | undefined,
  h1: HalfRate,
  h2: HalfRate,
  thresholdPts: number,
): HalfComparisonVerdict {
  const cov = halfCoverageComparable(coverage);
  if (cov.comparable === false) return { show: false, reason: cov.reason };

  const min = HALF_COMPARISON_LIMITS.minMetricEventsPerHalf;
  if (h1.total < min || h2.total < min) return { show: false, reason: "too few events behind the rate" };

  const diff = (rate(h2) - rate(h1)) * 100;
  if (Math.abs(diff) < thresholdPts) return { show: false, reason: "difference below threshold" };

  const up = diff > 0;
  const hi = up ? h2 : h1;
  const lo = up ? h1 : h2;
  const hiMoved: HalfRate = { total: hi.total, successes: Math.max(0, hi.successes - 1) };
  const loMoved: HalfRate = { total: lo.total, successes: Math.min(lo.total, lo.successes + 1) };
  const movedGap = (rate(hiMoved) - rate(loMoved)) * 100;
  if (movedGap < thresholdPts / 2) return { show: false, reason: "difference does not survive moving one event" };

  return {
    show: true,
    direction: up ? "UP" : "DOWN",
    h1Pct: Math.round(rate(h1) * 100),
    h2Pct: Math.round(rate(h2) * 100),
  };
}

// ─── Turnover rule measurability ─────────────────────────────────────────────

/**
 * The turnover chain rules anchor on TURNOVER_WON events credited to the side
 * that logged them. A turnover a side won but that was recorded as the OTHER
 * side's TURNOVER_LOST is invisible to those rules. When any such event
 * exists, that side's turnover rule counts are incomplete and must be shown
 * as unavailable ("—"), not as a count.
 */
export function turnoverRulesMeasurable<TEvent extends ChainableEvent>(
  analysis: ChainAnalysis<TEvent>,
  side: "FOR" | "OPP",
): boolean {
  return !analysis.turnovers.outcomes.some(
    (o) => o.turnoverEvent.kind === "TURNOVER_LOST" && o.turnoverEvent.teamSide !== side,
  );
}

/**
 * Same limitation for the FREE_WON_TO_GOAL rule: it anchors on FREE_WON
 * events credited to the side that logged them, so a free a side won that
 * was recorded as the other side's FREE_CONCEDED is invisible to it.
 */
export function freeRulesMeasurable(
  events: readonly ChainableEvent[],
  side: "FOR" | "OPP",
): boolean {
  return !events.some((e) => e.kind === "FREE_CONCEDED" && e.teamSide !== side);
}

// ─── Scoring run clock labels ────────────────────────────────────────────────

const SECOND_HALF_OFFSET = 3600;

function minuteInHalf(clock: number, period: MatchEventPeriod): number {
  const inHalf = period === "2H" ? clock - SECOND_HALF_OFFSET : clock;
  return Math.floor(Math.max(0, inHalf) / 60);
}

/**
 * "1H 5'–7'", "2H 9'", or — for a run that continues past half-time —
 * "1H 33'–2H 0'". Each end is labelled with the half its own event is in.
 * Display only: the run itself is unchanged.
 */
export function formatRunWindow<TEvent extends ChainableEvent>(run: ScoringRun<TEvent>): string {
  const startPeriod = run.period;
  const endPeriod = run.events.length > 0 ? run.events[run.events.length - 1].period : startPeriod;
  const startMin = minuteInHalf(run.startClockSeconds, startPeriod);
  const endMin = minuteInHalf(run.endClockSeconds, endPeriod);
  if (startPeriod !== endPeriod) return `${startPeriod} ${startMin}'–${endPeriod} ${endMin}'`;
  if (startMin === endMin) return `${startPeriod} ${startMin}'`;
  return `${startPeriod} ${startMin}'–${endMin}'`;
}
