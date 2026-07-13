import { describe, expect, it } from "vitest";
import { computeSegmentResults, countSegmentsWonBy } from "./segmentResults";
import type { SegmentResultEvent } from "./segmentResults";

function score(kind: SegmentResultEvent["kind"], teamSide: "FOR" | "OPP", segment: 1 | 2 | 3 | 4 | 5 | 6): SegmentResultEvent {
  return { kind, teamSide, segment };
}

function nonScore(kind: SegmentResultEvent["kind"], teamSide: "FOR" | "OPP", segment: 1 | 2 | 3 | 4 | 5 | 6): SegmentResultEvent {
  return { kind, teamSide, segment };
}

describe("computeSegmentResults — basic shape", () => {
  it("always returns all six canonical segments, in order, even with no events", () => {
    const results = computeSegmentResults([]);
    expect(results.map((r) => r.segment)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(results.every((r) => r.forScore === 0 && r.oppScore === 0 && r.margin === 0)).toBe(true);
    expect(results.every((r) => r.winner === "LEVEL")).toBe(true);
    expect(results.every((r) => r.eventCount === 0)).toBe(true);
  });

  it("assigns segments 1-3 to 1H and 4-6 to 2H", () => {
    const results = computeSegmentResults([]);
    expect(results.filter((r) => r.period === "1H").map((r) => r.segment)).toEqual([1, 2, 3]);
    expect(results.filter((r) => r.period === "2H").map((r) => r.segment)).toEqual([4, 5, 6]);
  });

  it("scores points the same way as reviewPdfExport.ts's scoreFromEvents: GOAL=3, TWO_POINTER/FORTY_FIVE_TWO_POINT=2, POINT/FREE_SCORED=1", () => {
    const events: SegmentResultEvent[] = [
      score("GOAL", "FOR", 1),
      score("POINT", "FOR", 1),
      score("TWO_POINTER", "FOR", 1),
      score("FORTY_FIVE_TWO_POINT", "FOR", 1),
      score("FREE_SCORED", "FOR", 1),
    ];
    const [seg1] = computeSegmentResults(events);
    expect(seg1!.forScore).toBe(3 + 1 + 2 + 2 + 1); // 9
  });

  it("ignores non-scoring event kinds when computing forScore/oppScore but still counts them in eventCount", () => {
    const events: SegmentResultEvent[] = [
      nonScore("TURNOVER_WON", "FOR", 1),
      nonScore("KICKOUT_CONCEDED", "OPP", 1),
      score("POINT", "FOR", 1),
    ];
    const [seg1] = computeSegmentResults(events);
    expect(seg1!.forScore).toBe(1);
    expect(seg1!.oppScore).toBe(0);
    expect(seg1!.eventCount).toBe(3);
  });
});

describe("segment winners equal displayed margins — the core audit requirement", () => {
  it("winner is FOR if and only if margin > 0", () => {
    const events: SegmentResultEvent[] = [
      score("GOAL", "FOR", 1), score("GOAL", "FOR", 1), // FOR 6
      score("POINT", "OPP", 1), // OPP 1 -> margin +5
    ];
    const [seg1] = computeSegmentResults(events);
    expect(seg1!.margin).toBeGreaterThan(0);
    expect(seg1!.winner).toBe("FOR");
  });

  it("winner is OPP if and only if margin < 0", () => {
    const events: SegmentResultEvent[] = [
      score("POINT", "FOR", 2),
      score("GOAL", "OPP", 2), score("POINT", "OPP", 2), // OPP 4 -> margin -3
    ];
    const [, seg2] = computeSegmentResults(events);
    expect(seg2!.margin).toBeLessThan(0);
    expect(seg2!.winner).toBe("OPP");
  });

  it("winner is LEVEL if and only if margin === 0", () => {
    const events: SegmentResultEvent[] = [
      score("POINT", "FOR", 3),
      score("POINT", "OPP", 3),
    ];
    const [, , seg3] = computeSegmentResults(events);
    expect(seg3!.margin).toBe(0);
    expect(seg3!.winner).toBe("LEVEL");
  });

  it("exhaustively: for any margin, winner matches its sign", () => {
    for (let forPts = 0; forPts <= 6; forPts++) {
      for (let oppPts = 0; oppPts <= 6; oppPts++) {
        const events: SegmentResultEvent[] = [
          ...Array.from({ length: forPts }, () => score("POINT", "FOR" as const, 1)),
          ...Array.from({ length: oppPts }, () => score("POINT", "OPP" as const, 1)),
        ];
        const [seg1] = computeSegmentResults(events);
        const margin = forPts - oppPts;
        expect(seg1!.margin).toBe(margin);
        if (margin > 0) expect(seg1!.winner).toBe("FOR");
        else if (margin < 0) expect(seg1!.winner).toBe("OPP");
        else expect(seg1!.winner).toBe("LEVEL");
      }
    }
  });

  it("heavy kickout/turnover activity for the trailing side never flips the winner — this was the exact bug", () => {
    // Adare (FOR) is down -1 on the scoreboard in this segment but dominates
    // kickouts and turnovers. The old composite formula
    // ((forScore-oppScore)*2 + kickoutBalance + turnoverBalance*0.5) could
    // push this to a positive "FOR" status despite trailing on the score.
    const events: SegmentResultEvent[] = [
      score("POINT", "OPP", 2), // OPP 1, FOR 0 -> margin -1
      nonScore("KICKOUT_WON", "FOR", 2), nonScore("KICKOUT_WON", "FOR", 2), nonScore("KICKOUT_WON", "FOR", 2),
      nonScore("KICKOUT_CONCEDED", "OPP", 2),
      nonScore("TURNOVER_WON", "FOR", 2), nonScore("TURNOVER_WON", "FOR", 2), nonScore("TURNOVER_WON", "FOR", 2),
      nonScore("TURNOVER_LOST", "OPP", 2),
    ];
    const [, seg2] = computeSegmentResults(events);
    expect(seg2!.margin).toBe(-1);
    expect(seg2!.winner).toBe("OPP"); // not FOR, no matter how dominant the kickout/turnover balance
  });
});

describe("countSegmentsWonBy", () => {
  it("counts only segments whose winner matches the given side", () => {
    const results = computeSegmentResults([
      score("GOAL", "FOR", 1), // seg1: FOR
      score("POINT", "OPP", 2), // seg2: OPP
      score("POINT", "FOR", 3), score("POINT", "OPP", 3), // seg3: LEVEL
    ]);
    expect(countSegmentsWonBy(results, "FOR")).toBe(1);
    expect(countSegmentsWonBy(results, "OPP")).toBe(1);
  });
});

describe("Adare v Mungret — the exact reported contradiction (+4, -1, -1, -5)", () => {
  // Segment margins exactly as displayed in the audit: Adare +4, then -1, -1, -5.
  function buildFixture(): SegmentResultEvent[] {
    const events: SegmentResultEvent[] = [];
    // Segment 1: Adare +4 (e.g. a goal + a point vs nothing)
    events.push(score("GOAL", "FOR", 1), score("POINT", "FOR", 1));
    // Segment 2: Adare -1, but with heavy Adare kickout/turnover dominance
    // (this is exactly the combination that used to flip the old composite
    // status to "FOR" despite trailing on the scoreboard).
    events.push(score("POINT", "OPP", 2));
    events.push(
      nonScore("KICKOUT_WON", "FOR", 2), nonScore("KICKOUT_WON", "FOR", 2),
      nonScore("TURNOVER_WON", "FOR", 2), nonScore("TURNOVER_WON", "FOR", 2),
    );
    // Segment 3: Adare -1
    events.push(score("POINT", "OPP", 3));
    // Segment 4: Adare -5
    events.push(score("GOAL", "OPP", 4), score("POINT", "OPP", 4), score("POINT", "OPP", 4));
    return events;
  }

  it("produces exactly the displayed margins +4, -1, -1, -5", () => {
    const results = computeSegmentResults(buildFixture()).filter((r) => r.eventCount > 0);
    expect(results.map((r) => r.margin)).toEqual([4, -1, -1, -5]);
  });

  it("Adare (FOR) controls exactly 1 of 4 segments — never 4 of 4", () => {
    const results = computeSegmentResults(buildFixture()).filter((r) => r.eventCount > 0);
    expect(countSegmentsWonBy(results, "FOR")).toBe(1);
    expect(countSegmentsWonBy(results, "OPP")).toBe(3);
  });

  it("HT Snapshot's view (1H events only) and FT/Full Review's view (all events) agree on every 1H segment", () => {
    const allEvents = buildFixture();
    const h1OnlyEvents = allEvents.filter((e) => (e.segment as number) <= 3);

    const fromAll = computeSegmentResults(allEvents).filter((r) => r.segment <= 3);
    const fromH1Only = computeSegmentResults(h1OnlyEvents).filter((r) => r.segment <= 3);

    expect(fromH1Only).toEqual(fromAll);
  });

  it("no report can contradict its own graphics: winner always matches the sign of the displayed margin, for every segment in this fixture", () => {
    const results = computeSegmentResults(buildFixture()).filter((r) => r.eventCount > 0);
    for (const r of results) {
      if (r.margin > 0) expect(r.winner).toBe("FOR");
      else if (r.margin < 0) expect(r.winner).toBe("OPP");
      else expect(r.winner).toBe("LEVEL");
    }
  });
});
