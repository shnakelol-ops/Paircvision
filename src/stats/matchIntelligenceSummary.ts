/**
 * matchIntelligenceSummary.ts
 *
 * Shared platform service — consumed by both HT Notes and FT Summary across
 * Stats Lite (App.tsx) and Stats Pro (StatsModeSurface.tsx).
 *
 * Any improvement to this module automatically benefits both products.
 * Do NOT create separate intelligence implementations elsewhere.
 */

import type { MatchEvent } from "../core/stats/stats-event-model";
import type { ChainableEvent } from "./chains/chain-types";
import { selectChainAnalysis, selectPossessionOutcomeSummary } from "./chains/chain-selectors";

// ─── Public type ──────────────────────────────────────────────────────────────

export type MatchIntelligenceSummary = {
  /** Team-named strings about what the opposition is doing to us. */
  dangerInsights: string[];
  /** Team-named strings about what we're doing to the opposition. */
  weaponInsights: string[];
  /** Pre-formatted restart insight for our team (non-null only when winning ≥65% from ≥5 kickouts). */
  ourRestartInsight: string | null;
  /** Pre-formatted restart insight for opposition (non-null only when they're winning ≥65% from ≥5 kickouts). */
  theirRestartInsight: string | null;
  /** Turnover danger insight (non-null only when opposition scored from ≥2 of our turnovers). */
  turnoverDangerInsight: string | null;
  /** Danger level based on how many times the opposition scored from our turnovers. */
  turnoverDangerLevel: "HIGH" | "MEDIUM" | "LOW" | null;
  /** Best attack source for our team (non-null when ≥60% conversion from ≥4 possessions). */
  bestAttackInsight: string | null;
  /** Worst defensive exposure (non-null when opposition scores ≥50% from ≥3 conceded possessions). */
  worstExposureInsight: string | null;
  /** Overall possession net outcome direction. */
  overallNetOutcome: "FOR" | "OPP" | "NEUTRAL";
  /** Overall possession net insight (non-null only when net ≥3 in either direction). */
  overallInsight: string | null;
  /** Up to 3 team-named coaching priority strings. */
  coachingPriorities: string[];
  mode: "HT" | "FT";
  /** True when fewer than 5 total kickout + turnover events have been logged. */
  lowSampleWarning: boolean;
};

// ─── Runtime guard ────────────────────────────────────────────────────────────
// Accepts the wider MatchEvent type (used by both App.tsx and StatsModeSurface.tsx).
// Filters at runtime to events that satisfy ChainableEvent's required fields.

function isChainableEvent(e: MatchEvent): e is MatchEvent & ChainableEvent {
  return (
    (e.teamSide === "FOR" || e.teamSide === "OPP") &&
    (e.period === "1H" || e.period === "2H") &&
    typeof e.segment === "number"
  );
}

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * Builds a MatchIntelligenceSummary from raw match events.
 *
 * Accepts MatchEvent[] (the common base type shared by App.tsx and
 * StatsModeSurface.tsx). Events lacking teamSide/period/segment are silently
 * skipped — in practice all logged game events have these fields set.
 *
 * Callers are responsible for pre-filtering events by half when required
 * (e.g. HALF_TIME state → pass only events with half === 1).
 */
export function buildMatchIntelligenceSummary(
  events: readonly MatchEvent[],
  homeTeam: string,
  awayTeam: string,
  mode: "HT" | "FT",
  restartWord: string,
): MatchIntelligenceSummary {
  const chainEvents = events.filter(isChainableEvent);

  const analysis = selectChainAnalysis(chainEvents);
  const poss = selectPossessionOutcomeSummary(chainEvents);

  const ko = analysis.kickouts;
  const to = analysis.turnovers;

  const lowSampleWarning = ko.total + to.total < 5;

  // ── Kickout consequence numbers — possession-outcomes-engine is the source of truth ──
  // V1.2+ (restartOwner split): aligns with Restart Outcomes card exactly.
  // V1.1 fallback (no restartOwner): uses combined kickout family, internally consistent.
  const koRetainedScores =
    (poss.ourKickouts?.retained.goals ?? poss.kickouts.retained.goals) +
    (poss.ourKickouts?.retained.points ?? poss.kickouts.retained.points);
  const koRetainedCount  = poss.ourKickouts?.retainedCount ?? poss.kickouts.retainedCount;
  const koConcededScores =
    (poss.ourKickouts?.conceded.goals ?? poss.kickouts.conceded.goals) +
    (poss.ourKickouts?.conceded.points ?? poss.kickouts.conceded.points);
  const koConcededCount  = poss.ourKickouts?.concededCount ?? poss.kickouts.concededCount;
  const koRetainedScoringPct = poss.ourKickouts?.retained.scoringPct ?? poss.kickouts.retained.scoringPct;
  const koConcededDamagePct  = poss.ourKickouts?.damagePct ?? poss.kickouts.damagePct;

  // ── Turnover consequence numbers — possession-outcomes-engine is the source of truth ──
  // Aligns with Turnover & Free Outcomes card exactly.
  // No restartOwner split for turnovers — use the unified family directly.
  const toRetainedScores = poss.turnovers.retained.goals + poss.turnovers.retained.points;
  const toConcededScores = poss.turnovers.conceded.goals + poss.turnovers.conceded.points;

  // ── Danger insights (team-named) ─────────────────────────────────────────
  // Both sourced from possession-outcomes-engine — matches Restart Outcomes and
  // Turnover & Free Outcomes cards exactly.
  const dangerInsights: string[] = [];
  if (koConcededScores >= 2 && koConcededCount >= 2) {
    dangerInsights.push(
      `${awayTeam} scored from ${koConcededScores} of ${koConcededCount} ${restartWord}s they won`,
    );
  }
  if (toConcededScores >= 2 && poss.turnovers.concededCount >= 2) {
    dangerInsights.push(
      `${awayTeam} scored from ${toConcededScores} ${homeTeam} turnover${toConcededScores !== 1 ? "s" : ""}`,
    );
  }

  // ── Weapon insights (team-named) ─────────────────────────────────────────
  // Both sourced from possession-outcomes-engine — matches Restart Outcomes and
  // Turnover & Free Outcomes cards exactly.
  const weaponInsights: string[] = [];
  if (koRetainedScores >= 2 && koRetainedCount >= 2) {
    weaponInsights.push(
      `${homeTeam} scored from ${koRetainedScores} of ${koRetainedCount} ${restartWord} wins`,
    );
  }
  if (toRetainedScores >= 2 && poss.turnovers.retainedCount >= 2) {
    weaponInsights.push(
      `${homeTeam} scored from ${toRetainedScores} of ${poss.turnovers.retainedCount} turnover wins`,
    );
  }

  // ── Restart battle ────────────────────────────────────────────────────────
  let ourRestartInsight: string | null = null;
  let theirRestartInsight: string | null = null;

  const restartWordTitle = restartWord.charAt(0).toUpperCase() + restartWord.slice(1);

  if (poss.ourKickouts !== null && poss.theirKickouts !== null) {
    // V1.2+ data with restartOwner split
    const ok = poss.ourKickouts;
    const tk = poss.theirKickouts;
    if (ok.total >= 5) {
      const rate = ok.retainedCount / ok.total;
      if (rate >= 0.65) {
        ourRestartInsight = `${homeTeam}'s Own ${restartWordTitle} Retention was ${Math.round(rate * 100)}% (${ok.retainedCount} of ${ok.total})`;
      }
    }
    if (tk.total >= 5) {
      // On theirKickouts, `retained` = possessions where the HOME side had the
      // ball (their kickouts WE won) — see restartOutcomesCard branch 3.
      // The away team keeping their own kickout is `concededCount`.
      const rate = tk.concededCount / tk.total;
      if (rate >= 0.65) {
        theirRestartInsight = `${awayTeam}'s Own ${restartWordTitle} Retention was ${Math.round(rate * 100)}% (${tk.concededCount} of ${tk.total})`;
      }
    }
  } else if (ko.total >= 5) {
    // Older data without restartOwner — the combined figure is Restart Share
    const rate = ko.won / ko.total;
    if (rate >= 0.65) {
      ourRestartInsight = `${homeTeam} held ${Math.round(rate * 100)}% Restart Share (${ko.won} of ${ko.total} ${restartWord}s)`;
    }
  }

  // ── Turnover danger ───────────────────────────────────────────────────────
  // Sourced from possession-outcomes-engine — matches Turnover & Free Outcomes card exactly.
  const turnoverDangerLevel: "HIGH" | "MEDIUM" | "LOW" | null =
    poss.turnovers.concededCount === 0 ? null :
    toConcededScores >= 2 ? "HIGH" :
    toConcededScores >= 1 ? "MEDIUM" : "LOW";
  const turnoverDangerInsight =
    toConcededScores >= 2
      ? `${awayTeam} scored from ${toConcededScores} ${homeTeam} turnover${toConcededScores !== 1 ? "s" : ""}`
      : null;

  // ── Best attack source ────────────────────────────────────────────────────
  let bestAttackInsight: string | null = null;
  const attackFamilies: Array<{ label: string; pct: number; count: number }> = [
    { label: "restarts won", pct: koRetainedScoringPct, count: koRetainedCount },
    { label: "turnover wins",       pct: poss.turnovers.retained.scoringPct, count: poss.turnovers.retainedCount },
    { label: "placed balls",        pct: poss.frees.retained.scoringPct, count: poss.frees.retainedCount },
  ].filter((f) => f.count >= 4);
  if (attackFamilies.length > 0) {
    const best = attackFamilies.reduce((a, b) => (b.pct > a.pct ? b : a));
    if (best.pct >= 60) {
      bestAttackInsight = `${homeTeam} most dangerous from ${best.label} — ${Math.round(best.pct)}% converted to scores`;
    }
  }

  // ── Worst defensive exposure ──────────────────────────────────────────────
  let worstExposureInsight: string | null = null;
  const exposureFamilies = [
    { label: "restarts they won", pct: koConcededDamagePct, count: koConcededCount },
    { label: "turnover wins",            pct: poss.turnovers.damagePct, count: poss.turnovers.concededCount },
    { label: "placed balls won",         pct: poss.frees.damagePct, count: poss.frees.concededCount },
  ].filter((f) => f.count >= 3 && f.pct >= 50);
  if (exposureFamilies.length > 0) {
    const worst = exposureFamilies.reduce((a, b) => (b.pct > a.pct ? b : a));
    worstExposureInsight = `${awayTeam} scoring from ${Math.round(worst.pct)}% of ${worst.label}`;
  }

  // ── Overall net outcome ───────────────────────────────────────────────────
  const net = poss.overallNetOutcome;
  const overallNetOutcome: "FOR" | "OPP" | "NEUTRAL" =
    net > 0 ? "FOR" : net < 0 ? "OPP" : "NEUTRAL";
  let overallInsight: string | null = null;
  if (Math.abs(net) >= 3) {
    overallInsight =
      net > 0
        ? `${homeTeam} controlling the possession game overall (+${net})`
        : `${awayTeam} winning the possession battle overall (${net})`;
  }

  // ── Coaching priorities (team-named) ──────────────────────────────────────
  const coachingPriorities: string[] = [];

  if (turnoverDangerLevel === "HIGH") {
    coachingPriorities.push(
      `Protect possession — ${awayTeam} scoring from ${homeTeam} turnovers`,
    );
  }
  if (koConcededScores >= 2 && koConcededCount >= 2 && coachingPriorities.length < 3) {
    coachingPriorities.push(
      `Win the ${restartWord} — ${awayTeam} scored from ${koConcededScores} conceded`,
    );
  }
  if (koRetainedScores >= 2 && koRetainedCount >= 2 && coachingPriorities.length < 3) {
    coachingPriorities.push(
      `Keep winning ${restartWord}s — converting ${koRetainedScores} of ${koRetainedCount} to scores`,
    );
  }
  if (toRetainedScores >= 2 && poss.turnovers.retainedCount >= 2 && coachingPriorities.length < 3) {
    coachingPriorities.push(
      `Press for turnovers — ${homeTeam} scored from ${toRetainedScores} of ${poss.turnovers.retainedCount} turnover wins`,
    );
  }
  return {
    dangerInsights,
    weaponInsights,
    ourRestartInsight,
    theirRestartInsight,
    turnoverDangerInsight,
    turnoverDangerLevel,
    bestAttackInsight,
    worstExposureInsight,
    overallNetOutcome,
    overallInsight,
    coachingPriorities: coachingPriorities.slice(0, 3),
    mode,
    lowSampleWarning,
  };
}
