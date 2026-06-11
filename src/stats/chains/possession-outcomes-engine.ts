/**
 * possession-outcomes-engine.ts
 *
 * Pure functional engine that turns raw match events into possession outcome
 * summaries for the Possession Outcomes card and PDF page (PáircVision V1.1).
 *
 * Entry points:
 *   buildPossessionOutcomeSummary(events)  → PossessionOutcomeSummary
 *   buildMatchIntelligence(summary)        → MatchIntelligence
 *
 * Design constraints:
 *   - Pure functions only — no side effects, no async, no DOM.
 *   - Operates on ChainableEvent (same interface as chain-engine.ts).
 *   - Does NOT import from reviewPdfExport.ts (circular import guard).
 *   - Does NOT modify or re-run the existing chain datasets.
 *   - Duplicates the clock-resolution helper from chain-engine.ts intentionally
 *     to keep both engines independently deployable.
 */

import type { MatchEventKind, MatchEventSegment } from "../../core/stats/stats-event-model";
import type {
  ChainableEvent,
  MatchIntelligence,
  PossessionFamilySummary,
  PossessionOriginKind,
  PossessionOutcomeFamily,
  PossessionOutcomeKind,
  PossessionOutcomeSummary,
  PossessionResult,
} from "./chain-types";

// ─── Clock resolution (mirrors chain-engine.ts — kept independent) ────────────

const SEGMENT_MIDPOINTS: Record<MatchEventSegment, number> = {
  1: 300, 2: 900, 3: 1500,
  4: 300, 5: 900, 6: 1500,
};
const SECOND_HALF_OFFSET = 3600;

type Timed<TEvent> = { event: TEvent; clock: number; clockIsReal: boolean };

function resolveClock<TEvent extends ChainableEvent>(event: TEvent): Timed<TEvent> {
  const raw = event.matchClockSeconds;
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) {
    const base = event.period === "2H" ? SECOND_HALF_OFFSET : 0;
    return { event, clock: base + raw, clockIsReal: true };
  }
  const mid = SEGMENT_MIDPOINTS[event.segment] ?? 300;
  const clock = event.period === "2H" ? mid + SECOND_HALF_OFFSET : mid;
  return { event, clock, clockIsReal: false };
}

// ─── Event kind sets ──────────────────────────────────────────────────────────

const GOAL_KINDS = new Set<MatchEventKind>(["GOAL"]);

const POINT_KINDS = new Set<MatchEventKind>([
  "POINT", "TWO_POINTER", "FORTY_FIVE_TWO_POINT", "FREE_SCORED",
]);

const WIDE_KINDS = new Set<MatchEventKind>(["WIDE", "FREE_MISSED"]);

const SHOT_KINDS = new Set<MatchEventKind>(["SHOT"]);

const POSSESSION_RESET_KINDS = new Set<MatchEventKind>([
  "KICKOUT_WON", "KICKOUT_CONCEDED",
  "FREE_WON", "FREE_CONCEDED",
]);

// ─── Acting side resolution ───────────────────────────────────────────────────

/**
 * Returns which team had the ball AFTER a given origin event.
 *
 * KICKOUT_CONCEDED, TURNOVER_LOST, FREE_CONCEDED all hand possession to
 * the OPPOSITE side from the event's teamSide (the recorder's perspective).
 */
function actingSideFor(event: ChainableEvent): "FOR" | "OPP" {
  if (
    event.kind === "KICKOUT_CONCEDED" ||
    event.kind === "TURNOVER_LOST" ||
    event.kind === "FREE_CONCEDED"
  ) {
    return event.teamSide === "FOR" ? "OPP" : "FOR";
  }
  return event.teamSide;
}

// ─── Possession outcome resolution ───────────────────────────────────────────

type ResolvedOutcome<TEvent> = {
  outcome: PossessionOutcomeKind;
  outcomingEvent: TEvent | null;
  secondsToOutcome: number | null;
  goals: number;
  points: number;
};

/**
 * Scans forward from originIdx to find the definitive outcome of a possession.
 *
 * Stops at the first of:
 *   - Score (GOAL / POINT / 2-PT / 45 / FREE_SCORED) by actingSide → GOAL or POINT
 *   - Wide or missed free by actingSide → WIDE
 *   - Turnover loss by actingSide → TURNOVER
 *   - A new possession-restart event (kickout / free) → scan boundary, RECYCLED
 *   - Clock window exceeded → RECYCLED (or SHOT if a SHOT event was seen)
 */
function resolveOutcome<TEvent extends ChainableEvent>(
  originIdx: number,
  sorted: readonly Timed<TEvent>[],
  actingSide: "FOR" | "OPP",
  originEntry: Timed<TEvent>,
  windowSeconds: number,
): ResolvedOutcome<TEvent> {
  let latestShotEvent: TEvent | null = null;

  function secs(fwd: Timed<TEvent>): number | null {
    return originEntry.clockIsReal && fwd.clockIsReal
      ? Math.max(0, fwd.clock - originEntry.clock)
      : null;
  }

  for (let j = originIdx + 1; j < sorted.length; j++) {
    const fwd = sorted[j];

    // Clock window cap (only enforced when both events have real clocks)
    if (
      originEntry.clockIsReal &&
      fwd.clockIsReal &&
      fwd.clock - originEntry.clock > windowSeconds
    ) break;

    // A new possession-restart event means the phase has ended
    if (POSSESSION_RESET_KINDS.has(fwd.event.kind)) break;

    const side = fwd.event.teamSide;

    if (side === actingSide) {
      if (GOAL_KINDS.has(fwd.event.kind)) {
        return { outcome: "GOAL", outcomingEvent: fwd.event, secondsToOutcome: secs(fwd), goals: 1, points: 0 };
      }
      if (POINT_KINDS.has(fwd.event.kind)) {
        return { outcome: "POINT", outcomingEvent: fwd.event, secondsToOutcome: secs(fwd), goals: 0, points: 1 };
      }
      if (WIDE_KINDS.has(fwd.event.kind)) {
        return { outcome: "WIDE", outcomingEvent: fwd.event, secondsToOutcome: secs(fwd), goals: 0, points: 0 };
      }
      if (SHOT_KINDS.has(fwd.event.kind) && latestShotEvent === null) {
        latestShotEvent = fwd.event;
        // SHOT is ambiguous — mark it but keep scanning
      }
      // actingSide turned it over
      if (fwd.event.kind === "TURNOVER_LOST") {
        return { outcome: "TURNOVER", outcomingEvent: fwd.event, secondsToOutcome: secs(fwd), goals: 0, points: 0 };
      }
    } else {
      // Opposition event: if they won a turnover, actingSide lost the ball
      if (fwd.event.kind === "TURNOVER_WON") {
        return { outcome: "TURNOVER", outcomingEvent: fwd.event, secondsToOutcome: secs(fwd), goals: 0, points: 0 };
      }
    }
  }

  // No definitive outcome in window
  if (latestShotEvent !== null) {
    return { outcome: "SHOT", outcomingEvent: latestShotEvent, secondsToOutcome: null, goals: 0, points: 0 };
  }
  return { outcome: "RECYCLED", outcomingEvent: null, secondsToOutcome: null, goals: 0, points: 0 };
}

// ─── Aggregate builders ───────────────────────────────────────────────────────

function buildFamilySummary<TEvent extends ChainableEvent>(
  results: readonly PossessionResult<TEvent>[],
): PossessionFamilySummary {
  const count = results.length;
  let goals = 0;
  let points = 0;
  let wides = 0;
  let turnovers = 0;
  let recycled = 0;

  for (const r of results) {
    goals += r.goals;
    points += r.points;
    if (r.outcome === "WIDE" || r.outcome === "SHOT") wides++;
    if (r.outcome === "TURNOVER") turnovers++;
    if (r.outcome === "RECYCLED") recycled++;
  }

  const scoreValue = goals * 3 + points;
  const scoringPct = count > 0 ? Math.round(((goals + points) / count) * 100) : 0;

  return { count, goals, points, wides, turnovers, recycled, scoreValue, scoringPct };
}

function netLabel(net: number): string {
  if (net > 0) return `+${net}`;
  if (net < 0) return `${net}`;
  return "0";
}

function buildFamily<TEvent extends ChainableEvent>(
  originKind: PossessionOriginKind,
  results: readonly PossessionResult<TEvent>[],
): PossessionOutcomeFamily<TEvent> {
  const retainedResults = results.filter((r) => r.actingSide === "FOR");
  const concededResults = results.filter((r) => r.actingSide === "OPP");

  const retained = buildFamilySummary(retainedResults);
  const conceded = buildFamilySummary(concededResults);

  const total = results.length;
  const retainedCount = retainedResults.length;
  const concededCount = concededResults.length;

  const damagePct =
    concededCount > 0
      ? Math.round(((conceded.goals + conceded.points) / concededCount) * 100)
      : 0;
  const escapePct = 100 - damagePct;

  const net = retained.scoreValue - conceded.scoreValue;

  return {
    originKind,
    total,
    retainedCount,
    concededCount,
    retentionPct: total > 0 ? Math.round((retainedCount / total) * 100) : 0,
    stealPct:     total > 0 ? Math.round((concededCount / total) * 100) : 0,
    retained,
    conceded,
    damagePct,
    escapePct,
    netOutcome: net,
    netLabel:   netLabel(net),
    results,
  };
}

// ─── Origin event classification ─────────────────────────────────────────────

const KICKOUT_KINDS = new Set<MatchEventKind>(["KICKOUT_WON", "KICKOUT_CONCEDED"]);
const TURNOVER_KINDS = new Set<MatchEventKind>(["TURNOVER_WON", "TURNOVER_LOST"]);
const FREE_KINDS = new Set<MatchEventKind>(["FREE_WON", "FREE_CONCEDED"]);

const KICKOUT_WINDOW_SECS = 90;
const TURNOVER_WINDOW_SECS = 60;
const FREE_WINDOW_SECS = 45;

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * buildPossessionOutcomeSummary
 *
 * Scans raw match events and returns a full possession outcome breakdown
 * across kickouts, turnovers, and frees.
 *
 * This is a pure function — no side effects, no mutations, no async.
 * It is safe to call concurrently with analyseChains() on the same event array.
 *
 * @param events  Raw events (unsorted, unfiltered — same input as analyseChains)
 */
export function buildPossessionOutcomeSummary<TEvent extends ChainableEvent>(
  events: readonly TEvent[],
): PossessionOutcomeSummary<TEvent> {
  // 1. Filter virtual instant-score markers (same guard as chain-engine.ts)
  const valid = events.filter((e) => !e.id.includes("-instant-score-"));

  // 2. Resolve clocks and sort chronologically
  const sorted: Timed<TEvent>[] = valid.map(resolveClock);
  sorted.sort((a, b) => a.clock - b.clock);

  // 3. Scan every event; classify origins and resolve their possession outcome
  const kickoutResults: PossessionResult<TEvent>[] = [];
  const turnoverResults: PossessionResult<TEvent>[] = [];
  const freeResults: PossessionResult<TEvent>[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const entry = sorted[i];
    const { kind } = entry.event;

    let targetArray: PossessionResult<TEvent>[] | null = null;
    let windowSecs = KICKOUT_WINDOW_SECS;

    if (KICKOUT_KINDS.has(kind)) {
      targetArray = kickoutResults;
      windowSecs = KICKOUT_WINDOW_SECS;
    } else if (TURNOVER_KINDS.has(kind)) {
      targetArray = turnoverResults;
      windowSecs = TURNOVER_WINDOW_SECS;
    } else if (FREE_KINDS.has(kind)) {
      targetArray = freeResults;
      windowSecs = FREE_WINDOW_SECS;
    }

    if (targetArray === null) continue;

    const actingSide = actingSideFor(entry.event);
    const resolved = resolveOutcome(i, sorted, actingSide, entry, windowSecs);

    targetArray.push({
      originEvent: entry.event,
      actingSide,
      outcome: resolved.outcome,
      outcomingEvent: resolved.outcomingEvent,
      secondsToOutcome: resolved.secondsToOutcome,
      goals: resolved.goals,
      points: resolved.points,
    });
  }

  // 4. Aggregate into families
  const kickouts  = buildFamily<TEvent>("KICKOUT",  kickoutResults);
  const turnovers = buildFamily<TEvent>("TURNOVER", turnoverResults);
  const frees     = buildFamily<TEvent>("FREE",     freeResults);

  // 5. Ownership split: partition kickouts by restartOwner when data is present.
  //    Old matches (restartOwner absent) fall back to the combined kickouts view.
  const hasOwnershipData = kickoutResults.some((r) => r.originEvent.restartOwner != null);
  const ourKickoutResults   = kickoutResults.filter((r) => r.originEvent.restartOwner === "FOR");
  const theirKickoutResults = kickoutResults.filter((r) => r.originEvent.restartOwner === "OPP");
  const ourKickouts   = hasOwnershipData && ourKickoutResults.length   > 0
    ? buildFamily<TEvent>("KICKOUT", ourKickoutResults)   : null;
  const theirKickouts = hasOwnershipData && theirKickoutResults.length > 0
    ? buildFamily<TEvent>("KICKOUT", theirKickoutResults) : null;

  const overallNetOutcome =
    kickouts.netOutcome + turnovers.netOutcome + frees.netOutcome;

  return { kickouts, ourKickouts, theirKickouts, turnovers, frees, overallNetOutcome };
}

// ─── Match Intelligence ───────────────────────────────────────────────────────

type InsightCandidate = {
  significance: number;
  text: string;
};

/**
 * Generates a coaching priority string with embedded numbers.
 * All text is factual and non-prescriptive (mirrors review-prompts.ts tone).
 */
function makePriority(text: string, significance: number): InsightCandidate {
  return { significance, text };
}

/**
 * buildMatchIntelligence
 *
 * Derives high-level coaching insights from a PossessionOutcomeSummary.
 * Pure function — deterministic, threshold-based, no inference.
 *
 * @param summary  Output of buildPossessionOutcomeSummary()
 */
export function buildMatchIntelligence(
  summary: PossessionOutcomeSummary,
): MatchIntelligence {
  const { kickouts, turnovers, frees } = summary;

  // ── Family labels for display ────────────────────────────────────────────
  const families: Array<{ label: string; family: PossessionOutcomeFamily }> = [
    { label: "Kickouts",  family: kickouts },
    { label: "Turnovers", family: turnovers },
    { label: "Frees",     family: frees },
  ];

  // ── Highest damage family ────────────────────────────────────────────────
  const withConceded = families.filter((f) => f.family.concededCount >= 3);
  const highestDamageFamily =
    withConceded.length > 0
      ? withConceded.reduce((best, f) =>
          f.family.damagePct > best.family.damagePct ? f : best,
        )
      : null;

  // ── Best / worst scoring family (retained count ≥ 3 to be meaningful) ───
  const withRetained = families.filter((f) => f.family.retainedCount >= 3);

  const bestScoringFamily =
    withRetained.length > 0
      ? withRetained.reduce((best, f) =>
          f.family.retained.scoringPct > best.family.retained.scoringPct ? f : best,
        )
      : null;

  const worstScoringFamily =
    withRetained.length > 0
      ? withRetained.reduce((worst, f) =>
          f.family.retained.scoringPct < worst.family.retained.scoringPct ? f : worst,
        )
      : null;

  // ── Coaching priorities (deterministic threshold rules) ──────────────────
  const candidates: InsightCandidate[] = [];

  // Kickout retention
  if (kickouts.total >= 5) {
    if (kickouts.retentionPct >= 70) {
      candidates.push(makePriority(
        `Kickout retention strong — won ${kickouts.retainedCount}/${kickouts.total} (${kickouts.retentionPct}%)`,
        kickouts.retentionPct - 50,
      ));
    } else if (kickouts.retentionPct < 45) {
      candidates.push(makePriority(
        `Kickout retention below par — won ${kickouts.retainedCount}/${kickouts.total} (${kickouts.retentionPct}%)`,
        50 - kickouts.retentionPct,
      ));
    }
  }

  // Kickout damage (when they won kickouts)
  if (kickouts.concededCount >= 3) {
    if (kickouts.damagePct >= 60) {
      candidates.push(makePriority(
        `Opposition scored from ${kickouts.conceded.goals + kickouts.conceded.points}/${kickouts.concededCount} kickouts they won (${kickouts.damagePct}%)`,
        kickouts.damagePct - 40,
      ));
    } else if (kickouts.damagePct < 25) {
      candidates.push(makePriority(
        `Good resistance when kickout lost — opposition scored from only ${kickouts.conceded.goals + kickouts.conceded.points}/${kickouts.concededCount} (${kickouts.damagePct}%)`,
        25 - kickouts.damagePct,
      ));
    }
  }

  // Kickout scoring (when we won kickouts)
  if (kickouts.retainedCount >= 3) {
    if (kickouts.retained.scoringPct >= 55) {
      candidates.push(makePriority(
        `Kickouts won converted well — scored from ${kickouts.retained.goals + kickouts.retained.points}/${kickouts.retainedCount} (${kickouts.retained.scoringPct}%)`,
        kickouts.retained.scoringPct - 35,
      ));
    } else if (kickouts.retained.scoringPct < 20) {
      candidates.push(makePriority(
        `Low conversion from kickouts won — scored from ${kickouts.retained.goals + kickouts.retained.points}/${kickouts.retainedCount} (${kickouts.retained.scoringPct}%)`,
        20 - kickouts.retained.scoringPct,
      ));
    }
  }

  // Turnover conversion (when we won turnovers)
  if (turnovers.retainedCount >= 4) {
    if (turnovers.retained.scoringPct >= 45) {
      candidates.push(makePriority(
        `Strong turnover conversion — scored from ${turnovers.retained.goals + turnovers.retained.points}/${turnovers.retainedCount} won (${turnovers.retained.scoringPct}%)`,
        turnovers.retained.scoringPct - 25,
      ));
    } else if (turnovers.retained.scoringPct < 15) {
      candidates.push(makePriority(
        `Turnover opportunities not converted — scored from ${turnovers.retained.goals + turnovers.retained.points}/${turnovers.retainedCount} won (${turnovers.retained.scoringPct}%)`,
        15 - turnovers.retained.scoringPct,
      ));
    }
  }

  // Turnover damage (when they won turnovers from us)
  if (turnovers.concededCount >= 4) {
    if (turnovers.damagePct >= 50) {
      candidates.push(makePriority(
        `Opposition punishing turnovers — scored from ${turnovers.conceded.goals + turnovers.conceded.points}/${turnovers.concededCount} wins (${turnovers.damagePct}%)`,
        turnovers.damagePct - 30,
      ));
    } else if (turnovers.damagePct < 20) {
      candidates.push(makePriority(
        `Limiting damage when losing ball — opposition scored from only ${turnovers.conceded.goals + turnovers.conceded.points}/${turnovers.concededCount} turnovers (${turnovers.damagePct}%)`,
        20 - turnovers.damagePct,
      ));
    }
  }

  // Free conversion (when we won frees)
  if (frees.retainedCount >= 3) {
    if (frees.retained.scoringPct >= 70) {
      candidates.push(makePriority(
        `Free kick accuracy high — converted ${frees.retained.goals + frees.retained.points}/${frees.retainedCount} (${frees.retained.scoringPct}%)`,
        frees.retained.scoringPct - 50,
      ));
    } else if (frees.retained.scoringPct < 40) {
      candidates.push(makePriority(
        `Free kick conversion below average — scored ${frees.retained.goals + frees.retained.points}/${frees.retainedCount} (${frees.retained.scoringPct}%)`,
        40 - frees.retained.scoringPct,
      ));
    }
  }

  // Free damage (when they won frees against us)
  if (frees.concededCount >= 3 && frees.damagePct >= 55) {
    candidates.push(makePriority(
      `Opposition converting conceded frees — scored from ${frees.conceded.goals + frees.conceded.points}/${frees.concededCount} (${frees.damagePct}%)`,
      frees.damagePct - 35,
    ));
  }

  // Overall net outcome (large positive or negative)
  const net = summary.overallNetOutcome;
  if (net >= 8) {
    candidates.push(makePriority(
      `Possession outcome strongly in favour — net +${net} points across all sources`,
      net,
    ));
  } else if (net <= -8) {
    candidates.push(makePriority(
      `Possession outcomes against — net ${net} points across all sources`,
      Math.abs(net),
    ));
  }

  // Sort by significance descending; pick top 3
  candidates.sort((a, b) => b.significance - a.significance);
  const topThree = candidates.slice(0, 3).map((c) => c.text);

  // Pad to exactly 3 if fewer candidates were generated
  while (topThree.length < 3) {
    const net2 = summary.overallNetOutcome;
    if (topThree.length === 0) {
      topThree.push(`Overall possession net outcome: ${netLabel(net2)} points`);
    } else if (topThree.length === 1) {
      topThree.push(`Kickout balance: won ${kickouts.retainedCount}, lost ${kickouts.concededCount}`);
    } else {
      topThree.push(`Turnover balance: won ${turnovers.retainedCount}, lost ${turnovers.concededCount}`);
    }
  }

  return {
    highestDamageFamily: highestDamageFamily
      ? { label: highestDamageFamily.label, damagePct: highestDamageFamily.family.damagePct }
      : null,
    bestScoringFamily: bestScoringFamily
      ? { label: bestScoringFamily.label, scoringPct: bestScoringFamily.family.retained.scoringPct }
      : null,
    worstScoringFamily: worstScoringFamily
      ? { label: worstScoringFamily.label, scoringPct: worstScoringFamily.family.retained.scoringPct }
      : null,
    overallNetOutcome: summary.overallNetOutcome,
    coachingPriorities: topThree,
  };
}
