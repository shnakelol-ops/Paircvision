import { describe, expect, it } from "vitest";
import { analyseChains } from "./chain-engine";
import type { ChainableEvent } from "./chain-types";

let seq = 0;
function evt(partial: Partial<ChainableEvent> & Pick<ChainableEvent, "kind" | "teamSide">): ChainableEvent {
  seq += 1;
  return {
    id: `evt-${seq}`,
    period: "1H",
    segment: 1,
    matchClockSeconds: seq * 10,
    nx: 0.5,
    ny: 0.5,
    ...partial,
  };
}

describe("buildTurnoverDataset — won/lost must be scoped by acting side, not raw kind", () => {
  it("splits won/lost correctly when every turnover is logged as a single kind (TURNOVER_WON) with teamSide as the actual winner — the Pro Tagger capture pattern", () => {
    // 10 FOR-side wins, 6 OPP-side wins, all logged as kind TURNOVER_WON —
    // there is no TURNOVER_LOST event in this dataset at all.
    const events: ChainableEvent[] = [
      ...Array.from({ length: 10 }, () => evt({ kind: "TURNOVER_WON", teamSide: "FOR" })),
      ...Array.from({ length: 6 },  () => evt({ kind: "TURNOVER_WON", teamSide: "OPP" })),
    ];
    const analysis = analyseChains(events);
    expect(analysis.turnovers.won).toBe(10);
    expect(analysis.turnovers.lost).toBe(6);
    expect(analysis.turnovers.total).toBe(16);
  });

  it("still splits won/lost correctly for legacy FOR-locked dual-kind data (TURNOVER_WON = FOR gained, TURNOVER_LOST = FOR lost, teamSide always FOR)", () => {
    const events: ChainableEvent[] = [
      ...Array.from({ length: 4 }, () => evt({ kind: "TURNOVER_WON",  teamSide: "FOR" })),
      ...Array.from({ length: 3 }, () => evt({ kind: "TURNOVER_LOST", teamSide: "FOR" })),
    ];
    const analysis = analyseChains(events);
    expect(analysis.turnovers.won).toBe(4);
    expect(analysis.turnovers.lost).toBe(3);
  });

  it("wonToScore / lostAllowedScore are scoped by acting side, matching won/lost exactly", () => {
    const events: ChainableEvent[] = [
      evt({ kind: "TURNOVER_WON", teamSide: "FOR", matchClockSeconds: 100 }),
      evt({ kind: "POINT",        teamSide: "FOR", matchClockSeconds: 105 }),
      evt({ kind: "TURNOVER_WON", teamSide: "OPP", matchClockSeconds: 200 }),
      evt({ kind: "POINT",        teamSide: "OPP", matchClockSeconds: 204 }),
    ];
    const analysis = analyseChains(events);
    expect(analysis.turnovers.won).toBe(1);
    expect(analysis.turnovers.lost).toBe(1);
    expect(analysis.turnovers.wonToScore).toBe(1);
    expect(analysis.turnovers.lostAllowedScore).toBe(1);
  });

  it("Adare v Mungret regression: 10 FOR-side turnover wins (1 scoring) and 6 OPP-side wins (2 scoring), single-kind logging", () => {
    const events: ChainableEvent[] = [
      evt({ kind: "TURNOVER_WON", teamSide: "FOR", matchClockSeconds: 10 }),
      evt({ kind: "POINT",        teamSide: "FOR", matchClockSeconds: 14 }),
      ...Array.from({ length: 9 }, () => evt({ kind: "TURNOVER_WON", teamSide: "FOR" })),
      evt({ kind: "TURNOVER_WON", teamSide: "OPP", matchClockSeconds: 500 }),
      evt({ kind: "POINT",        teamSide: "OPP", matchClockSeconds: 504 }),
      evt({ kind: "TURNOVER_WON", teamSide: "OPP", matchClockSeconds: 600 }),
      evt({ kind: "GOAL",         teamSide: "OPP", matchClockSeconds: 604 }),
      ...Array.from({ length: 4 }, () => evt({ kind: "TURNOVER_WON", teamSide: "OPP" })),
    ];
    const analysis = analyseChains(events);
    expect(analysis.turnovers.total).toBe(16);
    expect(analysis.turnovers.won).toBe(10);
    expect(analysis.turnovers.lost).toBe(6);
    expect(analysis.turnovers.wonToScore).toBe(1);
    expect(analysis.turnovers.lostAllowedScore).toBe(2);
    // The old bug: won/16 always reported 100% share and 19% (3/16) conversion
    // regardless of which team actually won the turnover.
    expect(analysis.turnovers.wonToScorePercent).toBe(10); // 1/10, not 3/16 (19%)
  });
});

describe("buildKickoutDataset — already scoped by winning side (regression guard, not a fix)", () => {
  it("splits won/lost correctly for single-kind kickout logging (Pro Tagger pattern: always KICKOUT_WON, teamSide = actual winner)", () => {
    const events: ChainableEvent[] = [
      ...Array.from({ length: 22 }, () => evt({ kind: "KICKOUT_WON", teamSide: "FOR" })),
      ...Array.from({ length: 20 }, () => evt({ kind: "KICKOUT_WON", teamSide: "OPP" })),
    ];
    const analysis = analyseChains(events);
    expect(analysis.kickouts.won).toBe(22);
    expect(analysis.kickouts.lost).toBe(20);
    expect(analysis.kickouts.total).toBe(42);
  });
});
