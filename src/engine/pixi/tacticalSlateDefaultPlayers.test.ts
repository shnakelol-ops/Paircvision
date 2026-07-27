import { describe, expect, it } from "vitest";

import {
  createTacticalSlateDefaultPlayerSeeds,
  createTacticalSlateTeamFormationSeeds,
  getTacticalSlateGaelicFormationPos,
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
});
