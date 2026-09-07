// P0-3 regression coverage: Quick Review Page 2 ("Shots" row on the Counts
// Sheet) used to count only raw kind === "SHOT" events, while Page 1
// (viewShootingConversion) and Page 3 (SHOT_ATTEMPT_KINDS) both already used
// the full shot-attempt family (scores, wides, and every attempt outcome,
// including frees). Same match, same "Shots" label, contradictory numbers.
//
// The fix makes computeProTaggerCounts's `shots` field (which feeds Page 2's
// Counts Sheet row) use the same canonical set — teamStatsViews.ts's
// exported SHOT_KINDS — instead of a private raw-SHOT-only filter. This
// suite builds one mixed attempt fixture (score, wide, saved, blocked, post,
// placed-ball outcomes) and proves Page 1, Page 2, and Page 3 now agree on
// the same team's total shot count for the same data.
import { describe, expect, it } from "vitest";
import type { LoggedMatchEvent } from "../core/stats/saved-match";
import { computeProTaggerCounts } from "./ProTaggerLiveScreen";
import { buildQuickReviewMatchOverview } from "../stats/reporting/quickReviewMatchOverview";
import { buildQuickReviewSegmentBreakdown } from "../stats/reporting/quickReviewSegmentBreakdown";

let nextId = 0;
function buildEvent(overrides: Partial<LoggedMatchEvent> & Pick<LoggedMatchEvent, "kind" | "teamSide">): LoggedMatchEvent {
  const kind = overrides.kind;
  return {
    id: `p0-3-${nextId++}`,
    type: kind,
    nx: 0.5,
    ny: 0.5,
    x: 0.5,
    y: 0.5,
    half: 1,
    timestamp: 0,
    period: "1H",
    segment: 1,
    matchClockSeconds: 60,
    createdAt: 0,
    ...overrides,
  };
}

// One mixed FOR-side attempt sequence: a score of each attempt-scoring kind,
// a wide (miss), three raw-SHOT outcomes (saved/blocked/post — distinguished
// only by tag, all still shot attempts), and both placed-ball (free) outcomes.
// Plus a 45/65 two-pointer, to exercise the full canonical set.
const forAttempts: LoggedMatchEvent[] = [
  buildEvent({ kind: "GOAL", teamSide: "FOR" }),
  buildEvent({ kind: "POINT", teamSide: "FOR" }),
  buildEvent({ kind: "TWO_POINTER", teamSide: "FOR" }),
  buildEvent({ kind: "FORTY_FIVE_TWO_POINT", teamSide: "FOR" }),
  buildEvent({ kind: "WIDE", teamSide: "FOR" }),
  buildEvent({ kind: "SHOT", teamSide: "FOR", tags: ["BLOCK_SAVE"] }), // saved
  buildEvent({ kind: "SHOT", teamSide: "FOR", tags: ["BLOCKED"] }),    // blocked
  buildEvent({ kind: "SHOT", teamSide: "FOR", tags: ["POST"] }),       // post
  buildEvent({ kind: "FREE_SCORED", teamSide: "FOR" }),
  buildEvent({ kind: "FREE_MISSED", teamSide: "FOR" }),
];
const FOR_TOTAL_SHOT_ATTEMPTS = forAttempts.length; // 10

// Non-attempt FOR-side events that must NOT be counted as shots on any page.
const forNonAttempts: LoggedMatchEvent[] = [
  buildEvent({ kind: "KICKOUT_WON", teamSide: "FOR" }),
  buildEvent({ kind: "TURNOVER_WON", teamSide: "FOR" }),
  buildEvent({ kind: "YELLOW_CARD", teamSide: "FOR" }),
  buildEvent({ kind: "FREE_WON", teamSide: "FOR" }),
];

// A distinct OPP-side attempt count, to prove side separation holds on every page.
const oppAttempts: LoggedMatchEvent[] = [
  buildEvent({ kind: "POINT", teamSide: "OPP" }),
  buildEvent({ kind: "WIDE", teamSide: "OPP" }),
  buildEvent({ kind: "SHOT", teamSide: "OPP", tags: ["BLOCKED"] }),
];
const OPP_TOTAL_SHOT_ATTEMPTS = oppAttempts.length; // 3

const allEvents = [...forAttempts, ...forNonAttempts, ...oppAttempts];

describe("Quick Review Shots reconciliation across Page 1/2/3 (P0-3)", () => {
  it("Page 2 (Counts Sheet / computeProTaggerCounts) counts the full shot-attempt family, not raw kind SHOT alone", () => {
    expect(computeProTaggerCounts(allEvents, "FOR").shots).toBe(FOR_TOTAL_SHOT_ATTEMPTS);
    expect(computeProTaggerCounts(allEvents, "OPP").shots).toBe(OPP_TOTAL_SHOT_ATTEMPTS);
  });

  it("Page 1 (viewShootingConversion via buildQuickReviewMatchOverview) agrees with Page 2's total", () => {
    const model = buildQuickReviewMatchOverview(allEvents, "Home", "Away");
    expect(model.shooting.for.attempts).toBe(FOR_TOTAL_SHOT_ATTEMPTS);
    expect(model.shooting.opp.attempts).toBe(OPP_TOTAL_SHOT_ATTEMPTS);
    expect(model.shooting.for.attempts).toBe(computeProTaggerCounts(allEvents, "FOR").shots);
  });

  it("Page 3 (buildQuickReviewSegmentBreakdown) agrees — summed across segments — with Page 1 and Page 2's totals", () => {
    const breakdown = buildQuickReviewSegmentBreakdown(allEvents, "Home", "Away", "LEFT");
    const homeShotsTotal = breakdown.segments.reduce((sum, seg) => sum + seg.home.shots, 0);
    const awayShotsTotal = breakdown.segments.reduce((sum, seg) => sum + seg.away.shots, 0);

    expect(homeShotsTotal).toBe(FOR_TOTAL_SHOT_ATTEMPTS);
    expect(awayShotsTotal).toBe(OPP_TOTAL_SHOT_ATTEMPTS);
    expect(homeShotsTotal).toBe(computeProTaggerCounts(allEvents, "FOR").shots);
    expect(awayShotsTotal).toBe(computeProTaggerCounts(allEvents, "OPP").shots);
  });

  it("conversion semantics (scores ÷ attempts) are unchanged — only the attempts denominator's label-level agreement was the bug", () => {
    const model = buildQuickReviewMatchOverview(allEvents, "Home", "Away");
    // 4 FOR-side scores: GOAL, POINT, TWO_POINTER, FORTY_FIVE_TWO_POINT, FREE_SCORED = 5
    expect(model.shooting.for.scores).toBe(5);
    expect(model.shooting.for.attempts).toBe(10);
    expect(model.shooting.for.pct).toBe(50);
  });
});
