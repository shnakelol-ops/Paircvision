/**
 * reviewPdfExport.oppositionScoringOrigin.test.ts
 *
 * Regression fixture for the ABK-class defect: chain-rules "TURNOVER_TO_SCORE"
 * and "FREE_WON_TO_GOAL" anchor on TURNOVER_WON / FREE_WON, which capture only
 * ever records with teamSide "FOR" (opposition turnover/free wins are logged
 * as FOR's TURNOVER_LOST / FREE_CONCEDED instead). A `teamSide === "OPP"`
 * filter on those rule-chains is therefore structurally always 0, regardless
 * of what actually happened — this is what produced the ABK PDF's impossible
 * "OPP scores from turnovers: 5 / Direct turnover-win scores: 0" pair.
 *
 * This file proves:
 *   1. The old chain-rule-filtered formulas are still 0 in this fixture, even
 *      though the opposition demonstrably won turnovers/frees and scored from
 *      them — documenting the defect this patch fixes.
 *   2. computeOppTurnoverOriginScoringPossessions() and computeOppFreeOriginGoals()
 *      — the two production consumers reviewPdfExport.ts now actually calls —
 *      report the correct, non-zero counts.
 *   3. The replacement counts scoring *possessions*, not scoreboard points
 *      (a goal + a point must count as 2 possessions, not 4 points), and the
 *      free-origin replacement counts *goals only* (matching FREE_WON_TO_GOAL's
 *      original scope), never goals + points.
 *   4. tvOppToShot's underlying source was deliberately left unfixed (no
 *      certified exact equivalent existed within scope) — pinned here so a
 *      future change to that decision is intentional, not accidental.
 */

import { describe, expect, it } from "vitest";
import { analyseChains } from "./chains/chain-engine";
import {
  computeOppFreeOriginGoals,
  computeOppTurnoverOriginScoringPossessions,
  type PdfExportEvent,
} from "./reviewPdfExport";

let nextId = 0;
function mk(
  partial: Partial<PdfExportEvent> & Pick<PdfExportEvent, "kind" | "teamSide" | "matchClockSeconds">,
): PdfExportEvent {
  return {
    id: `pdf-${nextId++}`,
    period: "1H",
    segment: 1,
    nx: 0.5,
    ny: 0.5,
    ...partial,
  };
}

describe("Opposition turnover-origin and free-origin scoring — production formula", () => {
  // FOR wins 2 turnovers (shot from both, scores from 1).
  // OPP gains possession from 3 FOR turnover losses (shot from all 3, scores from 2:
  // one goal, one point — deliberately mixed to catch a points-value substitution bug).
  const turnoverEvents: PdfExportEvent[] = [
    mk({ id: "opp-to-1", kind: "TURNOVER_LOST", teamSide: "FOR", matchClockSeconds: 100 }),
    mk({ kind: "POINT", teamSide: "OPP", matchClockSeconds: 110 }),

    mk({ id: "opp-to-2", kind: "TURNOVER_LOST", teamSide: "FOR", matchClockSeconds: 200 }),
    mk({ kind: "GOAL", teamSide: "OPP", matchClockSeconds: 210 }),

    mk({ id: "opp-to-3", kind: "TURNOVER_LOST", teamSide: "FOR", matchClockSeconds: 300 }),
    mk({ kind: "WIDE", teamSide: "OPP", matchClockSeconds: 310 }), // shot, no score

    mk({ id: "for-to-1", kind: "TURNOVER_WON", teamSide: "FOR", matchClockSeconds: 400 }),
    mk({ kind: "POINT", teamSide: "FOR", matchClockSeconds: 410 }),

    mk({ id: "for-to-2", kind: "TURNOVER_WON", teamSide: "FOR", matchClockSeconds: 500 }),
    mk({ kind: "WIDE", teamSide: "FOR", matchClockSeconds: 510 }), // shot, no score
  ];

  it("FOR/OPP turnover won-lost counts match the spec exactly", () => {
    const analysis = analyseChains(turnoverEvents);
    expect(analysis.turnovers.won).toBe(2);  // FOR turnovers won
    expect(analysis.turnovers.lost).toBe(3); // FOR turnovers lost
    // OPP turnovers won = FOR turnovers lost (inversion); OPP turnovers lost = FOR turnovers won.
    expect(analysis.turnovers.lost).toBe(3); // OPP turnovers won
    expect(analysis.turnovers.won).toBe(2);  // OPP turnovers lost
    expect(analysis.turnovers.wonToScore).toBe(1); // FOR turnover-origin scoring possessions
  });

  it("the old chain-rule-filtered formula stays 0 even though OPP clearly scored twice (documents the defect)", () => {
    const analysis = analyseChains(turnoverEvents);
    const oldBrokenValue = (analysis.byRule["TURNOVER_TO_SCORE"] ?? []).filter((c) => c.teamSide === "OPP").length;
    expect(oldBrokenValue).toBe(0);
  });

  it("computeOppTurnoverOriginScoringPossessions returns the correct OPP count — 2 possessions, not 4 points", () => {
    // OPP scored a GOAL (3 pts) and a POINT (1 pt) — 4 scoreboard points, but 2 scoring
    // possessions. The production formula must report the possession count.
    expect(computeOppTurnoverOriginScoringPossessions(turnoverEvents)).toBe(2);
  });

  // At least one FREE_CONCEDED by FOR, with an OPP score within the canonical window.
  // A second FREE_CONCEDED → OPP POINT is included to prove the replacement stays
  // goal-only (matching FREE_WON_TO_GOAL's original scope) and does not silently
  // broaden to "any score".
  const freeEvents: PdfExportEvent[] = [
    mk({ id: "opp-free-1", kind: "FREE_CONCEDED", teamSide: "FOR", matchClockSeconds: 600 }),
    mk({ kind: "GOAL", teamSide: "OPP", matchClockSeconds: 615 }), // within 45s window — counts

    mk({ id: "opp-free-2", kind: "FREE_CONCEDED", teamSide: "FOR", matchClockSeconds: 700 }),
    mk({ kind: "POINT", teamSide: "OPP", matchClockSeconds: 710 }), // within window, but NOT a goal — must not count
  ];

  it("the old chain-rule-filtered free formula stays 0 even though OPP scored a goal off a conceded free", () => {
    const analysis = analyseChains(freeEvents);
    const oldBrokenValue = (analysis.byRule["FREE_WON_TO_GOAL"] ?? []).filter((c) => c.teamSide === "OPP").length;
    expect(oldBrokenValue).toBe(0);
  });

  it("computeOppFreeOriginGoals returns 1 (goal-only) — the trailing OPP point must not be counted", () => {
    expect(computeOppFreeOriginGoals(freeEvents)).toBe(1);
  });

  // tvOppToShot ("Turnover won → shot chains") is intentionally left unfixed: no
  // certified exact equivalent exists (possession-outcomes-engine's resolveOutcome()
  // ends a possession early at the next KICKOUT/FREE event, while the chain-rule scan
  // does not treat those as boundaries — a real behavioural divergence, not just a
  // renamed constant). This pins the accepted known-bad state so a future change to
  // that decision is deliberate. See makeOppositionSnapshotPage's tvOppToShot comment.
  it("tvOppToShot's underlying source remains known-bad (0) — deliberately not substituted", () => {
    const shotFixture: PdfExportEvent[] = [
      mk({ kind: "TURNOVER_LOST", teamSide: "FOR", matchClockSeconds: 100 }),
      mk({ kind: "WIDE", teamSide: "OPP", matchClockSeconds: 110 }), // OPP clearly took a shot off the turnover
    ];
    const analysis = analyseChains(shotFixture);
    const stillBroken = (analysis.byRule["TURNOVER_TO_SHOT"] ?? []).filter((c) => c.teamSide === "OPP").length;
    expect(stillBroken).toBe(0);
  });
});
