/**
 * scoringBreakdownFormat.test.ts
 */

import { describe, expect, it } from "vitest";
import type { PitchSport } from "../../core/pitch/pitch-config";
import {
  breakdownFromScoreEvents,
  formatScoringBreakdown,
  scoringBreakdownTotal,
} from "./scoringBreakdownFormat";
import {
  fmtRestartOriginScoredFor,
  viewRestartOriginScoredFor,
} from "./scoringBreakdownViews";
import { restartOriginExplanation } from "../restarts/restartMetrics";
import { buildGoldenReportingFixture } from "./golden-fixture";
import { buildMatchReport } from "./matchReport";

describe("formatScoringBreakdown", () => {
  it("formats goals + points + two-pointer (mixed)", () => {
    expect(formatScoringBreakdown({ goals: 1, points: 6, twoPointers: 1 }))
      .toBe("1 Goal, 6 Points & 1 Two-Point score (11 pts)");
  });

  it("formats goals + points only", () => {
    expect(formatScoringBreakdown({ goals: 2, points: 3, twoPointers: 0 }))
      .toBe("2 Goals, 3 Points (9 pts)");
  });

  it("formats points + two-pointers only", () => {
    expect(formatScoringBreakdown({ goals: 0, points: 8, twoPointers: 2 }))
      .toBe("8 Points & 2 Two-Point scores (12 pts)");
  });

  it("formats points only", () => {
    expect(formatScoringBreakdown({ goals: 0, points: 5, twoPointers: 0 }))
      .toBe("5 Points (5 pts)");
  });

  it("singular forms", () => {
    expect(formatScoringBreakdown({ goals: 1, points: 1, twoPointers: 0 }))
      .toBe("1 Goal, 1 Point (4 pts)");
    expect(formatScoringBreakdown({ goals: 0, points: 0, twoPointers: 1 }))
      .toBe("1 Two-Point score (2 pts)");
  });

  it("omits zero categories", () => {
    expect(formatScoringBreakdown({ goals: 3, points: 0, twoPointers: 0 }))
      .toBe("3 Goals (9 pts)");
    expect(formatScoringBreakdown({ goals: 0, points: 0, twoPointers: 0 }))
      .toBe("0 pts");
  });

  it("never uses the word scores for point value", () => {
    const text = formatScoringBreakdown({ goals: 1, points: 2, twoPointers: 1 });
    expect(text).not.toMatch(/\(\d+ scores\)/);
    expect(text).toContain("pts");
  });
});

describe("breakdownFromScoreEvents", () => {
  it("classifies kinds correctly", () => {
    const events = [
      { id: "1", kind: "GOAL" as const, teamSide: "FOR" as const, period: "1H" as const, segment: 1 as const, nx: 0.5, ny: 0.5 },
      { id: "2", kind: "POINT" as const, teamSide: "FOR" as const, period: "1H" as const, segment: 1 as const, nx: 0.5, ny: 0.5 },
      { id: "3", kind: "TWO_POINTER" as const, teamSide: "FOR" as const, period: "1H" as const, segment: 1 as const, nx: 0.5, ny: 0.5 },
      { id: "4", kind: "FREE_SCORED" as const, teamSide: "FOR" as const, period: "1H" as const, segment: 1 as const, nx: 0.5, ny: 0.5 },
    ];
    const b = breakdownFromScoreEvents(events);
    expect(b.goals).toBe(1);
    expect(b.points).toBe(2);
    expect(b.twoPointers).toBe(1);
    expect(scoringBreakdownTotal(b)).toBe(7);
  });
});

describe("restartOriginExplanation", () => {
  const cases: Array<[PitchSport | undefined, string]> = [
    ["gaelic", "Scores that started from a kickout."],
    ["hurling", "Scores that started from a puckout."],
    ["camogie", "Scores that started from a puckout."],
  ];

  for (const [sport, expected] of cases) {
    it(`sport ${sport ?? "default"} → ${expected}`, () => {
      expect(restartOriginExplanation(sport)).toBe(expected);
    });
  }
});

describe("restart origin breakdown from fixture", () => {
  it("produces formatted breakdown not bare count", () => {
    const report = buildMatchReport({
      events: buildGoldenReportingFixture(),
      homeTeam: "Ballylanders",
      awayTeam: "Glenroe",
    });
    const formatted = fmtRestartOriginScoredFor(report.chain);
    const raw = viewRestartOriginScoredFor(report.chain);
    expect(scoringBreakdownTotal(raw)).toBeGreaterThan(0);
    expect(formatted).toMatch(/\(\d+ pts\)$/);
    expect(formatted).not.toMatch(/restart-origin score/i);
  });
});
