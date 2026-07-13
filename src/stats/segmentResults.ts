// Single source of truth for "who won this segment" — every report (HT
// Snapshot, FT Snapshot, Full Review PDF) must derive its segment margins,
// its segment-winner narrative, and its segment-winner colouring from this
// same computation. Before this module existed, reviewPdfExport.ts had two
// independent implementations of "segment control": one that displayed a
// pure score margin (e.g. "+4") on each segment, and a second, separate
// composite score (score margin weighted 2x, plus kickout balance, plus half
// the turnover balance) that decided the segment's *winner* for narrative
// and colouring purposes. Because kickouts/turnovers could push the
// composite over its threshold in either direction independent of the score
// margin, a report could — and did — print "+4, -1, -1, -5" as the visible
// per-segment margins while its own narrative claimed the same team
// "controlled 4 of 4 segments". A segment's winner must always agree with
// its own displayed margin.
import type { MatchEventKind, MatchEventPeriod, MatchEventSegment } from "../core/stats/stats-event-model";

export type SegmentResultEvent = {
  kind: MatchEventKind;
  teamSide?: "FOR" | "OPP" | string | null;
  segment?: MatchEventSegment | null;
};

export type SegmentWinner = "FOR" | "OPP" | "LEVEL";

export type SegmentResult = {
  segment: MatchEventSegment;
  period: MatchEventPeriod;
  /** Total points (goals*3 + points), matching reviewPdfExport.ts's scoreFromEvents. */
  forScore: number;
  oppScore: number;
  /** forScore - oppScore. This is the number every report displays as the segment margin. */
  margin: number;
  /** Derived from `margin` alone — never from kickouts, turnovers, or any other factor. */
  winner: SegmentWinner;
  /** Every event assigned to this segment, regardless of kind — lets a caller tell an empty segment from a genuinely level one. */
  eventCount: number;
};

const SCORE_KINDS = new Set<MatchEventKind>([
  "GOAL", "POINT", "TWO_POINTER", "FORTY_FIVE_TWO_POINT", "FREE_SCORED",
]);

const ALL_SEGMENTS: readonly MatchEventSegment[] = [1, 2, 3, 4, 5, 6];

const SEGMENT_PERIOD: Record<MatchEventSegment, MatchEventPeriod> = {
  1: "1H", 2: "1H", 3: "1H",
  4: "2H", 5: "2H", 6: "2H",
};

/** Points contributed by one score event — the same rule as reviewPdfExport.ts's scoreFromEvents. */
function pointsForKind(kind: MatchEventKind): number {
  if (kind === "GOAL") return 3;
  if (kind === "TWO_POINTER" || kind === "FORTY_FIVE_TWO_POINT") return 2;
  return 1;
}

function totalPoints<TEvent extends SegmentResultEvent>(events: readonly TEvent[]): number {
  let total = 0;
  for (const e of events) {
    if (!SCORE_KINDS.has(e.kind)) continue;
    total += pointsForKind(e.kind);
  }
  return total;
}

/**
 * Computes all 6 canonical segments (1H early/mid/late, 2H early/mid/late),
 * including ones with zero events, so callers that render a fixed 6-row
 * table can rely on a stable shape. Callers that only want segments the
 * match actually reached should filter on `eventCount > 0`.
 */
export function computeSegmentResults<TEvent extends SegmentResultEvent>(
  events: readonly TEvent[],
): SegmentResult[] {
  return ALL_SEGMENTS.map((segment) => {
    const segEvts = events.filter((e) => e.segment === segment);
    const forScore = totalPoints(segEvts.filter((e) => e.teamSide === "FOR"));
    const oppScore = totalPoints(segEvts.filter((e) => e.teamSide === "OPP"));
    const margin = forScore - oppScore;
    const winner: SegmentWinner = margin > 0 ? "FOR" : margin < 0 ? "OPP" : "LEVEL";
    return {
      segment,
      period: SEGMENT_PERIOD[segment],
      forScore,
      oppScore,
      margin,
      winner,
      eventCount: segEvts.length,
    };
  });
}

export function countSegmentsWonBy(results: readonly SegmentResult[], side: "FOR" | "OPP"): number {
  return results.filter((r) => r.winner === side).length;
}
