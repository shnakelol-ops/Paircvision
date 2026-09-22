/**
 * reviewPdfExport.discipline.test.ts
 *
 * P1 regression coverage: Event Stats captures Yellow Card, Sin Bin, and Red
 * Card events (pro-tagger-discipline.ts), but no page of the exported match
 * PDF surfaced them — YELLOW_CARD/SIN_BIN/RED_CARD only appeared in
 * EVENT_COLORS, a colour lookup, never in any counting/table/callout logic.
 * A coach relying on the PDF as the match record had no way to know a red
 * card or sin bin occurred.
 *
 * computeDisciplineCounts is the small, factual, per-team aggregation the
 * Intelligence Summary's Team Comparison card now reads (three new rows:
 * Yellow cards / Sin bins / Red cards, alongside the existing home/away
 * columns) — exported and pure so the counts are directly testable without
 * rendering the canvas page they're drawn on.
 */
import { describe, expect, it } from "vitest";
import { computeDisciplineCounts, type PdfExportEvent } from "./reviewPdfExport";

let nextId = 0;
function mk(partial: Partial<PdfExportEvent> & Pick<PdfExportEvent, "kind" | "teamSide">): PdfExportEvent {
  return {
    id: `pdf-discipline-${nextId++}`,
    period: partial.period ?? "1H",
    segment: partial.segment ?? 1,
    matchClockSeconds: partial.matchClockSeconds ?? 0,
    nx: 0.5,
    ny: 0.5,
    ...partial,
  };
}

describe("computeDisciplineCounts (P1)", () => {
  it("produces the correct per-team counts for a fixture with known discipline events", () => {
    const events: PdfExportEvent[] = [
      // FOR: 2 yellow, 1 sin bin, 0 red
      mk({ kind: "YELLOW_CARD", teamSide: "FOR" }),
      mk({ kind: "YELLOW_CARD", teamSide: "FOR" }),
      mk({ kind: "SIN_BIN", teamSide: "FOR" }),
      // OPP: 1 yellow, 0 sin bin, 1 red
      mk({ kind: "YELLOW_CARD", teamSide: "OPP" }),
      mk({ kind: "RED_CARD", teamSide: "OPP" }),
      // Non-discipline events must not be counted.
      mk({ kind: "POINT", teamSide: "FOR" }),
      mk({ kind: "WIDE", teamSide: "OPP" }),
    ];

    const forCounts = computeDisciplineCounts(events, "FOR");
    const oppCounts = computeDisciplineCounts(events, "OPP");

    expect(forCounts).toEqual({ yellowCards: 2, sinBins: 1, redCards: 0 });
    expect(oppCounts).toEqual({ yellowCards: 1, sinBins: 0, redCards: 1 });
  });

  it("a match with zero discipline events renders sensibly — all counts are 0, not undefined or NaN", () => {
    const events: PdfExportEvent[] = [
      mk({ kind: "POINT", teamSide: "FOR" }),
      mk({ kind: "GOAL", teamSide: "OPP" }),
    ];

    expect(computeDisciplineCounts(events, "FOR")).toEqual({ yellowCards: 0, sinBins: 0, redCards: 0 });
    expect(computeDisciplineCounts(events, "OPP")).toEqual({ yellowCards: 0, sinBins: 0, redCards: 0 });
  });

  it("an empty event list (zero-event match) does not throw and returns all-zero counts", () => {
    expect(() => computeDisciplineCounts([], "FOR")).not.toThrow();
    expect(computeDisciplineCounts([], "FOR")).toEqual({ yellowCards: 0, sinBins: 0, redCards: 0 });
    expect(computeDisciplineCounts([], "OPP")).toEqual({ yellowCards: 0, sinBins: 0, redCards: 0 });
  });

  it("does not cross-attribute a team's cards to the opposition", () => {
    const events: PdfExportEvent[] = [
      mk({ kind: "RED_CARD", teamSide: "FOR" }),
    ];
    expect(computeDisciplineCounts(events, "FOR").redCards).toBe(1);
    expect(computeDisciplineCounts(events, "OPP").redCards).toBe(0);
  });
});
