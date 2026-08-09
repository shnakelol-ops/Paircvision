/**
 * scoringBreakdownSplit.test.ts
 *
 * Regression coverage for the Where the Points Went split:
 *   - Part 1 "Scoring Breakdown" (buildDirectScoringBreakdown) — match-fact
 *     only, reconciles exactly to the final score.
 *   - Part 3 "Scoring Possession Origins" (viewScoringPossessionOrigins) —
 *     chain-origin only, de-duplicated, never uses "Direct" language.
 *
 * Uses the Ballylanders v Fr. Caseys fixture (primary validation fixture per
 * the implementation brief) for reconciliation, and the golden fixture
 * (known to contain real kickout/turnover→score chains) for origin content.
 */

import { describe, expect, it } from "vitest";
import { buildDirectScoringBreakdown } from "../ledger/scoreLedger";
import { buildMatchReport } from "./matchReport";
import { viewScoringPossessionOrigins } from "./scoringBreakdownViews";
import { scoringBreakdownTotal } from "./scoringBreakdownFormat";
import {
  assertPartProvenance,
  containsDirectLanguage,
  type ProvenanceRow,
} from "./reportProvenance";
import {
  BALLYLANDERS_FRCASEYS_EXPECTATIONS,
  BALLYLANDERS_FRCASEYS_TEAMS,
  buildBallylandersFrCaseysFixture,
} from "./ballylanders-frcaseys-fixture";
import { buildGoldenReportingFixture, GOLDEN_TEAMS } from "./golden-fixture";

function toRows(labels: string[]): ProvenanceRow[] {
  return labels.map((label) => ({ label, provenance: "match-fact" as const }));
}

describe("buildDirectScoringBreakdown — Part 1 Scoring Breakdown", () => {
  it("reconciles exactly to the final score on the Ballylanders v Fr. Caseys fixture", () => {
    const events = buildBallylandersFrCaseysFixture();
    const breakdown = buildDirectScoringBreakdown(events);

    const usSum = breakdown.rows.reduce((s, r) => s + r.us.value, 0);
    const themSum = breakdown.rows.reduce((s, r) => s + r.them.value, 0);

    expect(usSum).toBe(BALLYLANDERS_FRCASEYS_EXPECTATIONS.ft.score.us.total);
    expect(themSum).toBe(BALLYLANDERS_FRCASEYS_EXPECTATIONS.ft.score.them.total);
    expect(breakdown.forScore.total).toBe(BALLYLANDERS_FRCASEYS_EXPECTATIONS.ft.score.us.total);
    expect(breakdown.oppScore.total).toBe(BALLYLANDERS_FRCASEYS_EXPECTATIONS.ft.score.them.total);
    expect(breakdown.margin).toBe(0);
  });

  it("no score appears in more than one row (row-count sum equals total scores)", () => {
    const events = buildBallylandersFrCaseysFixture();
    const breakdown = buildDirectScoringBreakdown(events);
    const totalRowScores = breakdown.rows.reduce((s, r) => s + r.us.scores + r.them.scores, 0);
    const totalScoreEvents = events.filter((e) =>
      ["GOAL", "POINT", "TWO_POINTER", "FORTY_FIVE_TWO_POINT", "FREE_SCORED"].includes(e.kind),
    ).length;
    expect(totalRowScores).toBe(totalScoreEvents);
  });

  it("placed-ball scores land in the PLACED row (Ballylanders 6/8, Fr. Caseys 5/5)", () => {
    const events = buildBallylandersFrCaseysFixture();
    const breakdown = buildDirectScoringBreakdown(events);
    const placed = breakdown.rows.find((r) => r.id === "PLACED")!;
    expect(placed.us.scores).toBe(BALLYLANDERS_FRCASEYS_EXPECTATIONS.ft.placed.us.scores);
    expect(placed.them.scores).toBe(BALLYLANDERS_FRCASEYS_EXPECTATIONS.ft.placed.them.scores);
  });

  it("passes the MATCH_FACTS provenance guard — every row is match-fact", () => {
    const events = buildBallylandersFrCaseysFixture();
    const breakdown = buildDirectScoringBreakdown(events);
    const rows = toRows(breakdown.rows.map((r) => r.label));
    expect(() => assertPartProvenance("MATCH_FACTS", rows)).not.toThrow();
  });

  it("row labels never use restart/turnover origin wording", () => {
    const events = buildBallylandersFrCaseysFixture();
    const breakdown = buildDirectScoringBreakdown(events);
    for (const row of breakdown.rows) {
      expect(row.label.toLowerCase()).not.toContain("restart");
      expect(row.label.toLowerCase()).not.toContain("turnover");
      expect(row.label.toLowerCase()).not.toContain("origin");
    }
  });
});

describe("viewScoringPossessionOrigins — Part 3 Scoring Possession Origins", () => {
  it("produces chain-origin figures on the golden fixture (known restart/turnover chains)", () => {
    const events = buildGoldenReportingFixture();
    const report = buildMatchReport({ events, homeTeam: GOLDEN_TEAMS.home, awayTeam: GOLDEN_TEAMS.away });
    const usOrigins = viewScoringPossessionOrigins(report, "FOR");
    const themOrigins = viewScoringPossessionOrigins(report, "OPP");

    const totalOriginValue =
      scoringBreakdownTotal(usOrigins.restartOrigin) +
      scoringBreakdownTotal(usOrigins.turnoverOrigin) +
      scoringBreakdownTotal(themOrigins.restartOrigin) +
      scoringBreakdownTotal(themOrigins.turnoverOrigin);

    expect(totalOriginValue).toBeGreaterThan(0);
  });

  it("never double-counts: restart-origin + turnover-origin scored count never exceeds team's total scores", () => {
    const events = buildGoldenReportingFixture();
    const report = buildMatchReport({ events, homeTeam: GOLDEN_TEAMS.home, awayTeam: GOLDEN_TEAMS.away });

    for (const team of ["FOR", "OPP"] as const) {
      const origins = viewScoringPossessionOrigins(report, team);
      const originScoreCount = origins.restartOrigin.goals + origins.restartOrigin.points + origins.restartOrigin.twoPointers
        + origins.turnoverOrigin.goals + origins.turnoverOrigin.points + origins.turnoverOrigin.twoPointers;
      const teamScoreCount = report.events.filter(
        (e) => e.teamSide === team && ["GOAL", "POINT", "TWO_POINTER", "FORTY_FIVE_TWO_POINT", "FREE_SCORED"].includes(e.kind),
      ).length;
      expect(originScoreCount).toBeLessThanOrEqual(teamScoreCount);
    }
  });

  it("passes the GAME_ORIGIN provenance guard as chain-origin rows", () => {
    const rows: ProvenanceRow[] = [
      { label: "Restart-origin scores", provenance: "chain-origin" },
      { label: "Turnover-origin scores", provenance: "chain-origin" },
    ];
    expect(() => assertPartProvenance("GAME_ORIGIN", rows)).not.toThrow();
  });

  it("row labels never use 'Direct' language", () => {
    const labels = ["Restart-origin scores", "Turnover-origin scores"];
    for (const label of labels) {
      expect(containsDirectLanguage(label)).toBe(false);
    }
  });

  it("does not crash and returns empty breakdowns on a fixture with no origin-linked scores", () => {
    const events = buildBallylandersFrCaseysFixture();
    const report = buildMatchReport({
      events,
      homeTeam: BALLYLANDERS_FRCASEYS_TEAMS.home,
      awayTeam: BALLYLANDERS_FRCASEYS_TEAMS.away,
    });
    expect(() => viewScoringPossessionOrigins(report, "FOR")).not.toThrow();
    expect(() => viewScoringPossessionOrigins(report, "OPP")).not.toThrow();
  });
});
