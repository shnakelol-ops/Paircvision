/**
 * kickout-phase.test.ts
 *
 * The authoritative kickout-origin definition and change-of-possession rule
 * (kickout-phase.ts) that both Intelligence engines follow (I-2 / I-3), plus
 * the point value of two-point scores in possession-outcome net scores (I-1).
 */

import { describe, expect, it } from "vitest";
import type { MatchEventKind } from "../../core/stats/stats-event-model";
import { loadBallylandersGalballyFixture } from "../reporting/ballylanders-galbally-real-fixture";
import { analyseChains } from "./chain-engine";
import type { ChainableEvent } from "./chain-types";
import { kickoutPhaseStep } from "./kickout-phase";
import { buildPossessionOutcomeSummary } from "./possession-outcomes-engine";

let n = 0;
function ev(kind: MatchEventKind, teamSide: "FOR" | "OPP", clock: number, extra: Partial<ChainableEvent> = {}): ChainableEvent {
  return { id: `e${++n}`, kind, teamSide, matchClockSeconds: clock, period: "1H", segment: 1, nx: 0.5, ny: 0.5, ...extra };
}
/** A kickout FOR won (own kickout retained), at `clock`. */
const won = (clock: number) => ev("KICKOUT_WON", "FOR", clock, { restartOwner: "FOR" });

/** Did the chain engine credit a score to the first kickout? */
const chainScored = (events: ChainableEvent[]) => analyseChains(events).kickouts.outcomes[0].nextScore?.id ?? null;
/** Did the possession engine's kickout family record a score for the first kickout? */
const possessionScored = (events: ChainableEvent[]) => {
  const r = buildPossessionOutcomeSummary(events).kickouts.results[0];
  return r.outcome === "GOAL" || r.outcome === "POINT" ? r.outcomingEvent?.id ?? null : null;
};

describe("kickoutPhaseStep — the authoritative change-of-possession rule", () => {
  it("classifies the kickout winner's attempts", () => {
    expect(kickoutPhaseStep({ kind: "POINT", teamSide: "FOR" }, "FOR")).toBe("SCORE");
    expect(kickoutPhaseStep({ kind: "TWO_POINTER", teamSide: "FOR" }, "FOR")).toBe("SCORE");
    expect(kickoutPhaseStep({ kind: "WIDE", teamSide: "FOR" }, "FOR")).toBe("MISS");
    expect(kickoutPhaseStep({ kind: "SHOT", teamSide: "FOR" }, "FOR")).toBe("SHOT");
  });

  it("any turnover is a change of possession, whichever team it is stored under", () => {
    for (const kind of ["TURNOVER_WON", "TURNOVER_LOST", "POSSESSION_WON", "POSSESSION_LOST"] as const) {
      expect(kickoutPhaseStep({ kind, teamSide: "FOR" }, "FOR")).toBe("POSSESSION_CHANGE");
      expect(kickoutPhaseStep({ kind, teamSide: "OPP" }, "FOR")).toBe("POSSESSION_CHANGE");
    }
  });

  it("an attempt by the other team is a change of possession", () => {
    for (const kind of ["POINT", "GOAL", "WIDE", "SHOT"] as const) {
      expect(kickoutPhaseStep({ kind, teamSide: "OPP" }, "FOR")).toBe("POSSESSION_CHANGE");
    }
  });

  it("a free, 45 / 65 or sideline continues the possession only for the team that has the ball", () => {
    // *_WON: teamSide has the ball; *_CONCEDED: the other team has it.
    for (const [won, conceded] of [["FREE_WON", "FREE_CONCEDED"], ["FORTY_FIVE_WON", "FORTY_FIVE_CONCEDED"], ["SIDELINE_WON", "SIDELINE_CONCEDED"]] as const) {
      expect(kickoutPhaseStep({ kind: won, teamSide: "FOR" }, "FOR")).toBe("RESTART_RETAINED");
      expect(kickoutPhaseStep({ kind: conceded, teamSide: "OPP" }, "FOR")).toBe("RESTART_RETAINED");
      expect(kickoutPhaseStep({ kind: conceded, teamSide: "FOR" }, "FOR")).toBe("POSSESSION_CHANGE");
      expect(kickoutPhaseStep({ kind: won, teamSide: "OPP" }, "FOR")).toBe("POSSESSION_CHANGE");
    }
  });

  it("the next kickout ends it; other events do not", () => {
    expect(kickoutPhaseStep({ kind: "KICKOUT_WON", teamSide: "FOR" }, "FOR")).toBe("NEXT_KICKOUT");
    expect(kickoutPhaseStep({ kind: "KICKOUT_CONCEDED", teamSide: "OPP" }, "FOR")).toBe("NEXT_KICKOUT");
    expect(kickoutPhaseStep({ kind: "YELLOW_CARD", teamSide: "OPP" }, "FOR")).toBe("CONTINUE");
  });
});

describe("both Intelligence engines apply the same change-of-possession rule", () => {
  // [name, events, kickout-origin score (chain), immediate-outcome score (possession engine)]
  const cases: Array<[string, (t: number) => ChainableEvent[], boolean, boolean]> = [
    ["score straight from the kickout", (t) => [won(t), ev("POINT", "FOR", t + 20)], true, true],
    ["score after a recovered shot", (t) => [won(t), ev("SHOT", "FOR", t + 10), ev("POINT", "FOR", t + 25)], true, true],
    ["45 kept after a blocked shot, then a two-pointer", (t) => [won(t), ev("SHOT", "FOR", t + 9), ev("FORTY_FIVE_WON", "FOR", t + 15), ev("TWO_POINTER", "FOR", t + 40)], true, true],
    ["sideline kept, then a score", (t) => [won(t), ev("SIDELINE_WON", "FOR", t + 9), ev("POINT", "FOR", t + 40)], true, true],
    ["turnover lost, later score", (t) => [won(t), ev("TURNOVER_LOST", "FOR", t + 9), ev("POINT", "FOR", t + 40)], false, false],
    ["Event Stats: won back after an unrecorded loss", (t) => [won(t), ev("TURNOVER_WON", "FOR", t + 9), ev("POINT", "FOR", t + 40)], false, false],
    ["opposition shot, later score", (t) => [won(t), ev("SHOT", "OPP", t + 9), ev("POINT", "FOR", t + 40)], false, false],
    ["free to the opposition, later score", (t) => [won(t), ev("FREE_CONCEDED", "FOR", t + 6), ev("POINT", "FOR", t + 40)], false, false],
    ["45 to the opposition, later score", (t) => [won(t), ev("FORTY_FIVE_CONCEDED", "FOR", t + 6), ev("POINT", "FOR", t + 40)], false, false],
    ["own wide, later score", (t) => [won(t), ev("WIDE", "FOR", t + 9), ev("POINT", "FOR", t + 40)], false, false],
    ["score after the 90 s window", (t) => [won(t), ev("POINT", "FOR", t + 95)], false, false],
    // The one documented difference: a free won by the team in possession is
    // part of the kickout-origin possession (spec: "including frees won during
    // it"), but starts a new phase in the immediate-outcome engine.
    ["own free won, score from the free", (t) => [won(t), ev("FREE_WON", "FOR", t + 9), ev("POINT", "FOR", t + 40, { tags: ["FREE"] })], true, false],
  ];
  for (const [name, build, origin, immediate] of cases) {
    it(`${name}: kickout-origin ${origin ? "yes" : "no"}, immediate outcome ${immediate ? "score" : "no score"}`, () => {
      const events = build(100);
      const scoreId = events[events.length - 1].id;
      expect(chainScored(events)).toBe(origin ? scoreId : null);
      expect(possessionScored(events)).toBe(immediate ? scoreId : null);
    });
  }

  it("on a real Event Stats match the engines differ only where the team in possession won a free", () => {
    const { events } = loadBallylandersGalballyFixture();
    const sorted = [...events].sort((a, b) => ((a.period === "2H" ? 3600 : 0) + (a.matchClockSeconds ?? 0)) - ((b.period === "2H" ? 3600 : 0) + (b.matchClockSeconds ?? 0)));
    const chain = analyseChains(events).kickouts.outcomes;
    const poss = buildPossessionOutcomeSummary(events).kickouts.results;
    expect(poss.map((r) => r.originEvent.id)).toEqual(chain.map((o) => o.kickoutEvent.id));
    let differ = 0;
    for (let i = 0; i < chain.length; i++) {
      const pScore = poss[i].outcome === "GOAL" || poss[i].outcome === "POINT" ? poss[i].outcomingEvent?.id ?? null : null;
      const cScore = chain[i].nextScore?.id ?? null;
      if (pScore === cScore) continue;
      differ++;
      // Only ever: the chain credits a score the immediate phase does not,
      // because a free went to the team in possession in between.
      expect(pScore).toBeNull();
      const from = sorted.findIndex((e) => e.id === chain[i].kickoutEvent.id);
      const to = sorted.findIndex((e) => e.id === cScore);
      expect(sorted.slice(from + 1, to).some((e) => (e.kind === "FREE_WON" || e.kind === "FREE_CONCEDED") && kickoutPhaseStep(e, chain[i].winningSide) === "RESTART_RETAINED")).toBe(true);
    }
    expect(differ).toBeGreaterThan(0);
  });
});

describe("I-1 — possession-outcome net scores use each score's point value", () => {
  it("a two-point score contributes two points; a goal three", () => {
    const events = [
      won(100), ev("TWO_POINTER", "FOR", 120),
      won(200), ev("FORTY_FIVE_TWO_POINT", "FOR", 220),
      won(300), ev("GOAL", "FOR", 320),
      won(400), ev("POINT", "FOR", 420),
    ];
    const k = buildPossessionOutcomeSummary(events).kickouts;
    expect(k.retained.goals).toBe(1);
    expect(k.retained.points).toBe(3);          // point-scoring possessions (a count)
    expect(k.retained.scoreValue).toBe(2 + 2 + 3 + 1);
    expect(k.netOutcome).toBe(8);
    expect(k.retained.scoringPct).toBe(100);    // 4 scoring possessions of 4
  });

  it("feeds the overall net outcome and the conceded side the same way", () => {
    const events = [
      ev("KICKOUT_CONCEDED", "FOR", 100, { restartOwner: "FOR" }), ev("TWO_POINTER", "OPP", 120),
      ev("TURNOVER_WON", "FOR", 200), ev("TWO_POINTER", "FOR", 220),
    ];
    const s = buildPossessionOutcomeSummary(events);
    expect(s.kickouts.conceded.scoreValue).toBe(2);
    expect(s.kickouts.netOutcome).toBe(-2);
    expect(s.turnovers.retained.scoreValue).toBe(2);
    expect(s.overallNetOutcome).toBe(0);
  });
});
