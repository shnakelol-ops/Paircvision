/**
 * quickReviewMatchOverview.ts
 *
 * Pure assembly layer for Quick Review Page 1 ("Match Overview").
 *
 * PROVENANCE BOUNDARY (mirrors snapshotDashboardModel.ts's contract):
 * every field here is sourced from direct/factual match aggregates
 * (teamStatsViews.ts, placedBallMetrics.ts), immediate possession outcomes
 * (possession-outcomes-engine.ts, via report.possessions), or the plain
 * chronological scoring-run grouping (chain-engine.ts's buildScoringRunDataset,
 * via report.chain.scoringRuns — a deterministic ordering of raw score events,
 * not rule/chain matching). This module never reads report.restarts.restartToScore,
 * report.restarts.restartLossPunishment, report.turnovers.turnoverWinsToScore,
 * report.turnovers.turnoverLossPunishment, or report.chain.byRule/allChains —
 * the chain-origin / rule-match layer. There is nowhere in the type below for
 * an origin/chain field to be added without a visible type change.
 *
 * Quick Review answers "we won/lost this possession — what happened
 * immediately in it?" (possession-outcomes-engine), never "where did a later
 * scoring possession originate?" (chain-engine origin attribution). See
 * quickReviewMatchOverview.provenance.test.ts for the regression guard.
 *
 * The React renderer must not compute analytics — every value here is
 * already display-ready (counts, percentages, and formatted text).
 */

import type { ChainableEvent, PossessionFamilySummary } from "../chains/chain-types";
import type { MatchReport } from "./matchReport";
import { buildMatchReport } from "./matchReport";
import {
  buildTeamSummaryBlock,
  viewMirroredCountsForTeam,
  viewShootingConversion,
} from "./teamStatsViews";
import { fraction } from "./report-types";

// ─── Display value shapes ──────────────────────────────────────────────────

export type QuickReviewScoreLine = { goals: number; points: number; total: number; text: string };

export type QuickReviewShootingSide = {
  scores: number;
  attempts: number;
  pct: number;
  /** "5/11 (45%)"; "—" in place of the percentage when attempts is 0. */
  text: string;
};

export type QuickReviewRestartSide = {
  retained: number;
  total: number;
  pct: number;
  /** "3/7 retained (43%)"; "—" in place of the percentage when total is 0. */
  text: string;
};

export type QuickReviewPossessionConsequence = {
  shots: number;
  scores: number;
};

export type QuickReviewTurnoverSide = {
  count: number;
  shots: number;
  scores: number;
};

export type QuickReviewPlacedBalls = {
  scores: number;
  attempts: number;
  pct: number;
  /** "2/4 scored" — counts only; conversion % is exposed separately (pct) for
   *  optional display, not baked into the headline text (see product spec:
   *  a possession free is not automatically a placed-ball attempt, and the
   *  40-second read shouldn't be forced to carry a second percentage here). */
  text: string;
};

export type QuickReviewMatchOverview = {
  homeTeam: string;
  awayTeam: string;
  score: {
    home: QuickReviewScoreLine;
    away: QuickReviewScoreLine;
    /** "Ballylanders 0-05 — 0-04 Fr. Caseys" */
    text: string;
  };
  shooting: {
    for: QuickReviewShootingSide;
    opp: QuickReviewShootingSide;
  };
  longestRun: {
    for: number;
    opp: number;
  };
  restarts: {
    /** Own kickouts retained ÷ own kickouts taken. */
    ours: QuickReviewRestartSide;
    /** Opposition's own kickouts retained ÷ taken. */
    theirs: QuickReviewRestartSide;
    /** Immediate possession outcome after ANY kickout we ended up with. */
    won: QuickReviewPossessionConsequence;
    /** Immediate possession outcome after ANY kickout the opposition ended up with. */
    lost: QuickReviewPossessionConsequence;
  };
  turnovers: {
    won: QuickReviewTurnoverSide;
    lost: QuickReviewTurnoverSide;
  };
  frees: {
    won: number;
    conceded: number;
    placed: QuickReviewPlacedBalls;
  };
};

// ─── Formatting helpers (presentation only — no analytics) ─────────────────

/** "0-05" */
function fmtGoalsPoints(goals: number, points: number): string {
  return `${goals}-${String(points).padStart(2, "0")}`;
}

function pctOrDash(pct: number, den: number): string {
  return den > 0 ? `${pct}%` : "—";
}

// ─── Shared possession-outcome derivation (implemented ONCE — see hard rule) ─
//
// PossessionFamilySummary has no direct "shots" field. Per the approved
// derivation: shots = goals + points + wides, where "wides" already folds in
// the engine's ambiguous SHOT outcome (see possession-outcomes-engine.ts's
// buildFamilySummary). scores = goals + points. This is presentation
// assembly over an existing, validated field set — not a new metric — and
// must never be recomputed inline per call site.

function shotsAndScores(summary: PossessionFamilySummary): QuickReviewPossessionConsequence {
  return {
    shots: summary.goals + summary.points + summary.wides,
    scores: summary.goals + summary.points,
  };
}

// ─── Section builders ───────────────────────────────────────────────────────

function buildScoreSection<T extends ChainableEvent>(
  report: MatchReport<T>,
  homeTeam: string,
  awayTeam: string,
): QuickReviewMatchOverview["score"] {
  const home = report.ledger.forScore;
  const away = report.ledger.oppScore;
  const homeLine: QuickReviewScoreLine = { ...home, text: fmtGoalsPoints(home.goals, home.points) };
  const awayLine: QuickReviewScoreLine = { ...away, text: fmtGoalsPoints(away.goals, away.points) };
  return {
    home: homeLine,
    away: awayLine,
    text: `${homeTeam} ${homeLine.text} — ${awayLine.text} ${awayTeam}`,
  };
}

function buildShootingSide<T extends ChainableEvent>(
  report: MatchReport<T>,
  team: "FOR" | "OPP",
): QuickReviewShootingSide {
  const f = viewShootingConversion(report, team);
  return {
    scores: f.num,
    attempts: f.den,
    pct: f.pct,
    text: `${f.num}/${f.den} (${pctOrDash(f.pct, f.den)})`,
  };
}

function buildRestartSide(retained: number, total: number): QuickReviewRestartSide {
  const f = fraction(retained, total);
  return {
    retained,
    total,
    pct: f.pct,
    text: `${retained}/${total} retained (${pctOrDash(f.pct, total)})`,
  };
}

// ─── Main entry point ───────────────────────────────────────────────────────

/**
 * Builds the Quick Review Page 1 display model from the current, live
 * event array. Pure function — no canvas, no DOM, no React, no mutation of
 * its input. Safe to call every time the Quick Review sheet opens; always
 * reflects whatever loggedEvents currently holds (including edits/deletes),
 * with no caching across calls.
 *
 * Scope is always "FULL" (no period filter) — Quick Review means "state of
 * the match right now," using every event captured so far regardless of
 * which half is live. Never pass "1H"/"2H" here.
 */
/**
 * Forbidden-field guard: the keys a chain/origin/rule-match value would use
 * if one were ever added to this model. Mirrors
 * SNAPSHOT_DASHBOARD_FORBIDDEN_KEYS (snapshotDashboardModel.ts) and
 * MATCH_AND_POSSESSION_FACTS_FORBIDDEN_KEYS (reportProvenance.ts). Enforced
 * by quickReviewMatchOverview.provenance.test.ts via a runtime key-scan of a
 * built model, kept here (not just relied on via the type) so the guard
 * survives even if an `any` cast is introduced later.
 */
export const QUICK_REVIEW_FORBIDDEN_KEYS = [
  "restartOrigin",
  "turnoverOrigin",
  "originScore",
  "originScoreAgainst",
  "restartOriginScore",
  "turnoverOriginScore",
  "chainRate",
  "chainShare",
  "chainInvolvement",
  "ruleMatch",
  "wonToScore",
  "lostAllowedScore",
  "restartToScore",
  "restartLossPunishment",
  "turnoverWinsToScore",
  "turnoverLossPunishment",
] as const;

export function buildQuickReviewMatchOverview<T extends ChainableEvent>(
  events: readonly T[],
  homeTeam: string,
  awayTeam: string,
): QuickReviewMatchOverview {
  const report = buildMatchReport({ events, scope: "FULL", homeTeam, awayTeam });

  const forSummary = buildTeamSummaryBlock(report, "FOR");
  const mirroredFor = viewMirroredCountsForTeam(report, "FOR");

  const kickouts = report.possessions.kickouts;
  const turnovers = report.possessions.turnovers;

  return {
    homeTeam,
    awayTeam,
    score: buildScoreSection(report, homeTeam, awayTeam),
    shooting: {
      for: buildShootingSide(report, "FOR"),
      opp: buildShootingSide(report, "OPP"),
    },
    longestRun: {
      for: report.chain.scoringRuns.maxConsecutiveFor,
      opp: report.chain.scoringRuns.maxConsecutiveOpp,
    },
    restarts: {
      ours: buildRestartSide(report.restartTeams.for.ownRestartsRetained, report.restartTeams.for.ownRestartsTaken),
      theirs: buildRestartSide(report.restartTeams.opp.ownRestartsRetained, report.restartTeams.opp.ownRestartsTaken),
      won: shotsAndScores(kickouts.retained),
      lost: shotsAndScores(kickouts.conceded),
    },
    turnovers: {
      won: { count: mirroredFor.turnoversWon, ...shotsAndScores(turnovers.retained) },
      lost: { count: mirroredFor.turnoversLost, ...shotsAndScores(turnovers.conceded) },
    },
    frees: {
      won: forSummary.freesWon,
      conceded: forSummary.freesCon,
      placed: {
        scores: forSummary.placedScores,
        attempts: forSummary.placedAttempts,
        pct: fraction(forSummary.placedScores, forSummary.placedAttempts).pct,
        text: `${forSummary.placedScores}/${forSummary.placedAttempts} scored`,
      },
    },
  };
}
