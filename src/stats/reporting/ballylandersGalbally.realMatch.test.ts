/**
 * ballylandersGalbally.realMatch.test.ts
 *
 * Regression tests against the first REAL event-log fixture (Ballylanders v
 * Galbally, Pro Tagger, anonymised). Locks the match's verified headline
 * figures — so a later change to an engine shows up here — and the Stage 1
 * intelligence-accuracy sentences generated from it.
 */

import { describe, expect, it } from "vitest";
import { buildMatchReport } from "./matchReport";
import { loadBallylandersGalballyFixture } from "./ballylanders-galbally-real-fixture";
import { deriveReviewPrompts } from "../chains/review-prompts";
import {
  freeRulesMeasurable,
  halfCoverageComparable,
  measureHalfCoverage,
  turnoverRulesMeasurable,
} from "../chains/evidence-gates";
import type { ChainRuleId } from "../chains/chain-types";

const fixture = loadBallylandersGalballyFixture();
const report = buildMatchReport({ events: fixture.events, homeTeam: fixture.homeTeam, awayTeam: fixture.awayTeam });

describe("Ballylanders v Galbally real fixture — verified headline figures", () => {
  it("matches the scoreline and event count of the captured match", () => {
    expect(fixture.scorelineSnapshot).toBe("Ballylanders 2-08 (14) v Galbally 0-10 (10)");
    expect(fixture.events).toHaveLength(100);
    expect(report.ledger.forScore).toEqual({ goals: 2, points: 8, total: 14 });
    expect(report.ledger.oppScore).toEqual({ goals: 0, points: 10, total: 10 });
  });

  it("matches the report's restart and turnover totals", () => {
    expect([report.chain.kickouts.won, report.chain.kickouts.total]).toEqual([14, 24]);
    expect([report.chain.turnovers.won, report.chain.turnovers.lost]).toEqual([10, 10]);
    expect(report.chain.turnovers.wonToShot).toBe(4);
  });

  it("matches the report's chain table (rule matches per side)", () => {
    const table = (side: "FOR" | "OPP") =>
      (["KICKOUT_TO_SCORE", "KICKOUT_LOST_TO_SCORE_AGAINST", "TURNOVER_TO_SCORE", "TURNOVER_TO_SHOT", "FREE_WON_TO_GOAL"] as ChainRuleId[])
        .map((r) => (report.chain.byRule[r] ?? []).filter((c) => c.teamSide === side).length);
    expect(table("FOR")).toEqual([6, 1, 4, 5, 1]);
    expect(table("OPP")).toEqual([3, 2, 0, 0, 0]);
  });

  it("logged every turnover from Ballylanders' side, so Galbally's turnover rule counts are unmeasurable", () => {
    expect(fixture.events.filter((e) => e.kind.startsWith("TURNOVER_")).every((e) => e.teamSide === "FOR")).toBe(true);
    expect(turnoverRulesMeasurable(report.chain, "FOR")).toBe(true);
    expect(turnoverRulesMeasurable(report.chain, "OPP")).toBe(false);
  });

  it("logged Galbally's frees as Ballylanders' concessions, so Galbally's free rule count is unmeasurable", () => {
    expect(freeRulesMeasurable(report.events, "FOR")).toBe(true);
    expect(freeRulesMeasurable(report.events, "OPP")).toBe(false);
  });
});

describe("Ballylanders v Galbally real fixture — logging coverage", () => {
  const coverage = measureHalfCoverage(report.events, fixture.halfDurationMinutes);

  it("records that only 0:14–8:07 of the first half and 0:14–15:29 of the second were logged", () => {
    expect(coverage.halfDurationSeconds).toBe(35 * 60);
    expect([coverage.halves["1H"].firstClock, coverage.halves["1H"].lastClock]).toEqual([14, 487]);
    expect([coverage.halves["2H"].firstClock, coverage.halves["2H"].lastClock]).toEqual([14, 929]);
  });

  it("does not allow half-time comparisons", () => {
    expect(halfCoverageComparable(coverage)).toEqual({ comparable: false, reason: "1H: logging stopped early" });
  });
});

describe("Ballylanders v Galbally real fixture — Match Markers sentences", () => {
  const coverage = measureHalfCoverage(report.events, fixture.halfDurationMinutes);
  const texts = deriveReviewPrompts(report.chain, fixture.homeTeam, fixture.awayTeam, "gaelic", coverage).map((p) => p.text);

  it("produces exactly the verified observations", () => {
    expect(texts).toEqual([
      // Authoritative kickout-origin definition (chains/kickout-phase.ts):
      // the possession won from a kickout ends when the ball changes hands.
      // Ballylanders scored in 4 of their 14 kickout-won possessions (vg-017
      // goal, vg-023 point, and points from frees they won inside the
      // possession after vg-036 and vg-071), not 7. vg-004 was intercepted
      // 9 s after the kickout; after vg-057 Ballylanders shot short and had
      // to win the ball back with a tackle; after vg-078 the free went to
      // Galbally. Galbally: 5 of 10. Verified independently against the
      // stored log (audit/event-stats-red-repairs/scripts/diagnostics/
      // real-kickouts.mjs, no src/ imports).
      "Ballylanders held 58% Restart Share (14 of 24) — 29% of won kickouts produced restart-origin point value (1 Goal, 3 Points (6 pts)).",
      "29% of Ballylanders's kickout wins produced restart-origin point value; 50% of their losses produced restart-origin point value for Galbally.",
      // F-03 repair: Galbally scored from 3 of their 10 turnover wins (30%),
      // not 5. The other two scores were made after Ballylanders had won the
      // ball back inside the 60 s window, so they belong to a later
      // possession — verified independently against the stored log. At 30%
      // the separate "Galbally won against Ballylanders" sentence no longer
      // meets its reporting threshold.
      "Ballylanders won 50% of turnovers (10 of 20); 30% of wins produced turnover-origin point value, against 30% for Galbally.",
      "Ballylanders won 10 turnovers; 6 did not lead to a shot.",
    ]);
  });

  it("no longer prints the misattributed or duplicated sentences of the original report", () => {
    for (const removed of [
      "Ballylanders won 77% of all possession sequences (17 of 22).",
      "Ballylanders had more kickout-to-score chains (9) than turnover-to-score chains (4) — both are chain rule matches, not scoring totals.",
      "50% of Ballylanders's won kickouts produced restart-origin point value (2 Goals, 4 Points & 1 Two-Point score (12 pts) from 14 wins).",
      "Ballylanders won 5 turnovers that didn't lead to a shot.",
    ]) {
      expect(texts).not.toContain(removed);
    }
  });
});
