/**
 * quickReviewSegmentBreakdown.fullTime.test.ts
 *
 * Regression coverage for the V1 Full Time Page 3 blocker: at FT, Quick
 * Review Page 3 must show BOTH halves' Early/Mid/Late comparison. The
 * builder produces one model per half; half = 1 (default) is unchanged,
 * half = 2 reads only second-half events (canonical segments 4/5/6, whose
 * boundaries deriveSegmentFromPeriodClock() applies to the half's own clock).
 */
import { describe, expect, it } from "vitest";
import type { LoggedMatchEvent } from "../../core/stats/saved-match";
import { deriveSegmentFromPeriodClock } from "../statsSegments";
import { buildQuickReviewSegmentBreakdown } from "./quickReviewSegmentBreakdown";

let nextId = 0;

function e(
  partial: Partial<LoggedMatchEvent> & Pick<LoggedMatchEvent, "kind" | "teamSide"> & { half?: 1 | 2 },
): LoggedMatchEvent {
  const half = partial.half ?? 1;
  const period = half === 2 ? "2H" : "1H";
  const matchClockSeconds = partial.matchClockSeconds ?? 0;
  return {
    id: `ft-${nextId++}`,
    kind: partial.kind,
    type: partial.kind,
    teamSide: partial.teamSide,
    nx: partial.nx ?? 0.5,
    ny: partial.ny ?? 0.5,
    x: (partial.nx ?? 0.5) * 100,
    y: (partial.ny ?? 0.5) * 100,
    half,
    period,
    timestamp: matchClockSeconds,
    matchClockSeconds,
    createdAt: matchClockSeconds,
    // Same canonical segmentation the live capture adapter uses.
    segment: deriveSegmentFromPeriodClock(period, matchClockSeconds),
    restartOwner: partial.restartOwner,
  } as LoggedMatchEvent;
}

const HOME = "Ballylanders";
const AWAY = "Opposition";

const sumHomeShots = (m: ReturnType<typeof buildQuickReviewSegmentBreakdown>) =>
  m.segments.reduce((s, seg) => s + seg.home.shots, 0);

describe("buildQuickReviewSegmentBreakdown — half selection", () => {
  it("default (Half Time call) is first half only and reports half = 1 with segments 1/2/3", () => {
    const events = [
      e({ kind: "SHOT", teamSide: "FOR", matchClockSeconds: 100 }),
      e({ kind: "SHOT", teamSide: "FOR", half: 2, matchClockSeconds: 100 }),
    ];
    const model = buildQuickReviewSegmentBreakdown(events, HOME, AWAY, "RIGHT");
    expect(model.half).toBe(1);
    expect(model.segments.map((s) => s.segment)).toEqual([1, 2, 3]);
    expect(model.segments.map((s) => s.label)).toEqual(["EARLY", "MID", "LATE"]);
    expect(sumHomeShots(model)).toBe(1);
  });

  it("half = 2 reports half = 2 with canonical segments 4/5/6 and Early/Mid/Late labels", () => {
    const model = buildQuickReviewSegmentBreakdown([], HOME, AWAY, "RIGHT", 2);
    expect(model.half).toBe(2);
    expect(model.segments.map((s) => s.segment)).toEqual([4, 5, 6]);
    expect(model.segments.map((s) => s.label)).toEqual(["EARLY", "MID", "LATE"]);
  });

  it("first-half events contribute only to the First Half model; second-half events only to the Second Half model", () => {
    const events = [
      e({ kind: "SHOT", teamSide: "FOR", matchClockSeconds: 100 }),
      e({ kind: "SHOT", teamSide: "FOR", matchClockSeconds: 700 }),
      e({ kind: "SHOT", teamSide: "FOR", half: 2, matchClockSeconds: 100 }),
      e({ kind: "SHOT", teamSide: "FOR", half: 2, matchClockSeconds: 200 }),
      e({ kind: "SHOT", teamSide: "FOR", half: 2, matchClockSeconds: 1300 }),
    ];
    const first = buildQuickReviewSegmentBreakdown(events, HOME, AWAY, "RIGHT", 1);
    const second = buildQuickReviewSegmentBreakdown(events, HOME, AWAY, "RIGHT", 2);
    expect(first.segments.map((s) => s.home.shots)).toEqual([1, 1, 0]);
    expect(second.segments.map((s) => s.home.shots)).toEqual([2, 0, 1]);
  });
});

describe("buildQuickReviewSegmentBreakdown — second-half segment boundaries (half-relative clock)", () => {
  it("applies 599/600/1199/1200 boundaries to the second half's own clock, independently of the first half", () => {
    const clocks = [0, 599, 600, 1199, 1200, 2400];
    const events = [
      // First half: one shot per boundary clock.
      ...clocks.map((c) => e({ kind: "SHOT", teamSide: "FOR", matchClockSeconds: c })),
      // Second half: a WIDE per boundary clock, so we can tell halves apart.
      ...clocks.map((c) => e({ kind: "WIDE", teamSide: "FOR", half: 2, matchClockSeconds: c })),
    ];
    const first = buildQuickReviewSegmentBreakdown(events, HOME, AWAY, "RIGHT", 1);
    const second = buildQuickReviewSegmentBreakdown(events, HOME, AWAY, "RIGHT", 2);
    expect(first.segments.map((s) => s.home.shots)).toEqual([2, 2, 2]);
    expect(first.segments.map((s) => s.home.wides)).toEqual([0, 0, 0]);
    expect(second.segments.map((s) => s.home.shots)).toEqual([2, 2, 2]);
    expect(second.segments.map((s) => s.home.wides)).toEqual([2, 2, 2]);
  });

  it("second-half events at small clock values are never classified into First Half buckets", () => {
    const events = [e({ kind: "GOAL", teamSide: "FOR", half: 2, matchClockSeconds: 30 })];
    const first = buildQuickReviewSegmentBreakdown(events, HOME, AWAY, "RIGHT", 1);
    const second = buildQuickReviewSegmentBreakdown(events, HOME, AWAY, "RIGHT", 2);
    expect(first.segments[0].home.score.total).toBe(0);
    expect(second.segments[0].home.score.text).toBe("1-00");
  });
});

describe("buildQuickReviewSegmentBreakdown — second-half metrics and team attribution", () => {
  const events: LoggedMatchEvent[] = [
    // First-half noise that must never leak into the Second Half model.
    e({ kind: "GOAL", teamSide: "FOR", matchClockSeconds: 10 }),
    e({ kind: "TURNOVER_WON", teamSide: "FOR", nx: 0.2, matchClockSeconds: 20 }),
    e({ kind: "KICKOUT_WON", teamSide: "FOR", restartOwner: "FOR", matchClockSeconds: 30 }),

    // Second half, Early (home).
    e({ kind: "GOAL", teamSide: "FOR", half: 2, matchClockSeconds: 60 }),
    e({ kind: "POINT", teamSide: "FOR", half: 2, matchClockSeconds: 70 }),
    e({ kind: "WIDE", teamSide: "FOR", half: 2, matchClockSeconds: 80 }),
    e({ kind: "FREE_SCORED", teamSide: "FOR", half: 2, matchClockSeconds: 90 }),
    // Second half, Mid (away).
    e({ kind: "POINT", teamSide: "OPP", half: 2, matchClockSeconds: 700 }),
    e({ kind: "WIDE", teamSide: "OPP", half: 2, matchClockSeconds: 710 }),
    e({ kind: "WIDE", teamSide: "OPP", half: 2, matchClockSeconds: 720 }),
    // Second half, Late turnovers. Home attacked RIGHT in 1H → LEFT in 2H,
    // so in 2H home's own half is physically the RIGHT end (high nx).
    e({ kind: "TURNOVER_WON", teamSide: "FOR", half: 2, nx: 0.8, matchClockSeconds: 1300 }), // home won, home own half
    e({ kind: "TURNOVER_LOST", teamSide: "OPP", half: 2, nx: 0.2, matchClockSeconds: 1310 }), // home won, home opp half
    e({ kind: "TURNOVER_LOST", teamSide: "FOR", half: 2, nx: 0.8, matchClockSeconds: 1320 }), // home lost, home own half
    // Second half, Late kickouts.
    e({ kind: "KICKOUT_WON", teamSide: "FOR", restartOwner: "FOR", half: 2, matchClockSeconds: 1400 }),
    e({ kind: "KICKOUT_CONCEDED", teamSide: "FOR", restartOwner: "FOR", half: 2, matchClockSeconds: 1410 }),
    e({ kind: "KICKOUT_WON", teamSide: "OPP", restartOwner: "OPP", half: 2, matchClockSeconds: 1420 }),
  ];
  const second = buildQuickReviewSegmentBreakdown(events, HOME, AWAY, "RIGHT", 2);
  const [early, mid, late] = second.segments;

  it("score, shots and wides are attributed to the correct team in the correct segment", () => {
    expect(early.home.score.text).toBe("1-02");
    expect(early.home.shots).toBe(4);
    expect(early.home.wides).toBe(1);
    expect(early.away.shots).toBe(0);

    expect(mid.away.score.text).toBe("0-01");
    expect(mid.away.shots).toBe(3);
    expect(mid.away.wides).toBe(2);
    expect(mid.home.shots).toBe(0);
  });

  it("turnovers won/lost and their own/opposition-half territory use 2H direction, for both teams", () => {
    expect(late.home.turnoversWon).toBe(2);
    expect(late.home.turnoversWonHalf).toEqual({ ownHalf: 1, oppositionHalf: 1 });
    expect(late.home.turnoversLost).toBe(1);
    expect(late.home.turnoversLostHalf).toEqual({ ownHalf: 1, oppositionHalf: 0 });

    // Mirror: away lost what home won, and won what home lost.
    expect(late.away.turnoversWon).toBe(1);
    expect(late.away.turnoversLost).toBe(2);
  });

  it("kickout retention per team uses second-half kickouts only", () => {
    expect(late.home.ownKORetained.text).toBe("1/2 (50%)");
    expect(late.home.oppKORetained.text).toBe("1/1 (100%)");
    expect(late.away.ownKORetained.text).toBe("1/1 (100%)");
    expect(late.away.oppKORetained.text).toBe("1/2 (50%)");
    expect(early.home.ownKORetained.text).toBe("—");
  });

  it("first-half values are unaffected by second-half events", () => {
    const first = buildQuickReviewSegmentBreakdown(events, HOME, AWAY, "RIGHT", 1);
    expect(first.segments[0].home.score.text).toBe("1-00");
    expect(first.segments[0].home.turnoversWon).toBe(1);
    expect(first.segments[0].home.ownKORetained.text).toBe("1/1 (100%)");
    expect(first.segments[2].home.turnoversWon).toBe(0);
  });
});

describe("buildQuickReviewSegmentBreakdown — Full Time with no second-half events", () => {
  it("returns a valid all-zero Second Half model that does not leak First Half values", () => {
    const events = [
      e({ kind: "GOAL", teamSide: "FOR", matchClockSeconds: 10 }),
      e({ kind: "TURNOVER_WON", teamSide: "OPP", matchClockSeconds: 700 }),
      e({ kind: "KICKOUT_WON", teamSide: "FOR", restartOwner: "FOR", matchClockSeconds: 1300 }),
    ];
    const second = buildQuickReviewSegmentBreakdown(events, HOME, AWAY, "RIGHT", 2);
    expect(second.segments).toHaveLength(3);
    for (const seg of second.segments) {
      for (const side of [seg.home, seg.away]) {
        expect(side.score.text).toBe("0-00");
        expect(side.shots).toBe(0);
        expect(side.wides).toBe(0);
        expect(side.turnoversWon).toBe(0);
        expect(side.turnoversLost).toBe(0);
        expect(side.turnoversWonHalf).toEqual({ ownHalf: 0, oppositionHalf: 0 });
        expect(side.turnoversLostHalf).toEqual({ ownHalf: 0, oppositionHalf: 0 });
        expect(side.ownKORetained.text).toBe("—");
        expect(side.oppKORetained.text).toBe("—");
      }
    }
  });
});
