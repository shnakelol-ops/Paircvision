/**
 * review-prompts.ts
 *
 * Pure deterministic factual-observation generation for PáircVision.
 *
 * Entry point: deriveReviewPrompts(analysis, homeTeam, awayTeam, sport?, halfCoverage?)
 *
 * Returns an array of ReviewPrompt objects — each containing a category,
 * a coach-readable text string, and an evidence tag that traces the
 * observation to a specific metric and value.
 *
 * Design constraints:
 *   - Pure TypeScript — no canvas, DOM, jsPDF, React, Pixi, or browser APIs.
 *   - Imports only chain types, the evidence gates and the scoring-breakdown
 *     views (no circular import with reviewPdfExport).
 *   - All observations are deterministic threshold evaluations — no inference.
 *   - Every observation is a bare fact: PáircVision records, connects and
 *     surfaces; it does not diagnose, prescribe, or recommend a coaching
 *     response. Thresholds decide WHICH facts are surfaced, never HOW to
 *     act on them.
 *   - Observation count is capped at MAX_PROMPTS (10).
 *
 * Tone guardrails (enforced in every template):
 *   ✗  No: "should", "must", "worth reviewing", "consider", "recommend",
 *      "failed", "poor", "weak", "excellent", "AI analysis"
 *   ✗  No tactical prescriptions, recommendations, or manager-style instructions
 *   ✓  A complete factual sentence the recorded events and chain
 *      calculations can prove, and nothing more
 *   ✓  Every text string contains at least one numeric value from the analysis
 *   ✓  The coach owns interpretation; PáircVision owns the evidence
 *
 * Attribution guardrails:
 *   ✗  Never compare chain-rule counts between teams or between rule types,
 *      and never call rule matches "possession sequences". A kickout win can
 *      match either kickout rule depending on how it was logged, and the
 *      turnover rules cannot see turnover wins logged as the other team's
 *      loss — the counts are not a like-for-like comparison.
 *   ✗  Never compare halves unless evidence-gates.halfComparisonVerdict()
 *      allows it. Without coverage information, half comparisons are
 *      suppressed.
 */

import type {
  ChainableEvent,
  ChainAnalysis,
} from "./chain-types";
import type { PitchSport } from "../../core/pitch/pitch-config";
import {
  fmtRestartOriginScoredFor,
  fmtTurnoverOriginConcededFor,
  fmtTurnoverOriginScoredFor,
  viewTurnoverOriginConcededFor,
  viewTurnoverOriginScoredFor,
} from "../reporting/scoringBreakdownViews";
import type { ScoringBreakdown } from "../reporting/scoringBreakdownFormat";
import { halfComparisonVerdict, type HalfCoverage } from "./evidence-gates";

// ─── Public types ─────────────────────────────────────────────────────────────

export type ReviewPromptCategory =
  | "KICKOUT"
  | "TURNOVER"
  | "MOMENTUM"
  | "CHAIN"
  | "GENERAL";

export type ReviewPrompt = {
  /** Tactical category — used for visual grouping and colour-coding in the PDF. */
  category: ReviewPromptCategory;
  /**
   * Coach-readable text. Kept concise (~120 chars max).
   * Factual, non-prescriptive, always contains at least one numeric value.
   */
  text: string;
  /**
   * Machine-readable traceability tag.
   * Format: "<dataset>:<field>=<value>[,<field>=<value>]"
   * Guarantees every prompt maps back to a specific metric and computed value.
   * Example: "kickout:winPct=63"   "turnover:convPct=38,lostAllowedPct=52"
   */
  evidenceTag: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum prompts returned. Prevents page overflow regardless of data volume. */
const MAX_PROMPTS = 10;

// ─── Entry point ──────────────────────────────────────────────────────────────

/**
 * Derives up to MAX_PROMPTS deterministic tactical review prompts from
 * a completed ChainAnalysis.
 *
 * All thresholds are arithmetic comparisons on pre-computed aggregate fields
 * and outcome-level period/direction fields. No inference beyond arithmetic.
 *
 * Generic over TEvent so the full original event objects are preserved;
 * only aggregate numeric fields and outcome metadata are read — no cast needed.
 *
 * Prompts are ordered: KICKOUT → TURNOVER → MOMENTUM → CHAIN → GENERAL.
 * Within each category, the most numerically significant observation is first.
 * If total candidates exceed MAX_PROMPTS the first N in priority order are kept.
 *
 * `halfCoverage` (from evidence-gates.measureHalfCoverage) enables the
 * first-half vs second-half comparisons. When it is absent, or the gate
 * cannot establish that both halves were fully logged, they are suppressed.
 */
export function deriveReviewPrompts<TEvent extends ChainableEvent>(
  analysis: ChainAnalysis<TEvent>,
  homeTeam: string,
  awayTeam: string,
  sport?: PitchSport,
  halfCoverage?: HalfCoverage | null,
): readonly ReviewPrompt[] {
  // Truncate team names to a safe display length
  const home = homeTeam.slice(0, 18) || "Home";
  const away = awayTeam.slice(0, 18) || "Away";

  const isPuck  = sport === "hurling" || sport === "camogie";
  const koTerm  = isPuck ? "puckout"  : "kickout";
  const koTermS = isPuck ? "puckouts" : "kickouts";

  const candidates: ReviewPrompt[] = [];

  /** Push a prompt candidate; category ordering enforced by call sequence. */
  function push(
    category: ReviewPromptCategory,
    text: string,
    evidenceTag: string,
  ): void {
    candidates.push({ category, text, evidenceTag });
  }

  // ── KICKOUT ──────────────────────────────────────────────────────────────────

  const ko        = analysis.kickouts;
  const koTotal   = ko.total;
  const koWon     = ko.won;
  const koWinPct  = koTotal > 0 ? Math.round((koWon  / koTotal) * 100) : 0;
  // wonToScorePercent and lostAllowedScorePercent are pre-computed and
  // already division-guarded by the chain engine — safe to use directly.
  const koConvPct = ko.wonToScorePercent;
  const koExpPct  = ko.lostAllowedScorePercent;
  const koNetAdv  = koConvPct - koExpPct;  // positive = net kickout advantage

  // Restart Share observation (always generated when sample is sufficient).
  // Canonical vocabulary: the all-restarts figure is ALWAYS "Restart Share"
  // (see src/stats/restarts/restartMetrics.ts). Never call it retention.
  // restartConvStated: the 45–60% sentence already carries the restart-origin
  // conversion, so the standalone conversion sentence below must not repeat it.
  let restartConvStated = false;
  if (koTotal >= 3) {
    if (koWinPct >= 60 || koWinPct < 45) {
      push(
        "KICKOUT",
        `${home} held ${koWinPct}% Restart Share (${koWon} of ${koTotal}).`,
        `kickout:restartShare=${koWinPct}`,
      );
    } else {
      push(
        "KICKOUT",
        `${home} held ${koWinPct}% Restart Share (${koWon} of ${koTotal}) — ${koConvPct}% of won ${koTermS} produced restart-origin point value (${fmtRestartOriginScoredFor(analysis)}).`,
        `kickout:restartShare=${koWinPct}`,
      );
      restartConvStated = true;
    }
  }

  // Net kickout impact (only when clearly negative — avoid noise at small margins)
  if (koTotal >= 3 && koNetAdv < -10) {
    push(
      "KICKOUT",
      `${koConvPct}% of ${home}'s ${koTerm} wins produced restart-origin point value; ${koExpPct}% of their losses produced restart-origin point value for ${away}.`,
      `kickout:netAdv=${koNetAdv}`,
    );
  } else if (!restartConvStated && koWon >= 3 && koConvPct >= 40) {
    // Positive conversion rate — worth flagging as a repeatable pattern
    push(
      "KICKOUT",
      `${koConvPct}% of ${home}'s won ${koTermS} produced restart-origin point value (${fmtRestartOriginScoredFor(analysis)} from ${koWon} wins).`,
      `kickout:convPct=${koConvPct}`,
    );
  }

  // Half-split Restart Share — rise or fall, only when the half-comparison
  // gate (coverage, sample size, one-event sensitivity) allows it.
  const h1KoOut = ko.outcomes.filter((o) => o.kickoutEvent.period === "1H");
  const h2KoOut = ko.outcomes.filter((o) => o.kickoutEvent.period === "2H");
  const h1Ko = { total: h1KoOut.length, successes: h1KoOut.filter((o) => o.winningSide === "FOR").length };
  const h2Ko = { total: h2KoOut.length, successes: h2KoOut.filter((o) => o.winningSide === "FOR").length };
  const koHalves = halfComparisonVerdict(halfCoverage, h1Ko, h2Ko, 12);
  if (koHalves.show) {
    push(
      "KICKOUT",
      `${home}'s Restart Share ${koHalves.direction === "UP" ? "rose" : "fell"} to ${koHalves.h2Pct}% in the second half (${h2Ko.successes} of ${h2Ko.total}) from ${koHalves.h1Pct}% in the first half (${h1Ko.successes} of ${h1Ko.total}).`,
      `kickout:h2RestartShare=${koHalves.h2Pct},h1RestartShare=${koHalves.h1Pct}`,
    );
  }

  // ── TURNOVER ─────────────────────────────────────────────────────────────────

  const tv              = analysis.turnovers;
  const tvTotal         = tv.total;
  const tvWon           = tv.won;
  const tvLost          = tv.lost;
  const tvConvPct       = tv.wonToScorePercent;
  const tvWinPct        = tvTotal > 0 ? Math.round((tvWon  / tvTotal) * 100) : 0;
  const tvLostAllowPct  = tvLost > 0
    ? Math.round((tv.lostAllowedScore / tvLost) * 100)
    : 0;

  // The scored/conceded breakdowns only see turnovers logged by the home
  // side, while the percentages use every turnover by acting side. Print a
  // breakdown only when it covers the same scores as the percentage beside
  // it; otherwise print the counts alone.
  const tvScoredDetail = breakdownScoreCount(viewTurnoverOriginScoredFor(analysis)) === tv.wonToScore
    ? `${fmtTurnoverOriginScoredFor(analysis)} from ${tvWon} wins`
    : `${tv.wonToScore} of ${tvWon} wins`;
  const tvConcededDetail = breakdownScoreCount(viewTurnoverOriginConcededFor(analysis)) === tv.lostAllowedScore
    ? `${fmtTurnoverOriginConcededFor(analysis)} from ${tvLost} losses`
    : `${tv.lostAllowedScore} of ${tvLost} losses`;

  // Turnover conversion observation (always when sample is sufficient)
  if (tvTotal >= 3) {
    if (tvConvPct >= 35) {
      push(
        "TURNOVER",
        `${tvConvPct}% of ${home}'s won turnovers produced turnover-origin point value (${tvScoredDetail}).`,
        `turnover:convPct=${tvConvPct}`,
      );
    } else if (tvConvPct < 20 && tvWon >= 3) {
      push(
        "TURNOVER",
        `${home} won ${tvWon} turnovers but only ${tvConvPct}% produced turnover-origin point value.`,
        `turnover:convPct=${tvConvPct}`,
      );
    } else {
      push(
        "TURNOVER",
        `${home} won ${tvWinPct}% of turnovers (${tvWon} of ${tvTotal}); ${tvConvPct}% of wins produced turnover-origin point value, against ${tvLostAllowPct}% for ${away}.`,
        `turnover:winPct=${tvWinPct},convPct=${tvConvPct}`,
      );
    }
  }

  // Defensive exposure from turnover losses
  if (tvLost >= 3 && tvLostAllowPct > 45) {
    push(
      "TURNOVER",
      `${tvLostAllowPct}% of the turnovers ${away} won against ${home} produced turnover-origin point value (${tvConcededDetail}).`,
      `turnover:lostAllowedPct=${tvLostAllowPct}`,
    );
  }

  // Won turnovers with no shot — the same figure the Turnover Analysis card
  // prints as "Won → No shot" (won − wonToShot), so the two never disagree.
  const tvWonNoShot = Math.max(0, tvWon - tv.wonToShot);
  if (tvWonNoShot >= 3) {
    push(
      "TURNOVER",
      `${home} won ${tvWon} turnovers; ${tvWonNoShot} did not lead to a shot.`,
      `turnover:wonNoShot=${tvWonNoShot},won=${tvWon}`,
    );
  }

  // Half-split turnover conversion — turnovers the home side won, by acting
  // side (a home win may be logged as the home side's TURNOVER_WON or the
  // opposition's TURNOVER_LOST), matching the Turnover Chain page's by-half
  // rows. Printed only when the half-comparison gate allows it.
  const homeWonTv = tv.outcomes.filter(
    (o) => (o.direction === "WON") === (o.turnoverEvent.teamSide === "FOR"),
  );
  const h1TvWon = homeWonTv.filter((o) => o.turnoverEvent.period === "1H");
  const h2TvWon = homeWonTv.filter((o) => o.turnoverEvent.period === "2H");
  const h1Tv = { total: h1TvWon.length, successes: h1TvWon.filter((o) => o.resultedInScore).length };
  const h2Tv = { total: h2TvWon.length, successes: h2TvWon.filter((o) => o.resultedInScore).length };
  const tvHalves = halfComparisonVerdict(halfCoverage, h1Tv, h2Tv, 15);
  if (tvHalves.show) {
    push(
      "TURNOVER",
      `${home}'s turnover conversion was ${tvHalves.direction === "UP" ? "higher" : "lower"} in the second half (${h2Tv.successes} of ${h2Tv.total}, ${tvHalves.h2Pct}%) than in the first half (${h1Tv.successes} of ${h1Tv.total}, ${tvHalves.h1Pct}%).`,
      `turnover:h2ConvPct=${tvHalves.h2Pct},h1ConvPct=${tvHalves.h1Pct}`,
    );
  }

  // ── MOMENTUM ─────────────────────────────────────────────────────────────────

  const sr        = analysis.scoringRuns;
  const allRuns   = sr.runs;
  const runsFor   = allRuns.filter((r) => r.teamSide === "FOR").length;
  const runsOpp   = allRuns.filter((r) => r.teamSide === "OPP").length;
  const maxConsFor = sr.maxConsecutiveFor;
  const maxConsOpp = sr.maxConsecutiveOpp;
  const latestRun  = allRuns.length > 0 ? allRuns[allRuns.length - 1] : null;

  // Opposition unanswered run
  if (maxConsOpp >= 4) {
    push(
      "MOMENTUM",
      `${away} recorded a ${maxConsOpp}-score unanswered run.`,
      `momentum:maxConsOpp=${maxConsOpp}`,
    );
  } else if (maxConsOpp >= 3) {
    push(
      "MOMENTUM",
      `${away} had a ${maxConsOpp}-score unanswered spell.`,
      `momentum:maxConsOpp=${maxConsOpp}`,
    );
  }

  // Home unanswered run
  if (maxConsFor >= 4) {
    push(
      "MOMENTUM",
      `${home} recorded a ${maxConsFor}-score unanswered run.`,
      `momentum:maxConsFor=${maxConsFor}`,
    );
  } else if (maxConsFor >= 3) {
    push(
      "MOMENTUM",
      `${home} had a ${maxConsFor}-score unanswered spell.`,
      `momentum:maxConsFor=${maxConsFor}`,
    );
  }

  // Run count balance (only flag when the difference is notable)
  if (allRuns.length >= 4 && runsOpp > runsFor) {
    push(
      "MOMENTUM",
      `${away} recorded more scoring runs than ${home} (${runsOpp} vs ${runsFor}).`,
      `momentum:runsOpp=${runsOpp},runsFor=${runsFor}`,
    );
  }

  // Late-game run (final run of the match, if it was opposition)
  if (latestRun !== null && latestRun.teamSide === "OPP" && latestRun.count >= 2) {
    push(
      "MOMENTUM",
      `The final scoring run of the match was by ${away} (${latestRun.count} scores).`,
      `momentum:latestRunOpp=${latestRun.count}`,
    );
  }

  // ── CHAIN ────────────────────────────────────────────────────────────────────
  //
  // Only the home side's own rule matches are stated, never compared with the
  // opposition's or with another rule type, and never called "possession
  // sequences" (see the attribution guardrails in the file header). Chain
  // share, kickout-vs-turnover chain and half-split chain sentences are
  // deliberately not generated.

  const freeToGoal = (analysis.byRule["FREE_WON_TO_GOAL"] ?? [])
    .filter((c) => c.teamSide === "FOR").length;

  if (freeToGoal >= 2) {
    push(
      "CHAIN",
      `${home} had ${freeToGoal} free-won-to-goal chain${freeToGoal !== 1 ? "s" : ""} (rule match) — a free won followed by a goal within 30 seconds.`,
      `chain:freeToGoal=${freeToGoal}`,
    );
  }

  // ── GENERAL ──────────────────────────────────────────────────────────────────
  //
  // No GENERAL observations are generated: the former ones were chain-share
  // comparisons. The category is kept for consumers that group by it.

  // ── Cap and return ────────────────────────────────────────────────────────────

  return candidates.slice(0, MAX_PROMPTS);
}

function breakdownScoreCount(b: ScoringBreakdown): number {
  return b.goals + b.points + b.twoPointers;
}
