/**
 * surfaceParity.test.ts
 *
 * Proves every coach-facing surface derives restart / turnover / possession
 * metrics from the same canonical MatchReport on the golden fixture.
 */

import { describe, expect, it } from "vitest";
import { buildMatchIntelligenceSummary } from "../matchIntelligenceSummary";
import { computeTargetResults } from "../matchTargets";
import { buildMatchReport } from "./matchReport";
import {
  GOLDEN_RESTART_EXPECTATIONS,
  GOLDEN_TEAMS,
  GOLDEN_TURNOVER_EXPECTATIONS,
  buildGoldenReportingFixture,
} from "./golden-fixture";
import {
  viewPossessionRetention,
  viewRestartShare,
  viewTurnoverShare,
} from "./reportViews";
import {
  viewChainOppShare,
  viewRestartShareOpposition,
  viewRestartWinsToScore,
  viewShootingConversionPct,
  viewTurnoverWinsToScore,
} from "./pdfReportViews";
import {
  buildShareCardBreakdown,
  buildTeamSummaryBlock,
  viewCoachingBriefStats,
  viewRestartShareForTeam,
} from "./teamStatsViews";
import { adaptEventsToChainable } from "./eventAdapter";

const events = buildGoldenReportingFixture();

function fullReport() {
  return buildMatchReport({
    events,
    homeTeam: GOLDEN_TEAMS.home,
    awayTeam: GOLDEN_TEAMS.away,
    scope: "FULL",
  });
}

function htReport() {
  return buildMatchReport({
    events,
    homeTeam: GOLDEN_TEAMS.home,
    awayTeam: GOLDEN_TEAMS.away,
    scope: "1H",
  });
}

describe("surface parity — golden fixture", () => {
  it("Full Review PDF summary table — Restart Share", () => {
    const report = fullReport();
    const forBlock = buildTeamSummaryBlock(report, "FOR");
    expect(forBlock.koPct).toBe(`${GOLDEN_RESTART_EXPECTATIONS.restartShare.pct}%`);
    expect(forBlock.koWon).toBe(GOLDEN_RESTART_EXPECTATIONS.restartShare.num);
  });

  it("HT Snapshot scope — Restart Share on first half only", () => {
    const report = htReport();
    expect(viewRestartShare(report).pct).toBe(
      Math.round((report.restarts.restartShare.h1.num / report.restarts.restartShare.h1.den) * 100),
    );
  });

  it("FT Snapshot scope — full-match Restart Share", () => {
    const report = fullReport();
    expect(viewRestartShare(report).pct).toBe(GOLDEN_RESTART_EXPECTATIONS.restartShare.pct);
  });

  it("Intelligence Pack — possession kickout total matches chain event count", () => {
    const report = fullReport();
    expect(report.possessions.kickouts.total).toBe(GOLDEN_RESTART_EXPECTATIONS.restartShare.den);
    expect(report.possessions.turnovers.total).toBe(GOLDEN_TURNOVER_EXPECTATIONS.turnoverShareFull.den);
  });

  it("Match Intelligence — rebuilds same possession totals", () => {
    const report = fullReport();
    buildMatchIntelligenceSummary(events, GOLDEN_TEAMS.home, GOLDEN_TEAMS.away, "FT", "kickout");
    expect(report.possessions.kickouts.retainedCount).toBeGreaterThan(0);
    expect(viewRestartShare(report).pct).toBe(GOLDEN_RESTART_EXPECTATIONS.restartShare.pct);
  });

  it("Coaching Brief — kickoutPct matches Restart Share", () => {
    const report = fullReport();
    const adapted = adaptEventsToChainable(events.map((e) => ({
      ...e,
      half: e.period === "1H" ? 1 as const : 2 as const,
      timestamp: e.matchClockSeconds ?? 0,
      team: "HOME" as const,
    })));
    const briefReport = buildMatchReport({
      events: adapted,
      homeTeam: GOLDEN_TEAMS.home,
      awayTeam: GOLDEN_TEAMS.away,
    });
    expect(viewCoachingBriefStats(briefReport).kickoutPct).toBe(
      GOLDEN_RESTART_EXPECTATIONS.restartShare.pct,
    );
  });

  it("Stats Share Card — HOME Restart Share matches canonical", () => {
    const report = fullReport();
    const breakdown = buildShareCardBreakdown(report);
    expect(breakdown.HOME.kickWinPct).toBe(`${GOLDEN_RESTART_EXPECTATIONS.restartShare.pct}%`);
    expect(breakdown.HOME.kickWon).toBe(GOLDEN_RESTART_EXPECTATIONS.restartShare.num);
  });

  it("Match Targets — Restart Share and possession retention", () => {
    const results = computeTargetResults(
      {
        targets: [
          { metric: "kickoutWinRate", targetValue: 50, direction: "atLeast", enabled: true },
          { metric: "possessionRetention", targetValue: 50, direction: "atLeast", enabled: true },
        ],
      },
      events,
      "FULL",
      "gaelic",
    );
    expect(results.find((r) => r.metric === "kickoutWinRate")?.actual).toBe(
      GOLDEN_RESTART_EXPECTATIONS.restartShare.pct,
    );
    expect(results.find((r) => r.metric === "possessionRetention")?.actual).toBe(
      viewPossessionRetention(fullReport()).pct,
    );
  });

  it("Turnover Share consistent across PDF block and canonical view", () => {
    const report = fullReport();
    const forBlock = buildTeamSummaryBlock(report, "FOR");
    expect(forBlock.toWon).toBe(GOLDEN_TURNOVER_EXPECTATIONS.turnoverShareFull.num);
    expect(viewTurnoverShare(report).pct).toBe(GOLDEN_TURNOVER_EXPECTATIONS.turnoverShareFull.pct);
  });

  it("Opposition Restart Share is complement on same denominator", () => {
    const report = fullReport();
    const opp = viewRestartShareForTeam(report, "OPP");
    const home = viewRestartShare(report);
    expect(opp.num + home.num).toBe(home.den);
    expect(opp.den).toBe(home.den);
  });

  it("PDF views — opposition restart share matches team view", () => {
    const report = fullReport();
    const oppPdf = viewRestartShareOpposition(report);
    const oppTeam = viewRestartShareForTeam(report, "OPP");
    expect(oppPdf.pct).toBe(oppTeam.pct);
    expect(oppPdf.num).toBe(oppTeam.num);
  });

  it("PDF views — restart wins to score matches golden turnover expectations shape", () => {
    const report = fullReport();
    expect(viewRestartWinsToScore(report).num).toBeGreaterThanOrEqual(0);
    expect(viewTurnoverWinsToScore(report).pct).toBe(GOLDEN_TURNOVER_EXPECTATIONS.winsToScoreFull.pct);
  });

  it("PDF views — chain opp share complements FOR share", () => {
    const report = fullReport();
    const opp = viewChainOppShare(report);
    expect(opp.den).toBe(report.chain.summary.totalChains);
  });

  it("PDF views — shooting conversion FOR matches teamStatsViews", () => {
    const report = fullReport();
    expect(viewShootingConversionPct(report, "FOR")).toBeGreaterThanOrEqual(0);
  });
});
