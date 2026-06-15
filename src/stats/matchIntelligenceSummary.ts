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
import { rankChainPatterns } from "./chains/chain-patterns";

// ─── Public type ──────────────────────────────────────────────────────────────

export type MatchIntelligenceSummary = {
  /** Team-named strings about what the opposition is doing to us. */
  dangerInsights: string[];
  /** Team-named strings about what we're doing to the opposition. */
  weaponInsights: string[];
  /** Pre-formatted restart insight for our team (non-null only when winning ≥60%). */
  ourRestartInsight: string | null;
  /** Pre-formatted restart insight for opposition (non-null only when they're winning ≥55%). */
  theirRestartInsight: string | null;
  /** Turnover danger insight (non-null only when opposition scored from ≥1 of our turnovers). */
  turnoverDangerInsight: string | null;
  /** Danger level based on how many times the opposition scored from our turnovers. */
  turnoverDangerLevel: "HIGH" | "MEDIUM" | "LOW" | null;
  /** Best attack source for our team (non-null when ≥50% conversion from ≥3 possessions). */
  bestAttackInsight: string | null;
  /** Worst defensive exposure (non-null when opposition scores ≥40% from ≥2 conceded possessions). */
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
  const patterns = rankChainPatterns(analysis, mode);

  const ko = analysis.kickouts;
  const to = analysis.turnovers;

  const lowSampleWarning = ko.total + to.total < 5;

  const dangers = patterns.filter((p) => p.kind === "DANGER_CHAIN");
  const weapons = patterns.filter((p) => p.kind === "CHAIN_WEAPON");

  // ── Danger insights (team-named) ─────────────────────────────────────────
  const dangerInsights: string[] = [];
  for (const d of dangers) {
    if (d.headline === "Kickout Trap") {
      dangerInsights.push(
        `${awayTeam} scored from ${d.primaryMetric} of ${d.occurrences} ${restartWord}s they won`,
      );
    } else if (d.headline === "Turnover Conceded") {
      dangerInsights.push(
        `${awayTeam} scored from ${d.primaryMetric} ${homeTeam} turnover${d.primaryMetric !== 1 ? "s" : ""}`,
      );
    }
  }

  // ── Weapon insights (team-named) ─────────────────────────────────────────
  const weaponInsights: string[] = [];
  for (const w of weapons) {
    if (w.headline === "Kickout Platform") {
      weaponInsights.push(
        `${homeTeam} scored from ${w.primaryMetric} of ${w.occurrences} ${restartWord} wins`,
      );
    } else if (w.headline === "Turnover Weapon") {
      weaponInsights.push(
        `${homeTeam} converted ${w.primaryMetric} of ${w.occurrences} turnover wins to scores`,
      );
    }
  }

  // ── Restart battle ────────────────────────────────────────────────────────
  let ourRestartInsight: string | null = null;
  let theirRestartInsight: string | null = null;

  if (poss.ourKickouts !== null && poss.theirKickouts !== null) {
    // V1.2+ data with restartOwner split
    const ok = poss.ourKickouts;
    const tk = poss.theirKickouts;
    if (ok.total >= 3) {
      const rate = ok.retainedCount / ok.total;
      if (rate >= 0.60) {
        ourRestartInsight = `${homeTeam} won ${ok.retainedCount} of ${ok.total} their own ${restartWord}s (${Math.round(rate * 100)}%)`;
      }
    }
    if (tk.total >= 3) {
      const rate = tk.retainedCount / tk.total;
      if (rate >= 0.55) {
        theirRestartInsight = `${awayTeam} won ${tk.retainedCount} of ${tk.total} their own ${restartWord}s (${Math.round(rate * 100)}%)`;
      }
    }
  } else if (ko.total >= 3) {
    // Older data without restartOwner — use combined kickout dataset for our team
    const rate = ko.won / ko.total;
    if (rate >= 0.60) {
      ourRestartInsight = `${homeTeam} won ${ko.won} of ${ko.total} ${restartWord}s (${Math.round(rate * 100)}%)`;
    }
  }

  // ── Turnover danger ───────────────────────────────────────────────────────
  const theirTurnoverScores = to.lostAllowedScore;
  const turnoverDangerLevel: "HIGH" | "MEDIUM" | "LOW" | null =
    to.lost === 0 ? null :
    theirTurnoverScores >= 2 ? "HIGH" :
    theirTurnoverScores >= 1 ? "MEDIUM" : "LOW";
  const turnoverDangerInsight =
    theirTurnoverScores >= 1
      ? `${awayTeam} scored from ${theirTurnoverScores} ${homeTeam} turnover${theirTurnoverScores !== 1 ? "s" : ""}`
      : null;

  // ── Best attack source ────────────────────────────────────────────────────
  let bestAttackInsight: string | null = null;
  const attackFamilies: Array<{ label: string; pct: number; count: number }> = [
    { label: `${restartWord} wins`, pct: poss.kickouts.retained.scoringPct, count: poss.kickouts.retainedCount },
    { label: "turnover wins",       pct: poss.turnovers.retained.scoringPct, count: poss.turnovers.retainedCount },
    { label: "placed balls",        pct: poss.frees.retained.scoringPct, count: poss.frees.retainedCount },
  ].filter((f) => f.count >= 3);
  if (attackFamilies.length > 0) {
    const best = attackFamilies.reduce((a, b) => (b.pct > a.pct ? b : a));
    if (best.pct >= 50) {
      bestAttackInsight = `${homeTeam} most dangerous from ${best.label} — ${Math.round(best.pct)}% converted to scores`;
    }
  }

  // ── Worst defensive exposure ──────────────────────────────────────────────
  let worstExposureInsight: string | null = null;
  const exposureFamilies = [
    { label: `${restartWord}s they won`, pct: poss.kickouts.damagePct, count: poss.kickouts.concededCount },
    { label: "turnover wins",            pct: poss.turnovers.damagePct, count: poss.turnovers.concededCount },
    { label: "placed balls won",         pct: poss.frees.damagePct, count: poss.frees.concededCount },
  ].filter((f) => f.count >= 2 && f.pct >= 40);
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
  const kickoutTrap = dangers.find((d) => d.headline === "Kickout Trap");
  if (kickoutTrap && coachingPriorities.length < 3) {
    coachingPriorities.push(
      `Win the ${restartWord} — ${awayTeam} scored from ${kickoutTrap.primaryMetric} conceded`,
    );
  }
  const koWeapon = weapons.find((w) => w.headline === "Kickout Platform");
  if (koWeapon && coachingPriorities.length < 3) {
    coachingPriorities.push(
      `Keep winning ${restartWord}s — converting ${koWeapon.primaryMetric} of ${koWeapon.occurrences} to scores`,
    );
  }
  const toWeapon = weapons.find((w) => w.headline === "Turnover Weapon");
  if (toWeapon && coachingPriorities.length < 3) {
    coachingPriorities.push(
      `Press for turnovers — ${homeTeam} converting ${toWeapon.primaryMetric} of ${toWeapon.occurrences} to scores`,
    );
  }
  if (turnoverDangerLevel === "MEDIUM" && coachingPriorities.length < 3) {
    coachingPriorities.push(
      `Protect the ball — ${awayTeam} punishing ${homeTeam} turnovers`,
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
