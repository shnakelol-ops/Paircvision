import { describe, expect, it } from "vitest";
import {
  classifyTurnoverOutcomeBucket,
  computeTurnoverOutcomeBucketCounts,
} from "./turnoverOutcomeBucket";
import type { ChainableEvent, TurnoverOutcome } from "./chain-types";

function evt(kind: ChainableEvent["kind"], teamSide: "FOR" | "OPP" = "FOR"): ChainableEvent {
  return {
    id: `e-${Math.random()}`,
    kind,
    teamSide,
    period: "1H",
    segment: 1,
    nx: 0.5,
    ny: 0.5,
  };
}

function outcome(partial: Partial<TurnoverOutcome>): TurnoverOutcome {
  return {
    turnoverEvent: evt("TURNOVER_WON"),
    direction: "WON",
    actingSide: "FOR",
    nextEvent: null,
    resultedInScore: false,
    resultedInShot: false,
    secondsToOutcome: null,
    ...partial,
  };
}

describe("classifyTurnoverOutcomeBucket — mutually exclusive, exhaustive", () => {
  it("origin score takes priority over everything else", () => {
    const o = outcome({ resultedInScore: true, resultedInShot: true, nextEvent: evt("TURNOVER_LOST") });
    expect(classifyTurnoverOutcomeBucket(o)).toBe("ORIGIN_SCORE");
  });

  it("shot no score, when no score but a shot was taken", () => {
    const o = outcome({ resultedInScore: false, resultedInShot: true, nextEvent: evt("TURNOVER_WON") });
    expect(classifyTurnoverOutcomeBucket(o)).toBe("SHOT_NO_SCORE");
  });

  it("attack lost — this was the exact bug: a possession with no shot AND an immediate re-turnover used to be double-counted in both 'no shot attempt' and 'attack immediately lost'", () => {
    const o = outcome({ resultedInScore: false, resultedInShot: false, nextEvent: evt("TURNOVER_WON") });
    expect(classifyTurnoverOutcomeBucket(o)).toBe("ATTACK_LOST");
  });

  it("no shot attempt — no shot, and the next event was not a turnover", () => {
    const o = outcome({ resultedInScore: false, resultedInShot: false, nextEvent: evt("WIDE") });
    expect(classifyTurnoverOutcomeBucket(o)).toBe("NO_SHOT_ATTEMPT");
  });

  it("no shot attempt when there is no next event at all", () => {
    const o = outcome({ resultedInScore: false, resultedInShot: false, nextEvent: null });
    expect(classifyTurnoverOutcomeBucket(o)).toBe("NO_SHOT_ATTEMPT");
  });
});

describe("computeTurnoverOutcomeBucketCounts — sum always equals total, never over 100%", () => {
  it("sums exactly to the outcome count for a mixed set, including the exact old-bug shape", () => {
    const outcomes: TurnoverOutcome[] = [
      outcome({ resultedInScore: true }),                                                    // origin score
      outcome({ resultedInShot: true }),                                                      // shot, no score
      outcome({ resultedInShot: true }),                                                      // shot, no score
      outcome({ nextEvent: evt("TURNOVER_WON") }),                                            // attack lost
      outcome({ nextEvent: evt("TURNOVER_WON") }),                                            // attack lost — no shot AND immediate turnover; old code double-counted this
      outcome({ nextEvent: evt("WIDE") }),                                                    // no shot attempt
      outcome({ nextEvent: null }),                                                           // no shot attempt
      outcome({}),                                                                            // no shot attempt
      outcome({}),                                                                            // no shot attempt
      outcome({}),                                                                            // no shot attempt
    ];
    const counts = computeTurnoverOutcomeBucketCounts(outcomes);
    expect(counts.total).toBe(10);
    expect(counts.originScore + counts.shotNoScore + counts.attackLost + counts.noShotAttempt).toBe(10);
    expect(counts.originScore).toBe(1);
    expect(counts.shotNoScore).toBe(2);
    expect(counts.attackLost).toBe(2);
    expect(counts.noShotAttempt).toBe(5);
  });

  it("Adare v Mungret regression: 10 turnovers won never produce more than 10 outcomes across all four buckets (the exact reported 120% bug)", () => {
    const outcomes: TurnoverOutcome[] = [
      outcome({ resultedInScore: true }),
      outcome({ resultedInShot: true }),
      outcome({ resultedInShot: true }),
      // "no shot attempt" cases that ALSO immediately turned over — this
      // combination is exactly what used to inflate both rows at once.
      outcome({ nextEvent: evt("TURNOVER_WON") }),
      outcome({ nextEvent: evt("TURNOVER_LOST") }),
      outcome({ nextEvent: evt("WIDE") }),
      outcome({ nextEvent: evt("WIDE") }),
      outcome({}),
      outcome({}),
      outcome({}),
    ];
    expect(outcomes.length).toBe(10);
    const counts = computeTurnoverOutcomeBucketCounts(outcomes);
    const bucketSum = counts.originScore + counts.shotNoScore + counts.attackLost + counts.noShotAttempt;
    expect(bucketSum).toBe(10); // not 12 — the old bug's 120%
  });
});
