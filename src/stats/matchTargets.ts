import type { MatchEventKind, MatchEventPeriod, MatchEventSegment } from "../core/stats/stats-event-model";
import type { PitchSport } from "../core/pitch/pitch-config";
import { buildMatchReport } from "./reporting/matchReport";
import { viewPossessionRetention, viewTargetsKickoutWinRate } from "./reporting/reportViews";
import { buildTeamSummaryBlock, viewShootingConversion } from "./reporting/teamStatsViews";

// ─── Public types ─────────────────────────────────────────────────────────────

export type MatchTargetMetric =
  | "shots"
  | "shootingEfficiency"
  | "kickoutWinRate"
  | "turnoversWon"
  | "turnoversLost"
  | "possessionRetention"
  | "wides"
  | "freesWon"
  | "freesConceded"
  | "scores"
  | "goals"
  | "points"
  | "twoPointers"
  | "oppShootingEfficiency"
  | "kickoutsConceded";

export type MatchTargetDirection = "atLeast" | "atMost";

export type MatchTargetStatus = "GREEN" | "AMBER" | "RED" | "NO_DATA";

export type MatchTarget = {
  metric: MatchTargetMetric;
  targetValue: number;
  direction: MatchTargetDirection;
  enabled: boolean;
};

export type MatchTargets = {
  targets: readonly MatchTarget[];
};

export type MatchTargetResult = {
  metric: MatchTargetMetric;
  label: string;
  targetValue: number;
  direction: MatchTargetDirection;
  actual: number | null;
  actualH1: number | null;
  actualH2: number | null;
  status: MatchTargetStatus;
  statusH1: MatchTargetStatus;
  statusH2: MatchTargetStatus;
};

// ─── Internal event interface ─────────────────────────────────────────────────
// Structurally satisfied by both LoggedMatchEvent and PdfExportEvent.

type TargetableEvent = {
  id: string;
  kind: MatchEventKind;
  teamSide: "FOR" | "OPP";
  period: MatchEventPeriod;
  segment: MatchEventSegment;
  nx: number;
  ny: number;
  matchClockSeconds?: number | null;
  restartOwner?: "FOR" | "OPP" | null;
  tags?: string[] | null;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const AMBER_RATE_THRESHOLD  = 5;
const AMBER_COUNT_THRESHOLD = 2;

const COUNT_METRICS = new Set<MatchTargetMetric>([
  "shots", "turnoversWon", "turnoversLost", "wides", "freesWon", "freesConceded",
  "scores", "goals", "points", "twoPointers", "kickoutsConceded",
]);

const SHOTS_KINDS = new Set<MatchEventKind>([
  "GOAL", "POINT", "TWO_POINTER", "FORTY_FIVE_TWO_POINT",
  "FREE_SCORED", "FREE_MISSED", "WIDE", "SHOT",
]);

const SCORE_KINDS = new Set<MatchEventKind>([
  "GOAL", "POINT", "TWO_POINTER", "FORTY_FIVE_TWO_POINT", "FREE_SCORED",
]);

// ─── Computation ──────────────────────────────────────────────────────────────

/** Excludes synthetic "log opposition instant score" marker events, matching the ledger. */
function isRealEvent(e: TargetableEvent): boolean {
  return !e.id.includes("-instant-score-");
}

function shotsForPeriod(events: readonly TargetableEvent[], period: "1H" | "2H" | null): number | null {
  const filtered = (period != null ? events.filter(e => e.period === period) : events)
    .filter(isRealEvent);
  const hasEventsInPeriod = filtered.some(e => e.teamSide === "FOR");
  if (!hasEventsInPeriod) return null;
  return filtered.filter(e => e.teamSide === "FOR" && SHOTS_KINDS.has(e.kind)).length;
}

function computeActuals(events: readonly TargetableEvent[], period: "1H" | "FULL") {
  const scoped = period === "1H" ? events.filter(e => e.period === "1H") : events;

  const forScoped = scoped.filter(e => e.teamSide === "FOR" && isRealEvent(e));
  const hasAny = forScoped.length > 0 || scoped.length > 0;
  const hasFor = forScoped.length > 0;

  // Kickout win rate / possession retention / shooting conversion / team
  // summary counts — all canonical MatchReport views, built once per scope
  // so every metric agrees with the same MatchReport the PDF/Coaching Brief
  // /Share Card consume (synthetic instant-score markers excluded there too).
  const reportScope = period === "1H" ? "1H" : "FULL";
  const report = buildMatchReport({
    events: scoped,
    homeTeam: "FOR",
    awayTeam: "OPP",
    scope: reportScope,
  });
  const kickoutWinRate = viewTargetsKickoutWinRate(report);
  const possessionRetention = (() => {
    const f = viewPossessionRetention(report);
    return f.den > 0 ? f.pct : null;
  })();

  const forShooting = viewShootingConversion(report, "FOR");
  const oppShooting = viewShootingConversion(report, "OPP");
  const forSummary = buildTeamSummaryBlock(report, "FOR");

  // Shots
  const shots = period === "1H"
    ? shotsForPeriod(events, "1H")
    : (events.some(e => e.teamSide === "FOR") ? forSummary.shots : null);
  const shotsH1 = shotsForPeriod(events, "1H");
  const shotsH2 = shotsForPeriod(events, "2H");

  // Shooting efficiency — canonical viewShootingConversion (den = attempts)
  const shootingEfficiency = forShooting.den > 0 ? forShooting.pct : (hasAny ? 0 : null);

  // Count metrics — canonical TeamSummaryBlock (same bilateral/mirrored
  // counting the PDF Match Summary Table and Coaching Brief already use)
  const turnoversWon     = hasFor ? forSummary.toWon      : null;
  const turnoversLost    = hasFor ? forSummary.toLost     : null;
  const wides            = hasFor ? forSummary.wides      : null;
  const freesWon         = hasFor ? forSummary.freesWon   : null;
  const freesConceded    = hasFor ? forSummary.freesCon   : null;
  const goals            = hasFor ? forSummary.goals      : null;
  const twoPointers      = hasFor ? forSummary.twoPointers : null;
  // "scores"/"points" target specific literal kinds (not the PDF's
  // aggregate point-value total) — no canonical equivalent, kept local.
  const scores           = hasFor ? forScoped.filter(e => SCORE_KINDS.has(e.kind)).length      : null;
  const points           = hasFor ? forScoped.filter(e => e.kind === "POINT").length           : null;
  const kickoutsConceded = hasFor ? forScoped.filter(e => e.kind === "KICKOUT_CONCEDED").length : null;

  // Opposition shooting efficiency — canonical viewShootingConversion
  const oppScoped = scoped.filter(e => e.teamSide === "OPP" && isRealEvent(e));
  const oppShootingEfficiency = oppShooting.den > 0
    ? oppShooting.pct
    : (oppScoped.length > 0 ? 0 : null);

  return {
    shots, shotsH1, shotsH2,
    shootingEfficiency, kickoutWinRate, possessionRetention,
    turnoversWon, turnoversLost,
    wides, freesWon, freesConceded,
    scores, goals, points, twoPointers,
    oppShootingEfficiency, kickoutsConceded,
  };
}

function resolveStatus(target: MatchTarget, actual: number | null): MatchTargetStatus {
  if (actual === null) return "NO_DATA";
  const threshold = COUNT_METRICS.has(target.metric) ? AMBER_COUNT_THRESHOLD : AMBER_RATE_THRESHOLD;
  if (target.direction === "atLeast") {
    if (actual >= target.targetValue) return "GREEN";
    if (actual >= target.targetValue - threshold) return "AMBER";
    return "RED";
  }
  if (actual <= target.targetValue) return "GREEN";
  if (actual <= target.targetValue + threshold) return "AMBER";
  return "RED";
}

function sportLabel(metric: MatchTargetMetric, sport: PitchSport): string {
  const isPuckout = sport === "hurling" || sport === "camogie";
  switch (metric) {
    case "shots":                 return "Shots per half";
    case "shootingEfficiency":    return "Shooting %";
    case "kickoutWinRate":        return "Restart Share";
    case "turnoversWon":          return "Turnovers Won";
    case "turnoversLost":         return "Turnovers Lost";
    case "possessionRetention":   return "Possession Retention";
    case "wides":                 return "Wides";
    case "freesWon":              return "Frees Won";
    case "freesConceded":         return "Frees Conceded";
    case "scores":                return "Scores";
    case "goals":                 return "Goals";
    case "points":                return "Points";
    case "twoPointers":           return "Two-Pointers";
    case "oppShootingEfficiency": return "Opp. Shooting %";
    case "kickoutsConceded":      return isPuckout ? "Puckouts Conceded" : "Kickouts Conceded";
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function computeTargetResults(
  targets: MatchTargets,
  events: readonly TargetableEvent[],
  period: "1H" | "FULL",
  sport: PitchSport,
): MatchTargetResult[] {
  const enabled = targets.targets.filter(t => t.enabled);
  if (enabled.length === 0) return [];

  const actuals = computeActuals(events, period);

  return enabled.map((target): MatchTargetResult => {
    let actual: number | null = null;
    let actualH1: number | null = null;
    let actualH2: number | null = null;
    let status: MatchTargetStatus = "NO_DATA";
    let statusH1: MatchTargetStatus = "NO_DATA";
    let statusH2: MatchTargetStatus = "NO_DATA";

    switch (target.metric) {
      case "shots":
        if (period === "1H") {
          actual   = actuals.shotsH1;
          actualH1 = actuals.shotsH1;
          status   = resolveStatus(target, actual);
          statusH1 = status;
        } else {
          // At FT we show both halves; status = hit only if both halves hit
          actualH1  = actuals.shotsH1;
          actualH2  = actuals.shotsH2;
          actual    = actuals.shots;
          statusH1  = resolveStatus(target, actualH1);
          statusH2  = resolveStatus(target, actualH2);
          status    = statusH1 === "NO_DATA" && statusH2 === "NO_DATA" ? "NO_DATA"
                    : (statusH1 === "GREEN" || statusH1 === "AMBER") && (statusH2 === "GREEN" || statusH2 === "AMBER") ? "GREEN"
                    : (statusH1 === "RED" && statusH2 === "RED") ? "RED"
                    : "AMBER";
        }
        break;
      case "shootingEfficiency":
        actual = actuals.shootingEfficiency;
        status = resolveStatus(target, actual);
        break;
      case "kickoutWinRate":
        actual = actuals.kickoutWinRate;
        status = resolveStatus(target, actual);
        break;
      case "turnoversWon":
        actual = actuals.turnoversWon;
        status = resolveStatus(target, actual);
        break;
      case "turnoversLost":
        actual = actuals.turnoversLost;
        status = resolveStatus(target, actual);
        break;
      case "possessionRetention":
        actual = actuals.possessionRetention;
        status = resolveStatus(target, actual);
        break;
      case "wides":
        actual = actuals.wides;
        status = resolveStatus(target, actual);
        break;
      case "freesWon":
        actual = actuals.freesWon;
        status = resolveStatus(target, actual);
        break;
      case "freesConceded":
        actual = actuals.freesConceded;
        status = resolveStatus(target, actual);
        break;
      case "scores":
        actual = actuals.scores;
        status = resolveStatus(target, actual);
        break;
      case "goals":
        actual = actuals.goals;
        status = resolveStatus(target, actual);
        break;
      case "points":
        actual = actuals.points;
        status = resolveStatus(target, actual);
        break;
      case "twoPointers":
        actual = actuals.twoPointers;
        status = resolveStatus(target, actual);
        break;
      case "oppShootingEfficiency":
        actual = actuals.oppShootingEfficiency;
        status = resolveStatus(target, actual);
        break;
      case "kickoutsConceded":
        actual = actuals.kickoutsConceded;
        status = resolveStatus(target, actual);
        break;
    }

    return {
      metric:      target.metric,
      label:       sportLabel(target.metric, sport),
      targetValue: target.targetValue,
      direction:   target.direction,
      actual,
      actualH1,
      actualH2,
      status,
      statusH1,
      statusH2,
    };
  });
}

export function enabledTargetCount(targets: MatchTargets): number {
  return targets.targets.filter(t => t.enabled).length;
}

export function hasEnabledTargets(targets: MatchTargets | undefined): boolean {
  return (targets?.targets.some(t => t.enabled)) ?? false;
}
