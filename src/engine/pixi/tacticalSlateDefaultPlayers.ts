/**
 * Canonical Tactical Slate default player placement.
 *
 * Single source of truth for:
 * - first launch of a new Slate board
 * - New Board / pristine restore
 * - Fill 15 formation geometry (via getTacticalSlateGaelicFormationPos)
 *
 * Team A opens in the standard Gaelic 15. Team B is empty.
 * Saved-board load paths must not use this factory when players are present.
 */

export type TacticalSlateTeamSide = "BLUE" | "RED";

export type TacticalSlateFormationPoint = {
  number: number;
  x: number;
  y: number;
};

/** Normalised pitch coords [0,100]. Same geometry Fill 15 has always used on Slate. */
export const TACTICAL_SLATE_GAELIC_FORMATION_BASE: ReadonlyArray<TacticalSlateFormationPoint> = [
  { number: 1, x: 8, y: 50 },
  { number: 2, x: 20, y: 22 },
  { number: 3, x: 20, y: 50 },
  { number: 4, x: 20, y: 78 },
  { number: 5, x: 34, y: 18 },
  { number: 6, x: 34, y: 50 },
  { number: 7, x: 34, y: 82 },
  { number: 8, x: 48, y: 38 },
  { number: 9, x: 48, y: 62 },
  { number: 10, x: 62, y: 18 },
  { number: 11, x: 62, y: 50 },
  { number: 12, x: 62, y: 82 },
  { number: 13, x: 78, y: 25 },
  { number: 14, x: 78, y: 50 },
  { number: 15, x: 78, y: 75 },
];

export const TACTICAL_SLATE_FULL_TEAM_NUMBERS: ReadonlyArray<number> = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
];

export type TacticalSlateDefaultPlayerSeed = {
  id: string;
  number: number;
  team: TacticalSlateTeamSide;
  position: { x: number; y: number };
};

export function getTacticalSlateGaelicFormationPos(
  team: TacticalSlateTeamSide,
  number: number,
): { x: number; y: number } {
  const base = TACTICAL_SLATE_GAELIC_FORMATION_BASE.find((point) => point.number === number);
  if (!base) {
    return { x: team === "BLUE" ? 30 : 70, y: 50 };
  }
  return team === "RED" ? { x: 100 - base.x, y: base.y } : { x: base.x, y: base.y };
}

export function createTacticalSlateTeamFormationSeeds(
  team: TacticalSlateTeamSide,
  numbers: ReadonlyArray<number>,
): TacticalSlateDefaultPlayerSeed[] {
  const prefix = team === "RED" ? "R" : "B";
  return [...numbers]
    .filter((number) => Number.isFinite(number) && number >= 1 && number <= 15)
    .sort((a, b) => a - b)
    .map((number) => {
      const position = getTacticalSlateGaelicFormationPos(team, number);
      return {
        id: `${prefix}${number}`,
        number,
        team,
        position: { x: position.x, y: position.y },
      };
    });
}

/** Canonical new-board roster: Team A × 15 Gaelic formation, Team B empty. */
export function createTacticalSlateDefaultPlayerSeeds(): TacticalSlateDefaultPlayerSeed[] {
  return createTacticalSlateTeamFormationSeeds("BLUE", TACTICAL_SLATE_FULL_TEAM_NUMBERS);
}
