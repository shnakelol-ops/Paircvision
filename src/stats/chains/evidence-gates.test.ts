import { describe, expect, it } from "vitest";
import { analyseChains } from "./chain-engine";
import type { ChainableEvent } from "./chain-types";
import type { MatchEventKind, MatchEventPeriod, MatchEventSegment } from "../../core/stats/stats-event-model";
import {
  HALF_COMPARISON_LIMITS,
  formatRunWindow,
  freeRulesMeasurable,
  halfComparisonVerdict,
  halfCoverageComparable,
  measureHalfCoverage,
  turnoverRulesMeasurable,
  type HalfCoverage,
} from "./evidence-gates";

let nextId = 0;
function ev(
  kind: MatchEventKind,
  teamSide: "FOR" | "OPP",
  period: MatchEventPeriod,
  clock: number | null,
): ChainableEvent {
  return {
    id: `gate-${nextId++}`,
    kind,
    teamSide,
    period,
    segment: (period === "1H" ? 1 : 4) as MatchEventSegment,
    matchClockSeconds: clock,
    nx: 0.5,
    ny: 0.5,
  };
}

/** `count` events spread evenly from `from` to `to` seconds in one half. */
function spread(period: MatchEventPeriod, count: number, from: number, to: number): ChainableEvent[] {
  const step = count > 1 ? (to - from) / (count - 1) : 0;
  return Array.from({ length: count }, (_, i) => ev("FREE_WON", "FOR", period, Math.round(from + i * step)));
}

/** A 35-minute match logged evenly from 1:00 to 34:00 in both halves. */
function fullyLogged(): ChainableEvent[] {
  return [...spread("1H", 30, 60, 2040), ...spread("2H", 30, 60, 2040)];
}

const FULL: HalfCoverage = measureHalfCoverage(fullyLogged(), 35);

describe("halfCoverageComparable", () => {
  it("accepts two fully logged halves", () => {
    expect(halfCoverageComparable(FULL)).toEqual({ comparable: true });
  });

  it("rejects missing coverage information", () => {
    expect(halfCoverageComparable(null).comparable).toBe(false);
    expect(halfCoverageComparable(undefined).comparable).toBe(false);
  });

  it("rejects an unknown scheduled half length (Match Stats saves none)", () => {
    const v = halfCoverageComparable(measureHalfCoverage(fullyLogged(), undefined));
    expect(v).toEqual({ comparable: false, reason: "scheduled half length unknown" });
  });

  it("rejects a half whose logging started late", () => {
    const events = [...spread("1H", 30, 400, 2040), ...spread("2H", 30, 60, 2040)];
    expect(halfCoverageComparable(measureHalfCoverage(events, 35))).toEqual({ comparable: false, reason: "1H: logging started late" });
  });

  it("rejects a half whose logging stopped early (Ballylanders v Galbally shape)", () => {
    // 1H logged 0:14–8:07 of 35 minutes.
    const events = [...spread("1H", 30, 14, 487), ...spread("2H", 30, 60, 2040)];
    expect(halfCoverageComparable(measureHalfCoverage(events, 35))).toEqual({ comparable: false, reason: "1H: logging stopped early" });
  });

  it("rejects a long silent gap inside a half", () => {
    const events = [
      ...spread("1H", 15, 60, 700), ...spread("1H", 15, 700 + HALF_COMPARISON_LIMITS.maxGapSeconds + 60, 2040),
      ...spread("2H", 30, 60, 2040),
    ];
    expect(halfCoverageComparable(measureHalfCoverage(events, 35))).toEqual({ comparable: false, reason: "1H: long gap between logged events" });
  });

  it("rejects too few events in a half", () => {
    const events = [...spread("1H", 30, 60, 2040), ...spread("2H", 19, 60, 2040)];
    expect(halfCoverageComparable(measureHalfCoverage(events, 35))).toEqual({ comparable: false, reason: "2H: too few events" });
  });

  it("rejects events without a match clock", () => {
    const events = [...fullyLogged(), ev("POINT", "FOR", "2H", null)];
    expect(halfCoverageComparable(measureHalfCoverage(events, 35))).toEqual({ comparable: false, reason: "2H: events without a match clock" });
  });

  it("rejects recording windows that are not comparable", () => {
    // 2H runs well into stoppage time; 1H window is under 80% of it.
    const events = [...spread("1H", 30, 240, 1800), ...spread("2H", 40, 10, 2700)];
    expect(halfCoverageComparable(measureHalfCoverage(events, 35))).toEqual({ comparable: false, reason: "recording windows not comparable" });
  });

  it("ignores virtual instant-score markers", () => {
    const marker: ChainableEvent = { ...ev("POINT", "FOR", "1H", null), id: "x-instant-score-1" };
    expect(halfCoverageComparable(measureHalfCoverage([...fullyLogged(), marker], 35))).toEqual({ comparable: true });
  });
});

describe("halfComparisonVerdict", () => {
  it("Rathkeale v Oola Restart Share 9/20 → 9/14 is reported as a rise", () => {
    expect(halfComparisonVerdict(FULL, { total: 20, successes: 9 }, { total: 14, successes: 9 }, 12))
      .toEqual({ show: true, direction: "UP", h1Pct: 45, h2Pct: 64 });
  });

  it("reports a fall as readily as a rise", () => {
    expect(halfComparisonVerdict(FULL, { total: 14, successes: 9 }, { total: 20, successes: 9 }, 12))
      .toEqual({ show: true, direction: "DOWN", h1Pct: 64, h2Pct: 45 });
  });

  it("Rathkeale v Oola turnover conversion 4/9 → 2/8 does not survive moving one event", () => {
    expect(halfComparisonVerdict(FULL, { total: 9, successes: 4 }, { total: 8, successes: 2 }, 15))
      .toEqual({ show: false, reason: "difference does not survive moving one event" });
  });

  it("Ballylanders v Galbally Restart Share 5/10 → 9/14 does not survive moving one event", () => {
    expect(halfComparisonVerdict(FULL, { total: 10, successes: 5 }, { total: 14, successes: 9 }, 12))
      .toEqual({ show: false, reason: "difference does not survive moving one event" });
  });

  it("needs at least six events behind the rate in each half", () => {
    expect(halfComparisonVerdict(FULL, { total: 5, successes: 0 }, { total: 20, successes: 20 }, 12))
      .toEqual({ show: false, reason: "too few events behind the rate" });
  });

  it("ignores differences below the threshold", () => {
    expect(halfComparisonVerdict(FULL, { total: 20, successes: 10 }, { total: 20, successes: 12 }, 12))
      .toEqual({ show: false, reason: "difference below threshold" });
  });

  it("suppresses every comparison when coverage cannot be established", () => {
    expect(halfComparisonVerdict(null, { total: 20, successes: 2 }, { total: 20, successes: 18 }, 12).show).toBe(false);
  });
});

describe("turnoverRulesMeasurable", () => {
  it("a side is unmeasurable when any of its turnover wins was logged as the other team's loss", () => {
    const events = [ev("TURNOVER_WON", "FOR", "1H", 100), ev("TURNOVER_LOST", "FOR", "1H", 300)];
    const analysis = analyseChains(events);
    expect(turnoverRulesMeasurable(analysis, "FOR")).toBe(true);
    expect(turnoverRulesMeasurable(analysis, "OPP")).toBe(false);
  });

  it("both sides are measurable when every win is logged by the winning side", () => {
    const events = [ev("TURNOVER_WON", "FOR", "1H", 100), ev("TURNOVER_WON", "OPP", "1H", 300)];
    const analysis = analyseChains(events);
    expect(turnoverRulesMeasurable(analysis, "FOR")).toBe(true);
    expect(turnoverRulesMeasurable(analysis, "OPP")).toBe(true);
  });
});

describe("freeRulesMeasurable", () => {
  it("a side is unmeasurable when any free it won was logged as the other team's FREE_CONCEDED", () => {
    const events = [ev("FREE_WON", "FOR", "1H", 100), ev("FREE_CONCEDED", "FOR", "1H", 300)];
    expect(freeRulesMeasurable(events, "FOR")).toBe(true);
    expect(freeRulesMeasurable(events, "OPP")).toBe(false);
  });
});

describe("formatRunWindow", () => {
  it("labels a run inside one half", () => {
    const analysis = analyseChains([ev("POINT", "FOR", "1H", 330), ev("POINT", "FOR", "1H", 430)]);
    expect(formatRunWindow(analysis.scoringRuns.runs[0])).toBe("1H 5'–7'");
  });

  it("labels each end of a run that continues past half-time in its own half", () => {
    const analysis = analyseChains([
      ev("POINT", "OPP", "1H", 1980), ev("POINT", "OPP", "1H", 2000), ev("POINT", "OPP", "2H", 30),
    ]);
    expect(formatRunWindow(analysis.scoringRuns.runs[0])).toBe("1H 33'–2H 0'");
  });

  it("labels a run within one minute with a single minute", () => {
    const analysis = analyseChains([ev("POINT", "FOR", "2H", 540), ev("POINT", "FOR", "2H", 560)]);
    expect(formatRunWindow(analysis.scoringRuns.runs[0])).toBe("2H 9'");
  });
});
