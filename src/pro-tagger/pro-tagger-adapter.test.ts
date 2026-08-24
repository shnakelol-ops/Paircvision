import { describe, expect, it } from "vitest";
import { adaptProTaggerAction, adaptProTaggerDisciplineAction } from "./pro-tagger-adapter";

describe("45/65 and Sideline restart facts — team attribution both sides", () => {
  it("Home taps 45 -> Won: FOR wins the restart", () => {
    const event = adaptProTaggerAction({
      familyId: "FORTY_FIVE",
      tileLabel: "Won",
      teamSide: "FOR",
      nx: 0.5,
      ny: 0.9,
      half: 1,
      matchClockSeconds: 100,
    });
    expect(event.kind).toBe("FORTY_FIVE_WON");
    expect(event.teamSide).toBe("FOR");
    expect(event.team).toBe("HOME");
  });

  it("Home taps 45 -> Conceded: the opposition is awarded the 45 because of Home's action (FOR/CONCEDED)", () => {
    const event = adaptProTaggerAction({
      familyId: "FORTY_FIVE",
      tileLabel: "Conceded",
      teamSide: "FOR",
      nx: 0.5,
      ny: 0.9,
      half: 1,
      matchClockSeconds: 100,
    });
    expect(event.kind).toBe("FORTY_FIVE_CONCEDED");
    expect(event.teamSide).toBe("FOR");
  });

  it("Away taps 45 -> Won: OPP wins the restart", () => {
    const event = adaptProTaggerAction({
      familyId: "FORTY_FIVE",
      tileLabel: "Won",
      teamSide: "OPP",
      nx: 0.5,
      ny: 0.9,
      half: 1,
      matchClockSeconds: 100,
    });
    expect(event.kind).toBe("FORTY_FIVE_WON");
    expect(event.teamSide).toBe("OPP");
    expect(event.team).toBe("AWAY");
  });

  it("Away taps 45 -> Conceded: OPP conceded", () => {
    const event = adaptProTaggerAction({
      familyId: "FORTY_FIVE",
      tileLabel: "Conceded",
      teamSide: "OPP",
      nx: 0.5,
      ny: 0.9,
      half: 1,
      matchClockSeconds: 100,
    });
    expect(event.kind).toBe("FORTY_FIVE_CONCEDED");
    expect(event.teamSide).toBe("OPP");
  });

  it("Sideline follows the identical Won/Conceded x FOR/OPP pattern", () => {
    const homeWon = adaptProTaggerAction({
      familyId: "SIDELINE", tileLabel: "Won", teamSide: "FOR",
      nx: 0.5, ny: 0.5, half: 1, matchClockSeconds: 50,
    });
    const awayWon = adaptProTaggerAction({
      familyId: "SIDELINE", tileLabel: "Won", teamSide: "OPP",
      nx: 0.5, ny: 0.5, half: 1, matchClockSeconds: 50,
    });
    expect(homeWon.kind).toBe("SIDELINE_WON");
    expect(homeWon.teamSide).toBe("FOR");
    expect(awayWon.kind).toBe("SIDELINE_WON");
    expect(awayWon.teamSide).toBe("OPP");
  });

  it("a 45/65 restart-won event is a distinct fact from a SHOT-family event tagged with the 45 shot-origin tag", () => {
    // Existing behaviour: SHOT family's "45" tile records a shot taken from a
    // 45 (shot-origin), tagged via `tags`. Must remain kind SHOT with tag 45.
    const shotFrom45 = adaptProTaggerAction({
      familyId: "SHOT", tileLabel: "45", teamSide: "FOR",
      nx: 0.5, ny: 0.9, half: 1, matchClockSeconds: 30,
    });
    expect(shotFrom45.kind).toBe("SHOT");
    expect(shotFrom45.tags).toEqual(["45"]);

    // New behaviour: FORTY_FIVE family's "Won" tile records that the restart
    // itself was earned — a different fact, never combined with the above.
    const restartWon = adaptProTaggerAction({
      familyId: "FORTY_FIVE", tileLabel: "Won", teamSide: "FOR",
      nx: 0.5, ny: 0.9, half: 1, matchClockSeconds: 30,
    });
    expect(restartWon.kind).toBe("FORTY_FIVE_WON");
    expect(restartWon.kind).not.toBe(shotFrom45.kind);
  });

  it("existing GOAL/POINT/WIDE 45-tag shot-origin behaviour is unchanged", () => {
    for (const familyId of ["GOAL", "POINT", "WIDE"] as const) {
      const event = adaptProTaggerAction({
        familyId, tileLabel: "45", teamSide: "FOR",
        nx: 0.5, ny: 0.9, half: 1, matchClockSeconds: 30,
      });
      expect(event.kind).toBe(familyId);
      expect(event.tags).toEqual(["45"]);
    }
  });
});

describe("existing Free behaviour is unchanged (byte-for-byte)", () => {
  it("FREE Won always resolves to FREE_WON with teamSide FOR, regardless of the row tapped", () => {
    const fromForRow = adaptProTaggerAction({
      familyId: "FREE", tileLabel: "Won", teamSide: "FOR",
      nx: 0.5, ny: 0.5, half: 1, matchClockSeconds: 10,
    });
    expect(fromForRow.kind).toBe("FREE_WON");
    expect(fromForRow.teamSide).toBe("FOR");
  });

  it("FREE Conceded always resolves to FREE_CONCEDED with teamSide FOR", () => {
    const event = adaptProTaggerAction({
      familyId: "FREE", tileLabel: "Conceded", teamSide: "FOR",
      nx: 0.5, ny: 0.5, half: 1, matchClockSeconds: 10,
    });
    expect(event.kind).toBe("FREE_CONCEDED");
    expect(event.teamSide).toBe("FOR");
  });
});

describe("Discipline — Yellow / Sin Bin / Red", () => {
  const cardKinds = ["YELLOW_CARD", "SIN_BIN", "RED_CARD"] as const;

  for (const cardKind of cardKinds) {
    it(`${cardKind} records team, player and match timestamp for the home side`, () => {
      const event = adaptProTaggerDisciplineAction({
        cardKind,
        teamSide: "FOR",
        half: 2,
        matchClockSeconds: 47 * 60 + 18, // 47:18
        playerId: "p-1",
        playerName: "J. Murphy",
        playerNumber: 6,
        squadId: "home-squad",
      });
      expect(event.kind).toBe(cardKind);
      expect(event.teamSide).toBe("FOR");
      expect(event.team).toBe("HOME");
      expect(event.playerId).toBe("p-1");
      expect(event.playerName).toBe("J. Murphy");
      expect(event.playerNumber).toBe(6);
      expect(event.matchClockSeconds).toBe(47 * 60 + 18);
      expect(event.half).toBe(2);
    });

    it(`${cardKind} records the away side correctly`, () => {
      const event = adaptProTaggerDisciplineAction({
        cardKind,
        teamSide: "OPP",
        half: 1,
        matchClockSeconds: 600,
        playerId: "p-2",
        playerName: "S. Byrne",
        playerNumber: 11,
        squadId: "away-squad",
      });
      expect(event.kind).toBe(cardKind);
      expect(event.teamSide).toBe("OPP");
      expect(event.team).toBe("AWAY");
      expect(event.playerId).toBe("p-2");
    });
  }

  it("Sin Bin is a distinct sanction kind from Yellow (not an alias)", () => {
    const yellow = adaptProTaggerDisciplineAction({
      cardKind: "YELLOW_CARD", teamSide: "FOR", half: 1, matchClockSeconds: 100,
    });
    const sinBin = adaptProTaggerDisciplineAction({
      cardKind: "SIN_BIN", teamSide: "FOR", half: 1, matchClockSeconds: 100,
    });
    expect(yellow.kind).not.toBe(sinBin.kind);
  });

  it("omits optional player fields when no player is selected, without throwing", () => {
    const event = adaptProTaggerDisciplineAction({
      cardKind: "RED_CARD",
      teamSide: "FOR",
      half: 1,
      matchClockSeconds: 200,
    });
    expect(event.kind).toBe("RED_CARD");
    expect(event.playerId).toBeUndefined();
  });
});
