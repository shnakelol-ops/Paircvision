/**
 * quickReviewSegmentBreakdown.test.ts
 *
 * Analytics coverage for Quick Review Page 3's data builder. Reuses the
 * canonical segment-boundary values already locked in statsSegments.test.ts
 * (599/600/1199/1200) rather than re-deriving them — this file proves Page 3
 * delegates to those boundaries, it does not re-test the boundary engine.
 */
import { describe, expect, it } from "vitest";
import type { LoggedMatchEvent } from "../../core/stats/saved-match";
import type { MatchEventSegment } from "../../core/stats/stats-event-model";
import { buildQuickReviewSegmentBreakdown } from "./quickReviewSegmentBreakdown";

let nextId = 0;

function e(partial: Partial<LoggedMatchEvent> & Pick<LoggedMatchEvent, "kind" | "teamSide">): LoggedMatchEvent {
  const kind = partial.kind;
  const matchClockSeconds = partial.matchClockSeconds ?? 0;
  const segment: MatchEventSegment =
    partial.segment ?? (matchClockSeconds < 600 ? 1 : matchClockSeconds < 1200 ? 2 : 3);
  return {
    id: `seg-${nextId++}`,
    kind,
    type: kind,
    teamSide: partial.teamSide,
    nx: partial.nx ?? 0.5,
    ny: partial.ny ?? 0.5,
    x: partial.x ?? (partial.nx ?? 0.5) * 100,
    y: partial.y ?? (partial.ny ?? 0.5) * 100,
    half: 1,
    period: "1H",
    timestamp: matchClockSeconds,
    matchClockSeconds,
    createdAt: matchClockSeconds,
    segment,
    restartOwner: partial.restartOwner,
    tags: partial.tags,
  } as LoggedMatchEvent;
}

const HOME = "Home";
const AWAY = "Away";

describe("buildQuickReviewSegmentBreakdown — segment boundaries", () => {
  it("delegates to the canonical deriveSegmentFromPeriodClock boundaries (599/600/1199/1200)", () => {
    const events: LoggedMatchEvent[] = [
      e({ kind: "SHOT", teamSide: "FOR", matchClockSeconds: 0 }),    // Early
      e({ kind: "SHOT", teamSide: "FOR", matchClockSeconds: 599 }),  // Early
      e({ kind: "SHOT", teamSide: "FOR", matchClockSeconds: 600 }),  // Mid
      e({ kind: "SHOT", teamSide: "FOR", matchClockSeconds: 1199 }), // Mid
      e({ kind: "SHOT", teamSide: "FOR", matchClockSeconds: 1200 }), // Late (incl. stoppage — uncapped)
      e({ kind: "SHOT", teamSide: "FOR", matchClockSeconds: 2400 }), // Late (deep stoppage)
    ];
    const model = buildQuickReviewSegmentBreakdown(events, HOME, AWAY, "RIGHT");
    expect(model.segments[0].home.shots).toBe(2); // Early: 0, 599
    expect(model.segments[1].home.shots).toBe(2); // Mid: 600, 1199
    expect(model.segments[2].home.shots).toBe(2); // Late: 1200, 2400
  });

  it("ignores second-half events entirely — Page 3 shows only the completed first half", () => {
    const events: LoggedMatchEvent[] = [
      e({ kind: "SHOT", teamSide: "FOR", matchClockSeconds: 100 }),
      e({ kind: "SHOT", teamSide: "FOR", period: "2H", segment: 4, matchClockSeconds: 100 }),
    ];
    const model = buildQuickReviewSegmentBreakdown(events, HOME, AWAY, "RIGHT");
    const totalShots = model.segments.reduce((s, seg) => s + seg.home.shots, 0);
    expect(totalShots).toBe(1);
  });
});

describe("buildQuickReviewSegmentBreakdown — turnover semantics (canonical mirrored WON/LOST)", () => {
  it("Turnovers Won = own TURNOVER_WON + opposition TURNOVER_LOST; Turnovers Lost = own TURNOVER_LOST + opposition TURNOVER_WON", () => {
    const events: LoggedMatchEvent[] = [
      e({ kind: "TURNOVER_WON", teamSide: "FOR", matchClockSeconds: 10 }),
      e({ kind: "TURNOVER_WON", teamSide: "FOR", matchClockSeconds: 20 }),
      e({ kind: "TURNOVER_LOST", teamSide: "OPP", matchClockSeconds: 30 }),
      e({ kind: "TURNOVER_LOST", teamSide: "FOR", matchClockSeconds: 40 }),
      e({ kind: "TURNOVER_WON", teamSide: "OPP", matchClockSeconds: 50 }),
    ];
    const model = buildQuickReviewSegmentBreakdown(events, HOME, AWAY, "RIGHT");
    const early = model.segments[0];
    // Home (FOR): won = 2 own TURNOVER_WON + 1 opp TURNOVER_LOST = 3
    expect(early.home.turnoversWon).toBe(3);
    // Home (FOR): lost = 1 own TURNOVER_LOST + 1 opp TURNOVER_WON = 2
    expect(early.home.turnoversLost).toBe(2);
    // Away (OPP): won = 1 own TURNOVER_WON + 1 opp(FOR) TURNOVER_LOST = 2
    expect(early.away.turnoversWon).toBe(2);
    // Away (OPP): lost = 1 own TURNOVER_LOST + 2 opp(FOR) TURNOVER_WON = 3
    expect(early.away.turnoversLost).toBe(3);
  });
});

describe("buildQuickReviewSegmentBreakdown — turnover territory orientation", () => {
  // Canonical space after rotation: nx < 0.5 = own half, nx >= 0.5 = opposition half,
  // from the perspective the row is being classified for.
  it("home turnover won near nx=0.2 classifies as Own Half when attacking RIGHT (no rotation needed)", () => {
    const events: LoggedMatchEvent[] = [
      e({ kind: "TURNOVER_WON", teamSide: "FOR", nx: 0.2, matchClockSeconds: 10 }),
    ];
    const model = buildQuickReviewSegmentBreakdown(events, HOME, AWAY, "RIGHT");
    expect(model.segments[0].home.turnoversWonHalf).toEqual({ ownHalf: 1, oppositionHalf: 0 });
  });

  it("the SAME physical event flips to Opposition Half once firstHalfAttackingDirection is LEFT — proving rotation, not a static read", () => {
    const events: LoggedMatchEvent[] = [
      e({ kind: "TURNOVER_WON", teamSide: "FOR", nx: 0.2, matchClockSeconds: 10 }),
    ];
    const model = buildQuickReviewSegmentBreakdown(events, HOME, AWAY, "LEFT");
    expect(model.segments[0].home.turnoversWonHalf).toEqual({ ownHalf: 0, oppositionHalf: 1 });
  });

  it("home turnover won near nx=0.8 classifies as Opposition Half when attacking RIGHT", () => {
    const events: LoggedMatchEvent[] = [
      e({ kind: "TURNOVER_WON", teamSide: "FOR", nx: 0.8, matchClockSeconds: 10 }),
    ];
    const model = buildQuickReviewSegmentBreakdown(events, HOME, AWAY, "RIGHT");
    expect(model.segments[0].home.turnoversWonHalf).toEqual({ ownHalf: 0, oppositionHalf: 1 });
  });

  it("away turnover won is classified using the opposition's OWN attacking direction, not the home team's", () => {
    // Home attacks RIGHT, so home defends the LEFT end (low nx) and OPP defends the
    // RIGHT end (high nx) — OPP attacks LEFT. nx=0.2 is physically near the LEFT end,
    // i.e. near OPP's ATTACKING target, which is OPP's OPPOSITION half, not OPP's own.
    const events: LoggedMatchEvent[] = [
      e({ kind: "TURNOVER_WON", teamSide: "OPP", nx: 0.2, matchClockSeconds: 10 }),
    ];
    const model = buildQuickReviewSegmentBreakdown(events, HOME, AWAY, "RIGHT");
    expect(model.segments[0].away.turnoversWonHalf).toEqual({ ownHalf: 0, oppositionHalf: 1 });
  });

  it("turnovers lost are classified the same way as turnovers won (own rotation primitive, no separate logic)", () => {
    const events: LoggedMatchEvent[] = [
      e({ kind: "TURNOVER_LOST", teamSide: "FOR", nx: 0.9, matchClockSeconds: 10 }),
    ];
    const model = buildQuickReviewSegmentBreakdown(events, HOME, AWAY, "RIGHT");
    expect(model.segments[0].home.turnoversLostHalf).toEqual({ ownHalf: 0, oppositionHalf: 1 });
  });
});

describe("buildQuickReviewSegmentBreakdown — kickout retention (retained / taken)", () => {
  // Mirrors segStats()'s established convention: KICKOUT_WON with
  // teamSide=X means X won it; KICKOUT_CONCEDED with teamSide=X means X's
  // opponent won it (X lost it) — teamSide stays the taking side in both
  // cases, only `kind` encodes the outcome.
  function kickoutEvents(
    taken: number,
    retained: number,
    side: "FOR" | "OPP",
    clockBase = 10,
  ): LoggedMatchEvent[] {
    const out: LoggedMatchEvent[] = [];
    for (let i = 0; i < taken; i++) {
      const won = i < retained;
      out.push(
        e({
          kind: won ? "KICKOUT_WON" : "KICKOUT_CONCEDED",
          teamSide: side,
          restartOwner: side,
          matchClockSeconds: clockBase + i,
        }),
      );
    }
    return out;
  }

  it.each([
    [5, 4, "4/5 (80%)"],
    [6, 5, "5/6 (83%)"],
    [5, 2, "2/5 (40%)"],
    [5, 0, "0/5 (0%)"],
  ] as const)("taken=%s retained=%s -> %s", (taken, retained, expected) => {
    const events = kickoutEvents(taken, retained, "FOR");
    const model = buildQuickReviewSegmentBreakdown(events, HOME, AWAY, "RIGHT");
    expect(model.segments[0].home.ownKORetained.text).toBe(expected);
    expect(model.segments[0].home.ownKORetained.retained).toBe(retained);
    expect(model.segments[0].home.ownKORetained.taken).toBe(taken);
  });

  it('zero kickouts taken renders "—", never "0%"', () => {
    const model = buildQuickReviewSegmentBreakdown([], HOME, AWAY, "RIGHT");
    expect(model.segments[0].home.ownKORetained.text).toBe("—");
    expect(model.segments[0].home.oppKORetained.text).toBe("—");
  });

  it("Own KO Retained and Opposition KO Retained are independent per side", () => {
    const events = [
      ...kickoutEvents(5, 4, "FOR"),
      ...kickoutEvents(6, 3, "OPP", 100),
    ];
    const model = buildQuickReviewSegmentBreakdown(events, HOME, AWAY, "RIGHT");
    expect(model.segments[0].home.ownKORetained.text).toBe("4/5 (80%)");
    expect(model.segments[0].home.oppKORetained.text).toBe("3/6 (50%)");
    // Away's "own" is FOR's "opposition" and vice versa.
    expect(model.segments[0].away.ownKORetained.text).toBe("3/6 (50%)");
    expect(model.segments[0].away.oppKORetained.text).toBe("4/5 (80%)");
  });

  it("uses resolveRestartOwner (restartOwner field), not raw teamSide, to determine who took the kickout", () => {
    // teamSide=OPP (recorder's perspective: opposition conceded) but restartOwner=FOR
    // (home actually took it and lost it) — ownership must follow restartOwner.
    const events: LoggedMatchEvent[] = [
      e({ kind: "KICKOUT_CONCEDED", teamSide: "FOR", restartOwner: "FOR", matchClockSeconds: 10 }),
    ];
    const model = buildQuickReviewSegmentBreakdown(events, HOME, AWAY, "RIGHT");
    expect(model.segments[0].home.ownKORetained.taken).toBe(1);
    expect(model.segments[0].home.ownKORetained.retained).toBe(0);
  });
});

describe("buildQuickReviewSegmentBreakdown — score, shots, wides", () => {
  it("shots include all attempt kinds (matching the established segStats() shot definition); wides count WIDE alone", () => {
    const events: LoggedMatchEvent[] = [
      e({ kind: "GOAL", teamSide: "FOR", matchClockSeconds: 10 }),
      e({ kind: "POINT", teamSide: "FOR", matchClockSeconds: 20 }),
      e({ kind: "WIDE", teamSide: "FOR", matchClockSeconds: 30 }),
      e({ kind: "FREE_SCORED", teamSide: "FOR", matchClockSeconds: 40 }),
      e({ kind: "FREE_MISSED", teamSide: "FOR", matchClockSeconds: 50 }),
    ];
    const model = buildQuickReviewSegmentBreakdown(events, HOME, AWAY, "RIGHT");
    const early = model.segments[0].home;
    expect(early.shots).toBe(5);
    expect(early.wides).toBe(1);
    expect(early.score.text).toBe("1-02"); // 1 goal, 1 point + 1 free scored = 2 points
  });
});
