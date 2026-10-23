/**
 * coreIntelligenceBoundary.test.ts
 *
 * Guards the boundary between authoritative match facts and the
 * possession-chain Intelligence layer (Event Stats RED audit, F-01 – F-06).
 *
 * The chain engine's forward scan — which shot or score followed a restart
 * or turnover — is Intelligence. It may move a score between origin rows
 * (restart / turnover / general play), but it must never change a core
 * match fact: scores, restart and turnover counts, own-kickout retention,
 * Restart Share, placed balls or blocked / saved attempts.
 *
 * Each test blanks every forward-scan field and asserts the core figures do
 * not move. If a future change makes a core counter read chain attribution,
 * these fail.
 */

import { describe, expect, it } from "vitest";
import { adaptProTaggerAction, type ProTaggerAction } from "../../pro-tagger/pro-tagger-adapter";
import { toEventStatsReportEvents } from "../../pro-tagger/pro-tagger-review-adapter";
import type { LoggedMatchEvent } from "../../core/stats/saved-match";
import type { ChainAnalysis, ChainableEvent } from "../chains/chain-types";
import { buildDirectScoringBreakdown, buildScoreLedger } from "../ledger/scoreLedger";
import { computeRestartMetrics } from "../restarts/restartMetrics";
import { buildMatchReport, type MatchReport } from "./matchReport";
import { computeRestartTeamMetrics } from "./restartTeamMetrics";
import { buildSnapshotDashboardModel } from "./snapshotDashboardModel";
import { buildTeamSummaryBlock } from "./teamStatsViews";

let clock = 0;
function tap(a: Partial<ProTaggerAction> & Pick<ProTaggerAction, "familyId" | "tileLabel" | "teamSide">): LoggedMatchEvent {
  clock += 8;
  return adaptProTaggerAction({ nx: 0.5, ny: 0.5, half: 1, matchClockSeconds: clock, ...a });
}

/** An Event Stats sequence exercising every repaired path, for both teams. */
function matchStream(): LoggedMatchEvent[] {
  clock = 0;
  return [
    tap({ familyId: "RESTART", tileLabel: "Clean", teamSide: "FOR", restartOwner: "FOR" }),
    tap({ familyId: "POINT", tileLabel: "Play", teamSide: "FOR" }),
    tap({ familyId: "RESTART", tileLabel: "Break", teamSide: "OPP", restartOwner: "FOR" }),
    tap({ familyId: "TURNOVER", tileLabel: "Interception", teamSide: "FOR" }),
    tap({ familyId: "TURNOVER", tileLabel: "HP Error", teamSide: "OPP" }),
    tap({ familyId: "TURNOVER", tileLabel: "Tackle", teamSide: "FOR" }),
    tap({ familyId: "SHOT", tileLabel: "Block/Save", teamSide: "FOR" }),
    tap({ familyId: "RESTART", tileLabel: "Foul", teamSide: "OPP", restartOwner: "OPP" }),
    tap({ familyId: "POINT", tileLabel: "65", teamSide: "OPP" }),
    tap({ familyId: "TURNOVER", tileLabel: "KP Error", teamSide: "OPP" }),
    tap({ familyId: "GOAL", tileLabel: "Play", teamSide: "OPP" }),
    tap({ familyId: "RESTART", tileLabel: "Clean", teamSide: "FOR", restartOwner: "OPP" }),
    tap({ familyId: "SHOT", tileLabel: "Short", teamSide: "FOR" }),
    tap({ familyId: "WIDE", tileLabel: "Play", teamSide: "OPP" }),
  ];
}

/** The same analysis with every Intelligence forward-scan result removed. */
function withoutForwardScan<T extends ChainableEvent>(a: ChainAnalysis<T>): ChainAnalysis<T> {
  return {
    ...a,
    allChains: [],
    kickouts: {
      ...a.kickouts,
      outcomes: a.kickouts.outcomes.map((o) => ({ ...o, nextScore: null, nextShotOrScore: null, secondsToScore: null })),
    },
    turnovers: {
      ...a.turnovers,
      outcomes: a.turnovers.outcomes.map((o) => ({
        ...o, nextEvent: null, resultedInScore: false, resultedInShot: false, secondsToOutcome: null,
      })),
    },
  };
}

/** A report whose every Intelligence-derived part is rebuilt from the blanked analysis. */
function blankedReport<T extends ChainableEvent>(r: MatchReport<T>): MatchReport<T> {
  const chain = withoutForwardScan(r.chain);
  return {
    ...r,
    chain,
    restarts: computeRestartMetrics(chain.kickouts.outcomes),
    restartTeams: computeRestartTeamMetrics(chain.kickouts.outcomes),
    ledger: buildScoreLedger(r.events, chain, "Home", "Away"),
  };
}

const build = (events: readonly ChainableEvent[]) =>
  buildMatchReport({ events: toEventStatsReportEvents(events as LoggedMatchEvent[]), homeTeam: "Home", awayTeam: "Away" });

describe("Intelligence forward scan cannot alter core match facts", () => {
  const report = build(matchStream());
  const blanked = blankedReport(report);

  it("the fixture really has Intelligence attribution to remove", () => {
    expect(report.chain.kickouts.outcomes.some((o) => o.nextScore !== null)).toBe(true);
    expect(report.chain.turnovers.outcomes.some((o) => o.resultedInScore)).toBe(true);
  });

  it("restart counts, own-kickout retention and Restart Share read only the restart event", () => {
    expect(blanked.restartTeams).toEqual(report.restartTeams);
    expect(blanked.restarts.restartShare).toEqual(report.restarts.restartShare);
    expect(blanked.restarts.ownKickoutRetention).toEqual(report.restarts.ownKickoutRetention);
    expect(blanked.restarts.oppKickoutWinRate).toEqual(report.restarts.oppKickoutWinRate);
  });

  it("team Match Summary blocks (Snapshot, Quick Review, Full Review p1) are unchanged", () => {
    for (const side of ["FOR", "OPP"] as const) {
      expect(buildTeamSummaryBlock(blanked, side)).toEqual(buildTeamSummaryBlock(report, side));
    }
    expect(buildSnapshotDashboardModel(blanked, "FT")).toEqual(buildSnapshotDashboardModel(report, "FT"));
  });

  it("score totals and the direct (match-fact) scoring breakdown never depend on chain origins", () => {
    const sum = (rows: typeof report.ledger.rows, side: "us" | "them") => rows.reduce((n, r) => n + r[side].value, 0);
    expect(blanked.ledger.forScore).toEqual(report.ledger.forScore);
    expect(blanked.ledger.oppScore).toEqual(report.ledger.oppScore);
    expect(blanked.ledger.margin).toBe(report.ledger.margin);
    // Origin rows may differ, but each partition still sums to the real score.
    for (const l of [report.ledger, blanked.ledger]) {
      expect(sum(l.rows, "us")).toBe(l.forScore.total);
      expect(sum(l.rows, "them")).toBe(l.oppScore.total);
    }
    expect(buildDirectScoringBreakdown(report.events))
      .toEqual(buildDirectScoringBreakdown(blanked.events));
  });

  it("Intelligence only moves scores between origin rows", () => {
    const row = (id: string, l: typeof report.ledger) => l.rows.find((r) => r.id === id);
    expect(row("TURNOVER_WON", blanked.ledger)?.them.value ?? 0).toBe(0);
    expect(row("RESTART_WON", blanked.ledger)?.us.value ?? 0).toBe(0);
    expect(row("PLACED", blanked.ledger)).toEqual(row("PLACED", report.ledger));
  });
});
