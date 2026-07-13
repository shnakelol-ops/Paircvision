/**
 * Canonical reporting layer — public exports.
 *
 * Every coach-facing surface must build a MatchReport once and consume
 * fields / reportViews helpers from this module.
 */

export { buildMatchReport, filterEventsForScope, type BuildMatchReportInput, type MatchReport } from "./matchReport";
export { type ReportScope, type MetricFraction, type MetricHalfSplit, fmtFractionCounts, fmtFractionPct, fraction } from "./report-types";
export { computeTurnoverMetrics, turnoverMetricLabel, turnoverShareSentence, type TurnoverMetrics, type TurnoverMetricId } from "./turnoverMetrics";
export {
  viewRestartShare,
  viewOwnKickoutRetention,
  viewRestartWinsToScore,
  viewRestartLossPunishment,
  viewTurnoverShare,
  viewTurnoverWinsToScore,
  viewTurnoverLossPunishment,
  viewTurnoverWonToShotOnly,
  viewPossessionRetention,
  viewKickoutPossessionScoringPct,
  viewTurnoverPossessionScoringPct,
  viewTurnoverPossessionDamagePct,
  viewMirroredPossessionCounts,
  viewTargetsKickoutWinRate,
  type MirroredPossessionCounts,
} from "./reportViews";
export { adaptEventsToChainable, type AdaptableEvent } from "./eventAdapter";
export {
  buildTeamSummaryBlock,
  buildShareCardBreakdown,
  viewCoachingBriefStats,
  viewCoachingScoringRuns,
  viewRestartShareForTeam,
  viewTurnoverShareForTeam,
  viewMirroredCountsForTeam,
  viewShootingConversion,
  viewShootingConversionLabel,
  type TeamSummaryBlock,
  type ShareCardTeamBreakdown,
  type CoachingBriefStats,
  type CoachingScoringRun,
} from "./teamStatsViews";
