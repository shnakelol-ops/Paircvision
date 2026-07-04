/**
 * restartMetrics.ts
 *
 * THE single source of truth for restart (kickout / puckout) metric
 * computation AND naming across all of PáircVision.
 *
 * Why this module exists:
 *   The same match previously printed "kickout retention: 50%",
 *   "retained 4/5 (80%)" and "63%" on different pages. All three were
 *   different metrics wearing the same name. The engines were never in
 *   disagreement — one word ("retention") was labelling three different
 *   denominators. This module fixes the dictionary, not the engines.
 *
 * Canonical vocabulary (LOCKED — see CLAUDE.md):
 *
 *   restartShare           "Restart Share"
 *     Restarts won by us ÷ ALL restarts both teams took.
 *
 *   ownKickoutRetention    "Own Kickout Retention" / "Own Puckout Retention"
 *     Own kickouts retained ÷ own kickouts taken.
 *
 *   oppKickoutWinRate      "Won on Their Kickout" / "Won on Their Puckout"
 *     Opposition kickouts we won ÷ opposition kickouts taken.
 *
 *   restartToScore         "Direct restart scores"
 *     Immediate chain-window scores after restarts we won (nextScore) ÷
 *     restarts we won. Never label this "Restart-origin scores".
 *
 *   restartLossPunishment  "Direct scores conceded off restarts"
 *     Immediate chain-window scores conceded after restarts we lost
 *     (nextScore) ÷ restarts we lost.
 *
 * Separate ledger / possession-origin vocabulary (not these metrics):
 *   "Restart-origin scores"            — scores attributed to a won-restart
 *                                        possession origin (ledger row / outcomes).
 *   "Restart-origin scores conceded"   — scores conceded after lost-restart
 *                                        possession origins.
 *
 * Hard display rules:
 *   1. The word "Retention" may ONLY ever label ownKickoutRetention.
 *      Never the all-restarts figure.
 *   2. The all-restarts figure is ALWAYS labelled "Restart Share" —
 *      everywhere, including insights and the HT/FT summary tiles.
 *   3. Any page showing both must show them as two labelled rows,
 *      never interchangeably.
 *   4. Insight text templates reference metrics by canonical display name:
 *      "Ballylanders held 63% Restart Share (15 of 24)" /
 *      "Own Kickout Retention was 80% in the first half."
 *
 * Design constraints:
 *   - Pure TypeScript — no canvas, DOM, jsPDF, React, or browser APIs.
 *   - Imports only from chain-types and pitch-config (no circular imports
 *     with reviewPdfExport.ts).
 *   - Derives everything from the chain engine's KickoutOutcome dataset so
 *     figures printed here always agree with the Chain Intelligence pages.
 */

import type { PitchSport } from "../../core/pitch/pitch-config";
import type { ChainableEvent, KickoutOutcome } from "../chains/chain-types";

// ─── Metric identity ──────────────────────────────────────────────────────────

export type RestartMetricId =
  | "restartShare"
  | "ownKickoutRetention"
  | "oppKickoutWinRate"
  | "restartToScore"
  | "restartLossPunishment";

/** Chain-window immediate score after a restart win (nextScore). */
export const DIRECT_RESTART_SCORES_LABEL = "Direct restart scores";
/** Chain-window immediate score conceded after a restart loss (nextScore). */
export const DIRECT_RESTART_SCORES_CONCEDED_LABEL = "Direct scores conceded off restarts";
/** Possession-origin / ledger attribution of scores from won restarts. */
export const RESTART_ORIGIN_SCORES_LABEL = "Restart-origin scores";
/** Possession-origin / ledger attribution of scores conceded after lost restarts. */
export const RESTART_ORIGIN_SCORES_CONCEDED_LABEL = "Restart-origin scores conceded";

/**
 * Returns the canonical display name for a restart metric.
 * Sport-aware: "Kickout" becomes "Puckout" for hurling / camogie.
 */
export function restartMetricLabel(id: RestartMetricId, sport?: PitchSport): string {
  const ko = sport === "hurling" || sport === "camogie" ? "Puckout" : "Kickout";
  switch (id) {
    case "restartShare":          return "Restart Share";
    case "ownKickoutRetention":   return `Own ${ko} Retention`;
    case "oppKickoutWinRate":     return `Won on Their ${ko}`;
    case "restartToScore":        return DIRECT_RESTART_SCORES_LABEL;
    case "restartLossPunishment": return DIRECT_RESTART_SCORES_CONCEDED_LABEL;
  }
}

/**
 * The single explainer line for report pages. Replaces the old
 * "Both are correct." disclaimer wherever restart figures are explained.
 */
export function restartExplainerLine(sport?: PitchSport): string {
  const ko = sport === "hurling" || sport === "camogie" ? "puckout" : "kickout";
  return `Restart Share counts every ${ko} in the game. Own ${ko.charAt(0).toUpperCase()}${ko.slice(1)} Retention counts only our own.`;
}

// ─── Value shapes ─────────────────────────────────────────────────────────────

/** A numerator/denominator pair with a pre-rounded 0–100 integer percent. */
export type RestartFraction = {
  num: number;
  den: number;
  /** Math.round(num / den × 100); 0 when den === 0. */
  pct: number;
};

export type RestartHalfSplit = {
  full: RestartFraction;
  h1: RestartFraction;
  h2: RestartFraction;
};

export type RestartMetrics = {
  /** Restarts won by us ÷ all restarts both teams (with per-half splits). */
  restartShare: RestartHalfSplit;
  /** Own kickouts retained ÷ own kickouts taken (with per-half splits). */
  ownKickoutRetention: RestartHalfSplit;
  /** Opposition kickouts we won ÷ opposition kickouts taken (with per-half splits). */
  oppKickoutWinRate: RestartHalfSplit;
  /** Scores from restarts we won ÷ restarts we won. */
  restartToScore: RestartFraction;
  /** Opposition scores from restarts we lost ÷ restarts we lost. */
  restartLossPunishment: RestartFraction;
};

// ─── Formatting helpers ───────────────────────────────────────────────────────

/** "15 of 24" */
export function fmtFractionCounts(f: RestartFraction): string {
  return `${f.num} of ${f.den}`;
}

/** "63% (15 of 24)" — dash when the denominator is zero. */
export function fmtFractionPct(f: RestartFraction): string {
  return f.den > 0 ? `${f.pct}% (${f.num} of ${f.den})` : "—";
}

// ─── Ownership resolution ─────────────────────────────────────────────────────

/**
 * Who physically took a restart.
 *
 * V1.2+ events carry an explicit restartOwner that always wins.
 * Legacy fallback (pre-V1.2 events): owner = teamSide — the convention used
 * by selectRestartEventsByOwner and every restart PDF page.
 *
 * KNOWN INCONSISTENCY (flagged, not silently patched):
 * possession-outcomes-engine.ts uses a different legacy fallback for
 * KICKOUT_WON (owner = opposite of teamSide). For pre-V1.2 matches the two
 * conventions can classify the same KICKOUT_WON event differently. All
 * V1.2+ data is unaffected because restartOwner is explicit.
 */
export function resolveRestartOwner(event: ChainableEvent): "FOR" | "OPP" {
  if (event.restartOwner === "FOR" || event.restartOwner === "OPP") {
    return event.restartOwner;
  }
  return event.teamSide;
}

// ─── Computation ──────────────────────────────────────────────────────────────

function fraction(num: number, den: number): RestartFraction {
  return { num, den, pct: den > 0 ? Math.round((num / den) * 100) : 0 };
}

function splitFraction<TEvent extends ChainableEvent>(
  outcomes: readonly KickoutOutcome<TEvent>[],
  isNum: (o: KickoutOutcome<TEvent>) => boolean,
): RestartHalfSplit {
  const h1 = outcomes.filter((o) => o.kickoutEvent.period === "1H");
  const h2 = outcomes.filter((o) => o.kickoutEvent.period === "2H");
  const count = (arr: readonly KickoutOutcome<TEvent>[]) => arr.filter(isNum).length;
  return {
    full: fraction(count(outcomes), outcomes.length),
    h1:   fraction(count(h1), h1.length),
    h2:   fraction(count(h2), h2.length),
  };
}

/**
 * Computes every canonical restart metric from the chain engine's kickout
 * outcome dataset (analysis.kickouts.outcomes). Using the engine's outcomes
 * guarantees the figures printed under these names always agree with the
 * Chain Intelligence pages — no page recomputes or relabels locally.
 */
export function computeRestartMetrics<TEvent extends ChainableEvent>(
  outcomes: readonly KickoutOutcome<TEvent>[],
): RestartMetrics {
  const wonByUs = (o: KickoutOutcome<TEvent>) => o.winningSide === "FOR";

  const ownKickouts = outcomes.filter((o) => resolveRestartOwner(o.kickoutEvent) === "FOR");
  const oppKickouts = outcomes.filter((o) => resolveRestartOwner(o.kickoutEvent) === "OPP");

  const restartsWon  = outcomes.filter(wonByUs);
  const restartsLost = outcomes.filter((o) => !wonByUs(o));

  return {
    restartShare:        splitFraction(outcomes, wonByUs),
    ownKickoutRetention: splitFraction(ownKickouts, wonByUs),
    oppKickoutWinRate:   splitFraction(oppKickouts, wonByUs),
    restartToScore: fraction(
      restartsWon.filter((o) => o.nextScore !== null).length,
      restartsWon.length,
    ),
    restartLossPunishment: fraction(
      restartsLost.filter((o) => o.nextScore !== null).length,
      restartsLost.length,
    ),
  };
}

// ─── Canonical insight sentence templates ────────────────────────────────────
// Every sentence names the team performing the action (CLAUDE.md locked rule)
// and references the metric by its canonical display name.

/** "Ballylanders held 63% Restart Share (15 of 24)." */
export function restartShareSentence(team: string, f: RestartFraction): string {
  return `${team} held ${f.pct}% Restart Share (${fmtFractionCounts(f)})`;
}

/** "Ballylanders' Own Kickout Retention was 80% (4 of 5) in the first half." */
export function ownRetentionSentence(
  team: string,
  f: RestartFraction,
  sport?: PitchSport,
  halfSuffix?: string,
): string {
  const label = restartMetricLabel("ownKickoutRetention", sport);
  return `${team}'s ${label} was ${f.pct}% (${fmtFractionCounts(f)})${halfSuffix ? ` ${halfSuffix}` : ""}`;
}
