import { describe, expect, it } from "vitest";

import {
  createTacticalSlateDefaultPlayerSeeds,
  createTacticalSlateTeamFormationSeeds,
  getTacticalSlateGaelicFormationPos,
  mergeTacticalSlateTeamRoster,
  TACTICAL_SLATE_FULL_TEAM_NUMBERS,
  TACTICAL_SLATE_GAELIC_FORMATION_BASE,
} from "./tacticalSlateDefaultPlayers";

describe("tacticalSlateDefaultPlayers", () => {
  it("places exactly Team A 1–15 and no Team B players", () => {
    const seeds = createTacticalSlateDefaultPlayerSeeds();
    expect(seeds).toHaveLength(15);
    expect(seeds.every((seed) => seed.team === "BLUE")).toBe(true);
    expect(seeds.map((seed) => seed.number)).toEqual([...TACTICAL_SLATE_FULL_TEAM_NUMBERS]);
    expect(seeds.map((seed) => seed.id)).toEqual(
      TACTICAL_SLATE_FULL_TEAM_NUMBERS.map((number) => `B${number}`),
    );
  });

  it("uses the canonical Gaelic formation coordinates for Team A", () => {
    const seeds = createTacticalSlateDefaultPlayerSeeds();
    for (const base of TACTICAL_SLATE_GAELIC_FORMATION_BASE) {
      const seed = seeds.find((entry) => entry.number === base.number);
      expect(seed?.position).toEqual({ x: base.x, y: base.y });
    }
  });

  it("keeps even wing jerseys on the left (higher y) and odd wings on the right", () => {
    const byNumber = new Map(
      TACTICAL_SLATE_GAELIC_FORMATION_BASE.map((point) => [point.number, point] as const),
    );
    const leftRightPairs: ReadonlyArray<readonly [number, number]> = [
      [2, 4],
      [5, 7],
      [10, 12],
      [13, 15],
    ];
    for (const [leftEven, rightOdd] of leftRightPairs) {
      const left = byNumber.get(leftEven);
      const right = byNumber.get(rightOdd);
      expect(left, `missing #${leftEven}`).toBeTruthy();
      expect(right, `missing #${rightOdd}`).toBeTruthy();
      expect(left!.x).toBe(right!.x);
      expect(left!.y).toBeGreaterThan(right!.y);
    }
    for (const centre of [1, 3, 6, 11, 14] as const) {
      expect(byNumber.get(centre)?.y).toBe(50);
    }
  });

  it("mirrors Team B formation across the pitch midline", () => {
    const home = getTacticalSlateGaelicFormationPos("BLUE", 14);
    const away = getTacticalSlateGaelicFormationPos("RED", 14);
    expect(away).toEqual({ x: 100 - home.x, y: home.y });
  });

  it("builds a partial Team B formation without inventing Team A players", () => {
    const seeds = createTacticalSlateTeamFormationSeeds("RED", [1, 14]);
    expect(seeds).toEqual([
      { id: "R1", number: 1, team: "RED", position: getTacticalSlateGaelicFormationPos("RED", 1) },
      { id: "R14", number: 14, team: "RED", position: getTacticalSlateGaelicFormationPos("RED", 14) },
    ]);
  });

  describe("mergeTacticalSlateTeamRoster", () => {
    it("preserves existing players' exact live coordinates when an unrelated number toggles on", () => {
      const existing = [
        { id: "B1", number: 1, team: "BLUE" as const, teamColor: "blue", x: 41, y: 63 },
        { id: "B3", number: 3, team: "BLUE" as const, teamColor: "blue", x: 12.5, y: 88.25 },
      ];
      // Toggling #6 on: #1 and #3 already exist and must not move.
      const result = mergeTacticalSlateTeamRoster("BLUE", [1, 3, 6], existing, "blue");
      const byNumber = new Map(result.map((p) => [p.number as number, p]));
      expect(byNumber.get(1)).toEqual(existing[0]);
      expect(byNumber.get(3)).toEqual(existing[1]);
      // The newly-added number gets a fresh default formation seed.
      const added = byNumber.get(6);
      expect(added).toEqual({
        id: "B6",
        number: 6,
        team: "BLUE",
        teamColor: "blue",
        x: getTacticalSlateGaelicFormationPos("BLUE", 6).x,
        y: getTacticalSlateGaelicFormationPos("BLUE", 6).y,
      });
    });

    it("preserves kit/label/name customization on an untouched existing player", () => {
      const existing = [
        {
          id: "R9",
          number: 9,
          team: "RED" as const,
          teamColor: "red",
          x: 55,
          y: 30,
          kitBaseColor: "amber",
          labelMode: "name" as const,
          name: "O'Sullivan",
        },
      ];
      const result = mergeTacticalSlateTeamRoster("RED", [9, 2], existing, "red");
      const nine = result.find((p) => p.number === 9);
      expect(nine).toEqual(existing[0]);
    });

    it("drops a number that is no longer selected", () => {
      const existing = [
        { id: "B1", number: 1, team: "BLUE" as const, teamColor: "blue", x: 41, y: 63 },
        { id: "B2", number: 2, team: "BLUE" as const, teamColor: "blue", x: 20, y: 78 },
      ];
      const result = mergeTacticalSlateTeamRoster("BLUE", [1], existing, "blue");
      expect(result.map((p) => p.number)).toEqual([1]);
    });

    it("produces the same result as a fresh formation build when no players pre-exist", () => {
      const result = mergeTacticalSlateTeamRoster("BLUE", [1, 14], [], "blue");
      expect(result).toEqual([
        {
          id: "B1",
          number: 1,
          team: "BLUE",
          teamColor: "blue",
          x: getTacticalSlateGaelicFormationPos("BLUE", 1).x,
          y: getTacticalSlateGaelicFormationPos("BLUE", 1).y,
        },
        {
          id: "B14",
          number: 14,
          team: "BLUE",
          teamColor: "blue",
          x: getTacticalSlateGaelicFormationPos("BLUE", 14).x,
          y: getTacticalSlateGaelicFormationPos("BLUE", 14).y,
        },
      ]);
    });
  });
});
