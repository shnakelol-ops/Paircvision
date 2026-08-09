/**
 * snapshotDashboardModel.ts
 *
 * Factual dashboard model for the HT/FT Snapshot cover page.
 *
 * PROVENANCE BOUNDARY: every field here is sourced from direct/statistical
 * match facts via buildTeamSummaryBlock() / viewShootingConversion()
 * (src/stats/reporting/teamStatsViews.ts) — never from chain/origin
 * attribution (report.chain.byRule, report.ledger row attribution,
 * report.possessions). This module does not import chain-types' origin
 * datasets, scoreLedger, or possession-outcomes-engine, and the model type
 * below has no slot for an origin/chain field — there is nowhere for one to
 * be added without a visible type change.
 *
 * "Our kickouts" / "Their kickouts" are OWN-kickout retention
 * (kickouts a team physically took, retained vs lost) — not Restart Share
 * (all-restarts-won regardless of who took the kickout). Conflating the two
 * was a locked-vocabulary violation found in the prior reporting audit;
 * this model only ever reads restartTeams.*.ownRestarts* fields.
 */

import type { ChainableEvent } from "../chains/chain-types";
import type { MatchReport } from "./matchReport";
import { buildTeamSummaryBlock } from "./teamStatsViews";
import { viewShootingConversion } from "./teamStatsViews";
import { fraction, type MetricFraction } from "./report-types";

export type SnapshotDashboardPeriod = "HT" | "FT";

export type SnapshotDashboardScoreLine = { goals: number; points: number; total: number };

export type SnapshotDashboardTeam = {
  score: SnapshotDashboardScoreLine;
  shooting: MetricFraction;
  ownKickouts: { retained: number; total: number; lost: number; pct: number };
  turnovers: { won: number; lost: number };
  placed: { scores: number; attempts: number };
};

export type SnapshotDashboardModel = {
  period: SnapshotDashboardPeriod;
  homeTeam: string;
  awayTeam: string;
  /** The team the report is written for ("us"). */
  us: SnapshotDashboardTeam;
  /** The opposition ("them"). */
  them: SnapshotDashboardTeam;
  /** Total events in scope, for the page footer. Not a KPI. */
  eventCount: number;
};

function teamModel(
  block: ReturnType<typeof buildTeamSummaryBlock>,
  shooting: MetricFraction,
): SnapshotDashboardTeam {
  const total = block.ownRestartsRetained + block.ownRestartsLost;
  return {
    score: { goals: block.goals, points: block.points, total: block.scoreTotal },
    shooting,
    ownKickouts: {
      retained: block.ownRestartsRetained,
      total,
      lost: block.ownRestartsLost,
      pct: fraction(block.ownRestartsRetained, total).pct,
    },
    turnovers: { won: block.toWon, lost: block.toLost },
    placed: { scores: block.placedScores, attempts: block.placedAttempts },
  };
}

/**
 * Builds the Snapshot dashboard model from an already-scoped MatchReport
 * (HT: report built with scope "1H" on 1H-filtered events; FT: scope "FULL").
 * Pure function — no canvas, no DOM.
 */
export function buildSnapshotDashboardModel<TEvent extends ChainableEvent>(
  report: MatchReport<TEvent>,
  period: SnapshotDashboardPeriod,
): SnapshotDashboardModel {
  const forBlock = buildTeamSummaryBlock(report, "FOR");
  const oppBlock = buildTeamSummaryBlock(report, "OPP");
  const forShooting = viewShootingConversion(report, "FOR");
  const oppShooting = viewShootingConversion(report, "OPP");

  return {
    period,
    homeTeam: report.homeTeam,
    awayTeam: report.awayTeam,
    us: teamModel(forBlock, forShooting),
    them: teamModel(oppBlock, oppShooting),
    eventCount: report.events.length,
  };
}

/** "Ballylanders lead by 3" / "Level" — margin state, no interpretation. */
export function snapshotMarginLabel(model: SnapshotDashboardModel): string {
  const diff = model.us.score.total - model.them.score.total;
  if (diff === 0) return "Level";
  return diff > 0 ? `${model.homeTeam} lead by ${diff}` : `${model.awayTeam} lead by ${Math.abs(diff)}`;
}

/**
 * Forbidden-field guard: the keys a chain/origin/possession-attribution field
 * would use if one were ever added to this model. Enforced by
 * snapshotDashboardModel.test.ts via a runtime key-scan of a built model —
 * kept here (not just in the type) so the guard survives even if `any`
 * casts are introduced later.
 */
export const SNAPSHOT_DASHBOARD_FORBIDDEN_KEYS = [
  "originScore",
  "restartOriginScore",
  "turnoverOriginScore",
  "chainRate",
  "chainShare",
  "punishmentRate",
  "originScoreAgainst",
  "restartShare",
  "restartShareWon",
  "restartShareConceded",
] as const;
