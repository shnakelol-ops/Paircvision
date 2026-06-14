/**
 * review-prompts.ts
 *
 * Pure deterministic tactical review prompt generation for PáircVision.
 *
 * Entry point: deriveReviewPrompts(analysis, homeTeam, awayTeam)
 *
 * Returns an array of ReviewPrompt objects — each containing a category,
 * a coach-readable text string, and an evidence tag that traces the prompt
 * to a specific metric and value.
 *
 * Design constraints:
 *   - Pure TypeScript — no canvas, DOM, jsPDF, React, Pixi, or browser APIs.
 *   - Imports ONLY from ./chain-types.
 *   - All prompts are deterministic threshold evaluations — no inference.
 *   - Every prompt text is factual, non-prescriptive, and non-judgmental.
 *   - Prompt count is capped at MAX_PROMPTS (10).
 *
 * Tone guardrails (enforced in every template):
 *   ✗  No: "should", "must", "failed", "poor", "weak", "wasteful", "AI analysis"
 *   ✗  No tactical prescriptions or manager-style instructions
 *   ✓  "Worth reviewing…" or factual observations only
 *   ✓  Every text string contains at least one numeric value from the analysis
 *   ✓  Coach is treated as the expert — prompts guide attention, not action
 */

import type {
  ChainableEvent,
  ChainAnalysis,
} from "./chain-types";

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
 */
export function deriveReviewPrompts<TEvent extends ChainableEvent>(
  analysis: ChainAnalysis<TEvent>,
  homeTeam: string,
  awayTeam: string,
): readonly ReviewPrompt[] {
  // Truncate team names to a safe display length
  const home = homeTeam.slice(0, 18) || "Home";
  const away = awayTeam.slice(0, 18) || "Away";

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

  // Kickout win-rate observation (always generated when sample is sufficient)
  if (koTotal >= 3) {
    if (koWinPct >= 60) {
      push(
        "KICKOUT",
        `${home} retained ${koWinPct}% of kickouts (${koWon} of ${koTotal}). Worth reviewing whether retention was consistent across both halves.`,
        `kickout:winPct=${koWinPct}`,
      );
    } else if (koWinPct < 45) {
      push(
        "KICKOUT",
        `${home} won ${koWinPct}% of kickouts (${koWon} of ${koTotal}). Worth reviewing where possession was being contested during those phases.`,
        `kickout:winPct=${koWinPct}`,
      );
    } else {
      push(
        "KICKOUT",
        `${home} won ${koWinPct}% of kickouts (${koWon} of ${koTotal}) and converted ${koConvPct}% of those to scores.`,
        `kickout:winPct=${koWinPct}`,
      );
    }
  }

  // Net kickout impact (only when clearly negative — avoid noise at small margins)
  if (koTotal >= 3 && koNetAdv < -10) {
    push(
      "KICKOUT",
      `${home} scored from ${koConvPct}% of won kickouts, but ${away} scored from ${koExpPct}% of theirs. Worth reviewing whether kickout direction patterns changed during the match.`,
      `kickout:netAdv=${koNetAdv}`,
    );
  } else if (koWon >= 3 && koConvPct >= 40) {
    // Positive conversion rate — worth flagging as a repeatable pattern
    push(
      "KICKOUT",
      `${home} converted ${koConvPct}% of won kickouts to scores (${ko.wonToScore} from ${koWon} wins). Worth reviewing whether repeatable patterns exist in how these attacks developed.`,
      `kickout:convPct=${koConvPct}`,
    );
  }

  // Half-split kickout win rate (minimum 3 outcomes per half for meaningful comparison)
  const h1KoOut = ko.outcomes.filter((o) => o.kickoutEvent.period === "1H");
  const h2KoOut = ko.outcomes.filter((o) => o.kickoutEvent.period === "2H");
  if (h1KoOut.length >= 3 && h2KoOut.length >= 3) {
    const h1Win = h1KoOut.filter((o) => o.winningSide === "FOR").length;
    const h2Win = h2KoOut.filter((o) => o.winningSide === "FOR").length;
    const h1Pct = Math.round((h1Win / h1KoOut.length) * 100);
    const h2Pct = Math.round((h2Win / h2KoOut.length) * 100);
    if (h2Pct < h1Pct - 12) {
      push(
        "KICKOUT",
        `${home}'s kickout win rate dropped in the second half (${h2Pct}% vs ${h1Pct}% in the first half). Worth reviewing what changed after the interval.`,
        `kickout:h2WinPct=${h2Pct},h1WinPct=${h1Pct}`,
      );
    }
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

  // Turnover conversion observation (always when sample is sufficient)
  if (tvTotal >= 3) {
    if (tvConvPct >= 35) {
      push(
        "TURNOVER",
        `${home} converted ${tvConvPct}% of won turnovers directly to scores (${tv.wonToScore} of ${tvWon}). Worth reviewing whether a specific zone or type was most productive.`,
        `turnover:convPct=${tvConvPct}`,
      );
    } else if (tvConvPct < 20 && tvWon >= 3) {
      push(
        "TURNOVER",
        `${home} won ${tvWon} turnovers and converted ${tvConvPct}% to scores. Worth reviewing what happened to possession after recovery.`,
        `turnover:convPct=${tvConvPct}`,
      );
    } else {
      push(
        "TURNOVER",
        `${home} won ${tvWinPct}% of turnovers (${tvWon} of ${tvTotal}). ${home} converted ${tvConvPct}% of wins to scores; ${away} scored from ${tvLostAllowPct}% of their turnover wins.`,
        `turnover:winPct=${tvWinPct},convPct=${tvConvPct}`,
      );
    }
  }

  // Defensive exposure from turnover losses
  if (tvLost >= 3 && tvLostAllowPct > 45) {
    push(
      "TURNOVER",
      `${away} scored from ${tvLostAllowPct}% of turnovers they won against ${home} (${tv.lostAllowedScore} of ${tvLost}). Worth reviewing whether these concessions clustered in a particular zone or period.`,
      `turnover:lostAllowedPct=${tvLostAllowPct}`,
    );
  }

  // Unconverted attacks: won turnovers where no shot or score followed
  // (possession was recovered but the attack did not reach the forward line)
  const unconvertedWins = tv.outcomes.filter(
    (o) => o.direction === "WON" &&
            o.nextEvent !== null &&
            !o.resultedInScore &&
            !o.resultedInShot,
  ).length;
  if (unconvertedWins >= 3) {
    push(
      "TURNOVER",
      `${home} won ${unconvertedWins} turnovers that had a follow-up action but did not reach a shot. Worth reviewing whether possession was being retained or broken up again in transition.`,
      `turnover:unconvertedWithFollowup=${unconvertedWins}`,
    );
  }

  // Half-split turnover conversion
  const h1TvOut = tv.outcomes.filter((o) => o.turnoverEvent.period === "1H");
  const h2TvOut = tv.outcomes.filter((o) => o.turnoverEvent.period === "2H");
  const h1TvWon = h1TvOut.filter((o) => o.direction === "WON");
  const h2TvWon = h2TvOut.filter((o) => o.direction === "WON");
  if (h1TvWon.length >= 3 && h2TvWon.length >= 3) {
    const h1Conv = Math.round((h1TvWon.filter((o) => o.resultedInScore).length / h1TvWon.length) * 100);
    const h2Conv = Math.round((h2TvWon.filter((o) => o.resultedInScore).length / h2TvWon.length) * 100);
    const diff   = Math.abs(h2Conv - h1Conv);
    if (diff >= 15) {
      const halfLabel = h2Conv > h1Conv
        ? `higher in the second half (${h2Conv}% vs ${h1Conv}% in the first)`
        : `lower in the second half (${h2Conv}% vs ${h1Conv}% in the first)`;
      push(
        "TURNOVER",
        `${home}'s turnover conversion was ${halfLabel}. Worth reviewing whether possession quality changed after the interval.`,
        `turnover:h2ConvPct=${h2Conv},h1ConvPct=${h1Conv}`,
      );
    }
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
      `${away} recorded a ${maxConsOpp}-score unanswered run. Worth reviewing the period and context in which this occurred and what ended the sequence.`,
      `momentum:maxConsOpp=${maxConsOpp}`,
    );
  } else if (maxConsOpp >= 3) {
    push(
      "MOMENTUM",
      `${away} had a ${maxConsOpp}-score unanswered spell. Worth reviewing whether possession patterns shifted during this period.`,
      `momentum:maxConsOpp=${maxConsOpp}`,
    );
  }

  // Home unanswered run
  if (maxConsFor >= 4) {
    push(
      "MOMENTUM",
      `${home} recorded a ${maxConsFor}-score unanswered run. Worth reviewing how this scoring spell was set up and whether the pattern is repeatable.`,
      `momentum:maxConsFor=${maxConsFor}`,
    );
  } else if (maxConsFor >= 3) {
    push(
      "MOMENTUM",
      `${home} had a ${maxConsFor}-score unanswered spell. Worth reviewing what tactical patterns drove this sequence.`,
      `momentum:maxConsFor=${maxConsFor}`,
    );
  }

  // Run count balance (only flag when the difference is notable)
  if (allRuns.length >= 4 && runsOpp > runsFor) {
    push(
      "MOMENTUM",
      `${away} recorded more scoring runs than ${home} (${runsOpp} vs ${runsFor}). Worth reviewing whether possession patterns changed during those spells.`,
      `momentum:runsOpp=${runsOpp},runsFor=${runsFor}`,
    );
  }

  // Late-game run (final run of the match, if it was opposition)
  if (latestRun !== null && latestRun.teamSide === "OPP" && latestRun.count >= 2) {
    push(
      "MOMENTUM",
      `The final scoring run of the match was by ${away} (${latestRun.count} scores). Worth reviewing whether late-match possession patterns shifted in the closing stages.`,
      `momentum:latestRunOpp=${latestRun.count}`,
    );
  }

  // ── CHAIN ────────────────────────────────────────────────────────────────────

  const sm         = analysis.summary;
  const chainTotal  = sm.totalChains;
  const chainForPct = chainTotal > 0 ? Math.round((sm.forChains / chainTotal) * 100) : 0;
  const koToScore   = sm.byRule["KICKOUT_TO_SCORE"]  ?? 0;
  const tvToScore   = sm.byRule["TURNOVER_TO_SCORE"] ?? 0;
  const freeToGoal  = sm.byRule["FREE_WON_TO_GOAL"]  ?? 0;

  // Chain efficiency (only flag notable imbalances)
  if (chainTotal >= 6) {
    if (chainForPct <= 40) {
      push(
        "CHAIN",
        `${away} converted more tactical sequences (${100 - chainForPct}% vs ${chainForPct}% for ${home} — ${chainTotal} total). Worth reviewing whether chain efficiency changed across the match.`,
        `chain:forPct=${chainForPct}`,
      );
    } else if (chainForPct >= 60) {
      push(
        "CHAIN",
        `${home} won ${chainForPct}% of all tactical sequences (${sm.forChains} of ${chainTotal}). Worth reviewing which sequence types drove this pattern.`,
        `chain:forPct=${chainForPct}`,
      );
    }
  }

  // Kickout vs turnover chain comparison
  if (koToScore >= 2 && tvToScore >= 2) {
    if (koToScore > tvToScore) {
      push(
        "CHAIN",
        `${home} generated more scores from kickout chains (${koToScore}) than turnover chains (${tvToScore}). Worth reviewing whether this reflects a kickout-first possession pattern.`,
        `chain:koToScore=${koToScore},tvToScore=${tvToScore}`,
      );
    } else if (tvToScore > koToScore) {
      push(
        "CHAIN",
        `${home} generated more scores from turnover chains (${tvToScore}) than kickout chains (${koToScore}). Worth reviewing whether transition speed was a key factor.`,
        `chain:tvToScore=${tvToScore},koToScore=${koToScore}`,
      );
    }
  }

  // Free kicks to goal
  if (freeToGoal >= 2) {
    push(
      "CHAIN",
      `${home} converted ${freeToGoal} free kicks directly to goals. Worth reviewing the positions and defensive setups when these occurred.`,
      `chain:freeToGoal=${freeToGoal}`,
    );
  }

  // Half-split chain efficiency
  const h1Chains = analysis.byPeriod["1H"] ?? [];
  const h2Chains = analysis.byPeriod["2H"] ?? [];
  if (h1Chains.length >= 4 && h2Chains.length >= 4) {
    const h1ForPct = Math.round((h1Chains.filter((c) => c.teamSide === "FOR").length / h1Chains.length) * 100);
    const h2ForPct = Math.round((h2Chains.filter((c) => c.teamSide === "FOR").length / h2Chains.length) * 100);
    if (Math.abs(h2ForPct - h1ForPct) >= 15) {
      const halfLabel = h2ForPct > h1ForPct
        ? `higher in the second half (${h2ForPct}% vs ${h1ForPct}% in the first)`
        : `lower in the second half (${h2ForPct}% vs ${h1ForPct}% in the first)`;
      push(
        "CHAIN",
        `${home}'s chain win rate was ${halfLabel}. Worth reviewing whether tactical patterns shifted after the interval.`,
        `chain:h1ForPct=${h1ForPct},h2ForPct=${h2ForPct}`,
      );
    }
  }

  // ── GENERAL ──────────────────────────────────────────────────────────────────

  // Closely contested match — near 50/50 chain balance
  if (chainTotal >= 12 && chainForPct >= 47 && chainForPct <= 53) {
    push(
      "GENERAL",
      `Tactical sequences were closely contested — ${home} won ${sm.forChains} and ${away} won ${sm.oppChains} from ${chainTotal} total. Worth reviewing what decided the marginal possession battles.`,
      `general:totalChains=${chainTotal},forPct=${chainForPct}`,
    );
  } else if (chainTotal < 6 && analysis.totalEventsAnalysed >= 20) {
    // Few sequences detected despite reasonable event volume — worth flagging
    push(
      "GENERAL",
      `Total detected tactical sequences was ${chainTotal}. Worth reviewing whether the match involved a high proportion of set-piece play.`,
      `general:totalChains=${chainTotal}`,
    );
  }

  // ── Cap and return ────────────────────────────────────────────────────────────

  return candidates.slice(0, MAX_PROMPTS);
}
