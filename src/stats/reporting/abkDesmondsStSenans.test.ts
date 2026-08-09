/**
 * abkDesmondsStSenans.test.ts
 *
 * Regression coverage for the second cross-game fixture (ABK Desmonds v St
 * Senans) used to validate the Full Review professionalisation pass across
 * a materially different match profile from Ballylanders v Fr. Caseys
 * (high-scoring, real kickout/turnover-origin chains present).
 *
 * Locks the exact reference numbers from the approved brief. Nothing in
 * chain-engine.ts, scoreLedger.ts, or scoringBreakdownViews.ts changed to
 * produce these — the fixture's event sequence was constructed so the
 * existing, unmodified engines compute them.
 */

import { describe, expect, it } from "vitest";
import { buildDirectScoringBreakdown } from "../ledger/scoreLedger";
import { buildMatchReport } from "./matchReport";
import { viewScoringPossessionOrigins } from "./scoringBreakdownViews";
import { scoringBreakdownTotal } from "./scoringBreakdownFormat";
import {
  ABK_STSENANS_TEAMS,
  buildAbkDesmondsStSenansFixture,
} from "./abk-desmonds-stsenans-fixture";

describe("ABK Desmonds v St Senans — locked reference numbers", () => {
  const events = buildAbkDesmondsStSenansFixture();
  const report = buildMatchReport({
    events,
    homeTeam: ABK_STSENANS_TEAMS.home,
    awayTeam: ABK_STSENANS_TEAMS.away,
  });

  it("final score: ABK Desmonds 2-15 (21), St Senans 2-08 (14)", () => {
    const forScores = events.filter((e) => e.teamSide === "FOR" && (e.kind === "GOAL" || e.kind === "POINT"));
    const oppScores = events.filter((e) => e.teamSide === "OPP" && (e.kind === "GOAL" || e.kind === "POINT"));
    const forGoals = forScores.filter((e) => e.kind === "GOAL").length;
    const forPoints = forScores.filter((e) => e.kind === "POINT").length;
    const oppGoals = oppScores.filter((e) => e.kind === "GOAL").length;
    const oppPoints = oppScores.filter((e) => e.kind === "POINT").length;

    expect(forGoals).toBe(2);
    expect(forPoints).toBe(15);
    expect(forGoals * 3 + forPoints).toBe(21);
    expect(oppGoals).toBe(2);
    expect(oppPoints).toBe(8);
    expect(oppGoals * 3 + oppPoints).toBe(14);
  });

  it("shooting: ABK 17/22 (77%), St Senans 10/22 (45%)", () => {
    const forShots = events.filter((e) => e.teamSide === "FOR" && ["GOAL", "POINT", "WIDE"].includes(e.kind));
    const oppShots = events.filter((e) => e.teamSide === "OPP" && ["GOAL", "POINT", "WIDE"].includes(e.kind));
    const forScores = forShots.filter((e) => e.kind !== "WIDE");
    const oppScores = oppShots.filter((e) => e.kind !== "WIDE");

    expect(forScores.length).toBe(17);
    expect(forShots.length).toBe(22);
    expect(Math.round((forScores.length / forShots.length) * 100)).toBe(77);

    expect(oppScores.length).toBe(10);
    expect(oppShots.length).toBe(22);
    expect(Math.round((oppScores.length / oppShots.length) * 100)).toBe(45);
  });

  it("Scoring Breakdown (Part 1, direct classification): ABK 2-12 general play + 0-03 placed; St Senans 2-07 general play + 0-01 placed", () => {
    const breakdown = buildDirectScoringBreakdown(events);
    const fromPlay = breakdown.rows.find((r) => r.id === "FROM_PLAY")!;
    const placed = breakdown.rows.find((r) => r.id === "PLACED")!;

    expect(fromPlay.us.goals).toBe(2);
    expect(fromPlay.us.value).toBe(18); // 2-12
    expect(placed.us.goals).toBe(0);
    expect(placed.us.value).toBe(3); // 0-03

    expect(fromPlay.them.goals).toBe(2);
    expect(fromPlay.them.value).toBe(13); // 2-07
    expect(placed.them.goals).toBe(0);
    expect(placed.them.value).toBe(1); // 0-01

    // Reconciliation: direct rows sum exactly to the final score, every
    // score counted exactly once.
    expect(fromPlay.us.value + placed.us.value).toBe(21);
    expect(fromPlay.them.value + placed.them.value).toBe(14);
  });

  it("Game Origin (Part 3): ABK restart-origin 0-07, turnover-origin 2-05; St Senans restart-origin 1-02, turnover-origin 1-04", () => {
    const forOrigins = viewScoringPossessionOrigins(report, "FOR");
    const oppOrigins = viewScoringPossessionOrigins(report, "OPP");

    expect(forOrigins.restartOrigin.goals).toBe(0);
    expect(forOrigins.restartOrigin.points).toBe(7);
    expect(scoringBreakdownTotal(forOrigins.restartOrigin)).toBe(7);

    expect(forOrigins.turnoverOrigin.goals).toBe(2);
    expect(forOrigins.turnoverOrigin.points).toBe(5);
    expect(scoringBreakdownTotal(forOrigins.turnoverOrigin)).toBe(11);

    expect(oppOrigins.restartOrigin.goals).toBe(1);
    expect(oppOrigins.restartOrigin.points).toBe(2);
    expect(scoringBreakdownTotal(oppOrigins.restartOrigin)).toBe(5);

    expect(oppOrigins.turnoverOrigin.goals).toBe(1);
    expect(oppOrigins.turnoverOrigin.points).toBe(4);
    expect(scoringBreakdownTotal(oppOrigins.turnoverOrigin)).toBe(7);
  });

  it("origin figures never double-count: restart + turnover origin scores never exceed the team's total scores", () => {
    for (const team of ["FOR", "OPP"] as const) {
      const origins = viewScoringPossessionOrigins(report, team);
      const originEvents =
        origins.restartOrigin.goals + origins.restartOrigin.points +
        origins.turnoverOrigin.goals + origins.turnoverOrigin.points;
      const teamScoreEvents = events.filter(
        (e) => e.teamSide === team && (e.kind === "GOAL" || e.kind === "POINT"),
      ).length;
      expect(originEvents).toBeLessThanOrEqual(teamScoreEvents);
    }
  });
});
