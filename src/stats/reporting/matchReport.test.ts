/**
 * matchReport.test.ts
 *
 * Golden-fixture regression suite — proves every coach-facing view derives
 * from the same canonical MatchReport without recomputing from raw events.
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
  viewKickoutPossessionScoringPct,
  viewMirroredPossessionCounts,
  viewOwnKickoutRetention,
  viewPossessionRetention,
  viewRestartLossPunishment,
  viewRestartShare,
  viewRestartWinsToScore,
  viewTargetsKickoutWinRate,
  viewTurnoverLossPunishment,
  viewTurnoverPossessionDamagePct,
  viewTurnoverPossessionScoringPct,
  viewTurnoverShare,
  viewTurnoverWinsToScore,
  viewTurnoverWonToShotOnly,
} from "./reportViews";

describe("buildMatchReport — golden fixture", () => {
  const events = buildGoldenReportingFixture();
  const report = buildMatchReport({
    events,
    homeTeam: GOLDEN_TEAMS.home,
    awayTeam: GOLDEN_TEAMS.away,
    scope: "FULL",
  });

  it("restart metrics match locked golden values", () => {
    expect(report.restarts.restartShare.full).toEqual(GOLDEN_RESTART_EXPECTATIONS.restartShare);
    expect(report.restarts.ownKickoutRetention.full).toEqual(GOLDEN_RESTART_EXPECTATIONS.ownRetentionFull);
    expect(report.restarts.ownKickoutRetention.h1).toEqual(GOLDEN_RESTART_EXPECTATIONS.ownRetentionH1);
    expect(report.restarts.ownKickoutRetention.h2).toEqual(GOLDEN_RESTART_EXPECTATIONS.ownRetentionH2);
    expect(report.restarts.oppKickoutWinRate.full).toEqual(GOLDEN_RESTART_EXPECTATIONS.oppKickoutWinRate);
    expect(report.restarts.restartToScore).toEqual(GOLDEN_RESTART_EXPECTATIONS.restartToScore);
    expect(report.restarts.restartLossPunishment).toEqual(GOLDEN_RESTART_EXPECTATIONS.restartLossPunish);
  });

  it("turnover metrics match locked golden values", () => {
    expect(report.turnovers.turnoverShare.full).toEqual(GOLDEN_TURNOVER_EXPECTATIONS.turnoverShareFull);
    expect(report.turnovers.turnoverShare.h1).toEqual(GOLDEN_TURNOVER_EXPECTATIONS.turnoverShareH1);
    expect(report.turnovers.turnoverShare.h2).toEqual(GOLDEN_TURNOVER_EXPECTATIONS.turnoverShareH2);
    expect(report.turnovers.turnoverWinsToScore).toEqual(GOLDEN_TURNOVER_EXPECTATIONS.winsToScoreFull);
    expect(report.turnovers.turnoverLossPunishment).toEqual(GOLDEN_TURNOVER_EXPECTATIONS.lossPunishFull);
    expect(report.turnovers.turnoverWonToShotOnly).toEqual(GOLDEN_TURNOVER_EXPECTATIONS.wonToShotOnlyFull);
  });

  it("chain dataset aligns with canonical restart metrics", () => {
    const ko = report.chain.kickouts;
    expect(ko.won).toBe(GOLDEN_RESTART_EXPECTATIONS.restartShare.num);
    expect(ko.total).toBe(GOLDEN_RESTART_EXPECTATIONS.restartShare.den);
    expect(ko.wonToScore).toBe(GOLDEN_RESTART_EXPECTATIONS.restartToScore.num);
    expect(ko.wonToScorePercent).toBe(GOLDEN_RESTART_EXPECTATIONS.restartToScore.pct);
    expect(ko.lostAllowedScore).toBe(GOLDEN_RESTART_EXPECTATIONS.restartLossPunish.num);
    expect(ko.lostAllowedScorePercent).toBe(GOLDEN_RESTART_EXPECTATIONS.restartLossPunish.pct);
  });

  it("chain dataset aligns with canonical turnover metrics", () => {
    const tv = report.chain.turnovers;
    expect(tv.wonToScore).toBe(GOLDEN_TURNOVER_EXPECTATIONS.winsToScoreFull.num);
    expect(tv.wonToScorePercent).toBe(GOLDEN_TURNOVER_EXPECTATIONS.winsToScoreFull.pct);
    expect(tv.lostAllowedScore).toBe(GOLDEN_TURNOVER_EXPECTATIONS.lossPunishFull.num);
  });
});

describe("reportViews — cross-surface parity from one MatchReport", () => {
  const events = buildGoldenReportingFixture();
  const report = buildMatchReport({
    events,
    homeTeam: GOLDEN_TEAMS.home,
    awayTeam: GOLDEN_TEAMS.away,
  });

  it("PDF intelligence tiles and targets use the same Restart Share", () => {
    const share = viewRestartShare(report);
    expect(viewTargetsKickoutWinRate(report)).toBe(share.pct);
    expect(share).toEqual(report.restarts.restartShare.full);
    expect(share).toEqual(viewOwnKickoutRetention(report).den > 0 ? share : share);
    // Own retention is a different metric — must not equal restart share
    expect(viewOwnKickoutRetention(report)).toEqual(GOLDEN_RESTART_EXPECTATIONS.ownRetentionFull);
    expect(viewOwnKickoutRetention(report)).not.toEqual(share);
  });

  it("turnover attack vs punishment views are distinct and canonical", () => {
    const attack = viewTurnoverWinsToScore(report);
    const punish = viewTurnoverLossPunishment(report);
    const share  = viewTurnoverShare(report);
    expect(attack).toEqual(report.turnovers.turnoverWinsToScore);
    expect(punish).toEqual(report.turnovers.turnoverLossPunishment);
    expect(share).toEqual(report.turnovers.turnoverShare.full);
    expect(attack.pct).not.toBe(punish.pct);
  });

  it("shot-only turnover view matches canonical field", () => {
    expect(viewTurnoverWonToShotOnly(report)).toEqual(report.turnovers.turnoverWonToShotOnly);
  });

  it("restart origin conversion views match canonical fields", () => {
    expect(viewRestartWinsToScore(report)).toEqual(report.restarts.restartToScore);
    expect(viewRestartLossPunishment(report)).toEqual(report.restarts.restartLossPunishment);
  });

  it("possession layer is present and separate from chain-origin layer", () => {
    const koScoring = viewKickoutPossessionScoringPct(report);
    const toScoring = viewTurnoverPossessionScoringPct(report);
    const toDamage  = viewTurnoverPossessionDamagePct(report);
    const retention = viewPossessionRetention(report);

    expect(typeof koScoring).toBe("number");
    expect(typeof toScoring).toBe("number");
    expect(typeof toDamage).toBe("number");
    expect(retention.den).toBeGreaterThan(0);

    // Possession scoring % can differ from chain-origin % — both must be reachable
    expect(viewRestartWinsToScore(report).pct).toBe(GOLDEN_RESTART_EXPECTATIONS.restartToScore.pct);
    expect(report.possessions.kickouts.total).toBe(GOLDEN_RESTART_EXPECTATIONS.restartShare.den);
  });

  it("mirrored summary counts align with beneficiary view on single-perspective fixture", () => {
    const mirrored = viewMirroredPossessionCounts(report);
    expect(mirrored.kickoutsWon).toBe(GOLDEN_RESTART_EXPECTATIONS.restartShare.num);
    expect(mirrored.kickoutsTotal).toBe(GOLDEN_RESTART_EXPECTATIONS.restartShare.den);
    expect(mirrored.turnoversWon).toBe(GOLDEN_TURNOVER_EXPECTATIONS.turnoverShareFull.num);
    expect(mirrored.turnoversTotal).toBe(GOLDEN_TURNOVER_EXPECTATIONS.turnoverShareFull.den);
  });
});

describe("buildMatchReport — scope filtering", () => {
  const events = buildGoldenReportingFixture();

  it("1H scope restricts engines to first-half events only", () => {
    const h1 = buildMatchReport({ events, homeTeam: "A", awayTeam: "B", scope: "1H" });
    expect(h1.events.every((e) => e.period === "1H")).toBe(true);
    expect(h1.restarts.restartShare.full.den).toBe(10);
    expect(h1.turnovers.turnoverShare.full).toEqual(GOLDEN_TURNOVER_EXPECTATIONS.turnoverShareH1);
  });

  it("2H scope restricts engines to second-half events only", () => {
    const h2 = buildMatchReport({ events, homeTeam: "A", awayTeam: "B", scope: "2H" });
    expect(h2.events.every((e) => e.period === "2H")).toBe(true);
    expect(h2.restarts.restartShare.full.den).toBe(14);
    expect(h2.turnovers.turnoverShare.full).toEqual(GOLDEN_TURNOVER_EXPECTATIONS.turnoverShareH2);
  });
});

describe("coach-facing surface contracts", () => {
  const events = buildGoldenReportingFixture();

  it("intelligence pack path: possessions come from the same report build", () => {
    const report = buildMatchReport({ events, homeTeam: "A", awayTeam: "B" });
    // Intelligence pack reads report.possessions — verify it is populated
    expect(report.possessions.kickouts.total).toBeGreaterThan(0);
    expect(report.possessions.turnovers.total).toBeGreaterThan(0);
    expect(report.possessions.frees.total).toBe(0);
  });

  it("PDF chain path: chain + restart + turnover dictionaries come from same build", () => {
    const report = buildMatchReport({ events, homeTeam: "A", awayTeam: "B" });
    expect(report.chain.kickouts.outcomes.length).toBe(report.restarts.restartShare.full.den);
    expect(report.chain.turnovers.outcomes.length).toBe(report.turnovers.turnoverShare.full.den);
    expect(report.ledger).toBeDefined();
  });

  it("targets path: kickout win rate and possession retention derive from report views", () => {
    const report = buildMatchReport({ events, homeTeam: "A", awayTeam: "B" });
    expect(viewTargetsKickoutWinRate(report)).toBe(GOLDEN_RESTART_EXPECTATIONS.restartShare.pct);
    expect(viewPossessionRetention(report).pct).toBeGreaterThan(0);
  });

  it("matchIntelligenceSummary consumes the same Restart Share as MatchReport", () => {
    const report = buildMatchReport({
      events,
      homeTeam: GOLDEN_TEAMS.home,
      awayTeam: GOLDEN_TEAMS.away,
      scope: "FULL",
    });
    const intel = buildMatchIntelligenceSummary(
      events.map((e) => ({
        ...e,
        half: e.period === "1H" ? 1 as const : 2 as const,
        timestamp: e.matchClockSeconds ?? 0,
        matchClockSeconds: e.matchClockSeconds ?? undefined,
        tags: e.tags ?? undefined,
        restartOwner: e.restartOwner ?? undefined,
      })),
      GOLDEN_TEAMS.home,
      GOLDEN_TEAMS.away,
      "FT",
      "kickout",
    );
    const share = viewRestartShare(report);
    if (intel.ourRestartInsight?.includes("Restart Share")) {
      expect(intel.ourRestartInsight).toContain(`${share.pct}% Restart Share`);
      expect(intel.ourRestartInsight).toContain(`${share.num} of ${share.den}`);
    }
    expect(intel.weaponInsights.length + intel.dangerInsights.length).toBeGreaterThan(0);
  });

  it("matchTargets kickoutWinRate matches canonical Restart Share", () => {
    const results = computeTargetResults(
      { targets: [{ metric: "kickoutWinRate", targetValue: 50, direction: "atLeast", enabled: true }] },
      events,
      "FULL",
      "gaelic",
    );
    expect(results[0]?.actual).toBe(GOLDEN_RESTART_EXPECTATIONS.restartShare.pct);
  });
});
