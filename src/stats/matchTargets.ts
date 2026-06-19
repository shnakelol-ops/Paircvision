import type { MatchEventKind, MatchEventPeriod, MatchEventSegment } from "../core/stats/stats-event-model";
import type { PitchSport } from "../core/pitch/pitch-config";
import { buildPossessionOutcomeSummary } from "./chains/possession-outcomes-engine";

// ─── Public types ─────────────────────────────────────────────────────────────

export type MatchTargetMetric =
  | "shots"
  | "shootingEfficiency"
  | "kickoutWinRate"
  | "possessionRetention";

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

const SHOTS_KINDS = new Set<MatchEventKind>([
  "GOAL", "POINT", "TWO_POINTER", "FORTY_FIVE_TWO_POINT",
  "FREE_SCORED", "FREE_MISSED", "WIDE", "SHOT",
]);

const SCORE_KINDS = new Set<MatchEventKind>([
  "GOAL", "POINT", "TWO_POINTER", "FORTY_FIVE_TWO_POINT", "FREE_SCORED",
]);

// ─── Computation ──────────────────────────────────────────────────────────────

function countFor(events: readonly TargetableEvent[], kinds: Set<MatchEventKind>, period?: "1H" | "2H"): number {
  return events.filter(e =>
    e.teamSide === "FOR" &&
    kinds.has(e.kind) &&
    (period == null || e.period === period)
  ).length;
}

function shotsForPeriod(events: readonly TargetableEvent[], period: "1H" | "2H" | null): number | null {
  const filtered = period != null
    ? events.filter(e => e.period === period)
    : events;
  const hasEventsInPeriod = filtered.some(e => e.teamSide === "FOR");
  if (!hasEventsInPeriod) return null;
  return filtered.filter(e => e.teamSide === "FOR" && SHOTS_KINDS.has(e.kind)).length;
}

function computeActuals(events: readonly TargetableEvent[], period: "1H" | "FULL") {
  const scoped = period === "1H" ? events.filter(e => e.period === "1H") : events;

  const forScoped = scoped.filter(e => e.teamSide === "FOR");
  const hasAny = forScoped.length > 0 || scoped.length > 0;

  // Shots
  const shots = period === "1H"
    ? shotsForPeriod(events, "1H")
    : (events.some(e => e.teamSide === "FOR") ? countFor(events, SHOTS_KINDS) : null);
  const shotsH1 = shotsForPeriod(events, "1H");
  const shotsH2 = shotsForPeriod(events, "2H");

  // Shooting efficiency
  const attempts = forScoped.filter(e => SHOTS_KINDS.has(e.kind)).length;
  const scores   = forScoped.filter(e => SCORE_KINDS.has(e.kind)).length;
  const shootingEfficiency = attempts > 0 ? Math.round((scores / attempts) * 100) : (hasAny ? 0 : null);

  // Kickout win rate
  const koWon   = countFor(scoped, new Set<MatchEventKind>(["KICKOUT_WON"]));
  const koLost  = countFor(scoped, new Set<MatchEventKind>(["KICKOUT_CONCEDED"]));
  const koTotal = koWon + koLost;
  const kickoutWinRate = koTotal > 0 ? Math.round((koWon / koTotal) * 100) : null;

  // Possession retention
  const summary       = buildPossessionOutcomeSummary(scoped);
  const totalRetained = summary.kickouts.retainedCount + summary.turnovers.retainedCount + summary.frees.retainedCount;
  const totalTracked  = summary.kickouts.total + summary.turnovers.total + summary.frees.total;
  const possessionRetention = totalTracked > 0 ? Math.round((totalRetained / totalTracked) * 100) : null;

  return { shots, shotsH1, shotsH2, shootingEfficiency, kickoutWinRate, possessionRetention };
}

function resolveStatus(target: MatchTarget, actual: number | null): MatchTargetStatus {
  if (actual === null) return "NO_DATA";
  const threshold = target.metric === "shots" ? AMBER_COUNT_THRESHOLD : AMBER_RATE_THRESHOLD;
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
    case "shots":               return "Shots per half";
    case "shootingEfficiency":  return "Shooting %";
    case "kickoutWinRate":      return isPuckout ? "Puckouts" : "Kickouts";
    case "possessionRetention": return "Possession Retention";
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
      case "possessionRetention":
        actual = actuals.possessionRetention;
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
