// Regression coverage for the live-header / canonical-report score mismatch:
// computeScoreSide (Event Stats live header) used a local, independently
// maintained allowlist of scoring kinds that never included FREE_SCORED,
// while the canonical report layer (scoreLedger.ts's SCORE_KINDS, consumed
// by teamStatsViews.ts, chain-engine.ts, possession-outcomes-engine.ts) has
// always included it. Harmless while pro-tagger live capture only ever
// emitted POINT/GOAL + a "Free" tag for scored frees, but ProTaggerReviewScreen
// can reclassify an event to the literal FREE_SCORED kind — after which the
// live header would silently undercount by one score while every
// report-derived view (including Quick Review's Page 1) counted correctly.
//
// computeScoreSide now reads SCORE_KINDS/scoreValue from scoreLedger.ts
// directly instead of maintaining a second allowlist, so it structurally
// cannot drift from the canonical report score again.
import { describe, it, expect } from "vitest";
import { computeScoreSide } from "./pro-tagger-score";
import { buildMatchReport } from "../stats/reporting/matchReport";
import type { LoggedMatchEvent } from "../core/stats/saved-match";
import type { MatchEventKind } from "../core/stats/stats-event-model";

let seq = 0;
function ev(
  kind: MatchEventKind,
  teamSide: "FOR" | "OPP",
  period: "1H" | "2H" = "1H",
): LoggedMatchEvent {
  seq += 1;
  return {
    id: `e${seq}`,
    kind,
    type: kind,
    teamSide,
    nx: 0.5,
    ny: 0.5,
    x: 0.5,
    y: 0.5,
    half: period === "1H" ? 1 : 2,
    period,
    segment: period === "1H" ? 1 : 4,
    timestamp: seq,
    matchClockSeconds: seq,
    createdAt: seq,
  };
}

describe("Event Stats (Pro Tagger): computeScoreSide canonical score-kind consistency", () => {
  it("counts a normal POINT", () => {
    const events = [ev("POINT", "FOR")];
    expect(computeScoreSide(events, "FOR")).toEqual({ goals: 0, points: 1, total: 1 });
  });

  it("counts a GOAL as 3 total but tracked separately from points", () => {
    const events = [ev("GOAL", "FOR")];
    expect(computeScoreSide(events, "FOR")).toEqual({ goals: 1, points: 0, total: 3 });
  });

  it("counts TWO_POINTER and FORTY_FIVE_TWO_POINT as 2 points each", () => {
    const events = [ev("TWO_POINTER", "FOR"), ev("FORTY_FIVE_TWO_POINT", "FOR")];
    expect(computeScoreSide(events, "FOR")).toEqual({ goals: 0, points: 4, total: 4 });
  });

  it("counts FREE_SCORED as a 1-point score (the previously-missing case)", () => {
    const events = [ev("FREE_SCORED", "FOR")];
    expect(computeScoreSide(events, "FOR")).toEqual({ goals: 0, points: 1, total: 1 });
  });

  it("does not count unrelated event kinds (WIDE, FREE_MISSED, KICKOUT_WON, TURNOVER_WON, FREE_WON, FREE_CONCEDED)", () => {
    const events = [
      ev("WIDE", "FOR"),
      ev("FREE_MISSED", "FOR"),
      ev("KICKOUT_WON", "FOR"),
      ev("TURNOVER_WON", "FOR"),
      ev("FREE_WON", "FOR"),
      ev("FREE_CONCEDED", "FOR"),
    ];
    expect(computeScoreSide(events, "FOR")).toEqual({ goals: 0, points: 0, total: 0 });
  });

  it("only counts events for the requested side", () => {
    const events = [ev("GOAL", "FOR"), ev("POINT", "OPP"), ev("POINT", "OPP")];
    expect(computeScoreSide(events, "FOR")).toEqual({ goals: 1, points: 0, total: 3 });
    expect(computeScoreSide(events, "OPP")).toEqual({ goals: 0, points: 2, total: 2 });
  });

  it("reconciles exactly with the canonical report-layer score (scoreLedger.forScore/oppScore) on a mixed fixture, including a reclassified FREE_SCORED event", () => {
    const events: LoggedMatchEvent[] = [
      ev("GOAL", "FOR"),
      ev("POINT", "FOR"),
      ev("TWO_POINTER", "FOR"),
      ev("FREE_SCORED", "FOR"), // simulates a review-screen reclassification
      ev("WIDE", "FOR"),
      ev("KICKOUT_WON", "FOR"),
      ev("GOAL", "OPP"),
      ev("POINT", "OPP"),
      ev("FORTY_FIVE_TWO_POINT", "OPP"),
      ev("FREE_MISSED", "OPP"),
      ev("TURNOVER_WON", "OPP"),
    ];

    const headerFor = computeScoreSide(events, "FOR");
    const headerOpp = computeScoreSide(events, "OPP");

    const report = buildMatchReport({
      events,
      scope: "FULL",
      homeTeam: "Home",
      awayTeam: "Away",
    });

    expect(headerFor).toEqual(report.ledger.forScore);
    expect(headerOpp).toEqual(report.ledger.oppScore);

    // Sanity: the reconciliation is meaningful, not vacuously 0-0.
    expect(headerFor.total).toBeGreaterThan(0);
    expect(headerOpp.total).toBeGreaterThan(0);
  });
});
