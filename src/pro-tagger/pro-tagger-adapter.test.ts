import { describe, expect, it } from "vitest";
import { adaptProTaggerAction } from "./pro-tagger-adapter";
import { analyseChains } from "../stats/chains/chain-engine";

const BASE = {
  nx: 0.5,
  ny: 0.5,
  half: 1 as const,
  matchClockSeconds: 100,
};

describe("KICKOUT_CONCEDED fix — resolveRestartOutcome for RESTART", () => {
  it("FOR taps its own restart, owner FOR: KICKOUT_WON, teamSide FOR (unchanged behaviour)", () => {
    const event = adaptProTaggerAction({
      ...BASE,
      familyId: "RESTART",
      tileLabel: "Clean",
      teamSide: "FOR",
      restartOwner: "FOR",
    });
    expect(event.kind).toBe("KICKOUT_WON");
    expect(event.teamSide).toBe("FOR");
  });

  it("OPP taps its own restart, owner OPP: KICKOUT_WON, teamSide OPP (unchanged behaviour)", () => {
    const event = adaptProTaggerAction({
      ...BASE,
      familyId: "RESTART",
      tileLabel: "Clean",
      teamSide: "OPP",
      restartOwner: "OPP",
    });
    expect(event.kind).toBe("KICKOUT_WON");
    expect(event.teamSide).toBe("OPP");
  });

  it("FOR wins the ball from an OPP-owned restart: KICKOUT_CONCEDED, teamSide OPP (the conceding side)", () => {
    const event = adaptProTaggerAction({
      ...BASE,
      familyId: "RESTART",
      tileLabel: "Break",
      teamSide: "FOR",
      restartOwner: "OPP",
    });
    expect(event.kind).toBe("KICKOUT_CONCEDED");
    expect(event.teamSide).toBe("OPP");
    expect(event.restartOwner).toBe("OPP");
  });

  it("OPP wins the ball from a FOR-owned restart: KICKOUT_CONCEDED, teamSide FOR (the conceding side)", () => {
    const event = adaptProTaggerAction({
      ...BASE,
      familyId: "RESTART",
      tileLabel: "Foul",
      teamSide: "OPP",
      restartOwner: "FOR",
    });
    expect(event.kind).toBe("KICKOUT_CONCEDED");
    expect(event.teamSide).toBe("FOR");
    expect(event.restartOwner).toBe("FOR");
  });

  it("restartOwner omitted falls back to the tapped row (today's always-WON behaviour)", () => {
    const event = adaptProTaggerAction({
      ...BASE,
      familyId: "RESTART",
      tileLabel: "Clean",
      teamSide: "FOR",
    });
    expect(event.kind).toBe("KICKOUT_WON");
    expect(event.teamSide).toBe("FOR");
  });
});

describe("TURNOVER_LOST fix", () => {
  it("FOR wins a turnover: TURNOVER_WON, teamSide FOR (unchanged behaviour)", () => {
    const event = adaptProTaggerAction({
      ...BASE,
      familyId: "TURNOVER",
      tileLabel: "Tackle",
      teamSide: "FOR",
    });
    expect(event.kind).toBe("TURNOVER_WON");
    expect(event.teamSide).toBe("FOR");
  });

  it("OPP wins a turnover (FOR loses it): TURNOVER_LOST, teamSide FOR — not TURNOVER_WON/OPP", () => {
    const event = adaptProTaggerAction({
      ...BASE,
      familyId: "TURNOVER",
      tileLabel: "Tackle",
      teamSide: "OPP",
    });
    expect(event.kind).toBe("TURNOVER_LOST");
    expect(event.teamSide).toBe("FOR");
  });

  it("preserves the tapped cause tag on both rows", () => {
    const won = adaptProTaggerAction({ ...BASE, familyId: "TURNOVER", tileLabel: "Interception", teamSide: "FOR" });
    const lost = adaptProTaggerAction({ ...BASE, familyId: "TURNOVER", tileLabel: "Overcarried", teamSide: "OPP" });
    expect(won.tags).toEqual(["INTERCEPTION"]);
    expect(lost.tags).toEqual(["OVERCARRIED"]);
  });
});

describe("Interception — tag only, no new kind", () => {
  it("Interception on the FOR row is still kind TURNOVER_WON with a plain tag", () => {
    const event = adaptProTaggerAction({
      ...BASE,
      familyId: "TURNOVER",
      tileLabel: "Interception",
      teamSide: "FOR",
    });
    expect(event.kind).toBe("TURNOVER_WON");
    expect(event.tags).toEqual(["INTERCEPTION"]);
  });
});

describe("45/65 restart award", () => {
  it("FOR wins its own 45/65: FORTY_FIVE_WON, teamSide FOR", () => {
    const event = adaptProTaggerAction({
      ...BASE,
      familyId: "FORTY_FIVE",
      tileLabel: "Won",
      teamSide: "FOR",
      restartOwner: "FOR",
    });
    expect(event.kind).toBe("FORTY_FIVE_WON");
    expect(event.teamSide).toBe("FOR");
  });

  it("OPP wins the ball from a FOR-owned 45/65: FORTY_FIVE_CONCEDED, teamSide FOR (the conceding side)", () => {
    const event = adaptProTaggerAction({
      ...BASE,
      familyId: "FORTY_FIVE",
      tileLabel: "Won",
      teamSide: "OPP",
      restartOwner: "FOR",
    });
    expect(event.kind).toBe("FORTY_FIVE_CONCEDED");
    expect(event.teamSide).toBe("FOR");
  });

  it("is a distinct fact from a shot's existing 45 tag — different kind entirely, never produced by the scoring families", () => {
    const restartAward = adaptProTaggerAction({
      ...BASE,
      familyId: "FORTY_FIVE",
      tileLabel: "Won",
      teamSide: "FOR",
      restartOwner: "FOR",
    });
    const shotFrom45 = adaptProTaggerAction({
      ...BASE,
      familyId: "POINT",
      tileLabel: "45",
      teamSide: "FOR",
    });
    expect(restartAward.kind).toBe("FORTY_FIVE_WON");
    expect(shotFrom45.kind).toBe("POINT");
    expect(shotFrom45.tags).toEqual(["45"]);
    expect(restartAward.kind).not.toBe(shotFrom45.kind);
  });
});

describe("Sideline restart award", () => {
  it("FOR wins its own sideline: SIDELINE_WON, teamSide FOR", () => {
    const event = adaptProTaggerAction({
      ...BASE,
      familyId: "SIDELINE",
      tileLabel: "Won",
      teamSide: "FOR",
      restartOwner: "FOR",
    });
    expect(event.kind).toBe("SIDELINE_WON");
    expect(event.teamSide).toBe("FOR");
  });

  it("OPP wins the ball from a FOR-owned sideline: SIDELINE_CONCEDED, teamSide FOR", () => {
    const event = adaptProTaggerAction({
      ...BASE,
      familyId: "SIDELINE",
      tileLabel: "Won",
      teamSide: "OPP",
      restartOwner: "FOR",
    });
    expect(event.kind).toBe("SIDELINE_CONCEDED");
    expect(event.teamSide).toBe("FOR");
  });
});

describe("Discipline", () => {
  const cases: Array<["Yellow" | "Sin Bin" | "Red", "YELLOW_CARD" | "SIN_BIN" | "RED_CARD"]> = [
    ["Yellow", "YELLOW_CARD"],
    ["Sin Bin", "SIN_BIN"],
    ["Red", "RED_CARD"],
  ];

  for (const [tileLabel, expectedKind] of cases) {
    it(`${tileLabel} on the FOR row records team, kind ${expectedKind}, no derivation`, () => {
      const event = adaptProTaggerAction({
        ...BASE,
        familyId: "DISCIPLINE",
        tileLabel,
        teamSide: "FOR",
        playerId: "p1",
        playerName: "J. Murphy",
        playerNumber: 6,
        squadId: "home-squad",
      });
      expect(event.kind).toBe(expectedKind);
      expect(event.teamSide).toBe("FOR");
      expect(event.playerId).toBe("p1");
      expect(event.playerName).toBe("J. Murphy");
      expect(event.playerNumber).toBe(6);
    });

    it(`${tileLabel} on the OPP row records the opposition team, kind ${expectedKind}`, () => {
      const event = adaptProTaggerAction({
        ...BASE,
        familyId: "DISCIPLINE",
        tileLabel,
        teamSide: "OPP",
      });
      expect(event.kind).toBe(expectedKind);
      expect(event.teamSide).toBe("OPP");
    });
  }

  it("Sin Bin is a distinct kind from Yellow, not an alias", () => {
    const yellow = adaptProTaggerAction({ ...BASE, familyId: "DISCIPLINE", tileLabel: "Yellow", teamSide: "FOR" });
    const sinBin = adaptProTaggerAction({ ...BASE, familyId: "DISCIPLINE", tileLabel: "Sin Bin", teamSide: "FOR" });
    expect(yellow.kind).not.toBe(sinBin.kind);
    expect(sinBin.kind).toBe("SIN_BIN");
  });

  it("carries a real match timestamp, matching the tapped pitch location and clock", () => {
    const event = adaptProTaggerAction({
      nx: 0.6, ny: 0.4, half: 2, matchClockSeconds: 2838, // 47:18
      familyId: "DISCIPLINE",
      tileLabel: "Sin Bin",
      teamSide: "FOR",
    });
    expect(event.matchClockSeconds).toBe(2838);
    expect(event.half).toBe(2);
    expect(event.nx).toBeCloseTo(0.6);
    expect(event.ny).toBeCloseTo(0.4);
  });
});

describe("End-to-end: the fix actually makes KICKOUT_LOST_TO_SCORE_AGAINST fire", () => {
  it("FOR's own kickout conceded, opposition scores within 90s → the rule fires against FOR", () => {
    const conceded = adaptProTaggerAction({
      nx: 0.5, ny: 0.1, half: 1, matchClockSeconds: 500,
      familyId: "RESTART",
      tileLabel: "Foul",
      teamSide: "OPP",       // OPP wins the ball back
      restartOwner: "FOR",   // it was FOR's own restart
    });
    const scoreAgainst = adaptProTaggerAction({
      nx: 0.85, ny: 0.5, half: 1, matchClockSeconds: 530,
      familyId: "POINT",
      tileLabel: "Play",
      teamSide: "OPP",       // opposition capitalises
    });

    expect(conceded.kind).toBe("KICKOUT_CONCEDED");
    expect(conceded.teamSide).toBe("FOR");

    const analysis = analyseChains([conceded, scoreAgainst]);
    const matches = analysis.byRule["KICKOUT_LOST_TO_SCORE_AGAINST"] ?? [];
    expect(matches.length).toBe(1);
  });

  it("a cleanly won kickout followed by our own score does not fire the lost-to-score-against rule", () => {
    const won = adaptProTaggerAction({
      nx: 0.5, ny: 0.1, half: 1, matchClockSeconds: 500,
      familyId: "RESTART",
      tileLabel: "Clean",
      teamSide: "FOR",
      restartOwner: "FOR",
    });
    const ourScore = adaptProTaggerAction({
      nx: 0.85, ny: 0.5, half: 1, matchClockSeconds: 530,
      familyId: "POINT",
      tileLabel: "Play",
      teamSide: "FOR",
    });

    const analysis = analyseChains([won, ourScore]);
    const matches = analysis.byRule["KICKOUT_LOST_TO_SCORE_AGAINST"] ?? [];
    expect(matches.length).toBe(0);
  });
});

describe("Existing families unaffected", () => {
  it("GOAL/POINT/TWO_POINT/SHOT/WIDE pass teamSide straight through, unchanged", () => {
    for (const familyId of ["GOAL", "POINT", "SHOT", "WIDE"] as const) {
      const forEvent = adaptProTaggerAction({ ...BASE, familyId, tileLabel: "Play", teamSide: "FOR" });
      const oppEvent = adaptProTaggerAction({ ...BASE, familyId, tileLabel: "Play", teamSide: "OPP" });
      expect(forEvent.kind).toBe(familyId);
      expect(forEvent.teamSide).toBe("FOR");
      expect(oppEvent.teamSide).toBe("OPP");
    }
  });

  it("TWO_POINT still resolves the 45 tag to FORTY_FIVE_TWO_POINT, distinct from the new restart-award kind", () => {
    const event = adaptProTaggerAction({ ...BASE, familyId: "TWO_POINT", tileLabel: "45", teamSide: "FOR" });
    expect(event.kind).toBe("FORTY_FIVE_TWO_POINT");
  });

  it("FREE Won/Conceded still hardcode teamSide FOR regardless of the tapped row", () => {
    const won = adaptProTaggerAction({ ...BASE, familyId: "FREE", tileLabel: "Won", teamSide: "FOR" });
    const conceded = adaptProTaggerAction({ ...BASE, familyId: "FREE", tileLabel: "Conceded", teamSide: "FOR" });
    expect(won.kind).toBe("FREE_WON");
    expect(won.teamSide).toBe("FOR");
    expect(conceded.kind).toBe("FREE_CONCEDED");
    expect(conceded.teamSide).toBe("FOR");
  });
});
