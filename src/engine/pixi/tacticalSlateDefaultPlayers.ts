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

/**
 * Normalised pitch coords [0,100].
 *
 * Coach tactical-board view (own goal at low x, attack toward high x):
 *   - Lower y = right side of the pitch
 *   - Higher y = left side of the pitch
 *
 * Conventional Gaelic numbering from that view:
 *   even jerseys (#2/#5/#10/#13) on the LEFT (higher y)
 *   odd wing jerseys (#4/#7/#12/#15) on the RIGHT (lower y)
 *   centres (#1/#3/#6/#11/#14) and midfield (#8/#9) stay on the spine
 *
 * Do not "fix" left/right by patching callers — edit this table only.
 */
export const TACTICAL_SLATE_GAELIC_FORMATION_BASE: ReadonlyArray<TacticalSlateFormationPoint> = [
  { number: 1, x: 8, y: 50 },
  { number: 2, x: 20, y: 78 },
  { number: 3, x: 20, y: 50 },
  { number: 4, x: 20, y: 22 },
  { number: 5, x: 34, y: 82 },
  { number: 6, x: 34, y: 50 },
  { number: 7, x: 34, y: 18 },
  { number: 8, x: 48, y: 38 },
  { number: 9, x: 48, y: 62 },
  { number: 10, x: 62, y: 82 },
  { number: 11, x: 62, y: 50 },
  { number: 12, x: 62, y: 18 },
  { number: 13, x: 78, y: 75 },
  { number: 14, x: 78, y: 50 },
  { number: 15, x: 78, y: 25 },
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

/**
 * Merge a team's selected jersey numbers into its live roster.
 *
 * A player already on the team (matched by jersey number) keeps their exact
 * existing record — live position, kit customization, label mode,
 * name/initials — completely untouched. Only a number with no existing
 * player gets a fresh default Gaelic formation seed. A number no longer in
 * `numbers` is dropped (removed) as before.
 *
 * This is what the jersey-number toggle/fill/clear controls use so that
 * changing one number never resets the rest of an already-positioned team
 * back to formation defaults.
 */
export function mergeTacticalSlateTeamRoster(
  team: TacticalSlateTeamSide,
  numbers: ReadonlyArray<number>,
  existingTeamPlayers: ReadonlyArray<Record<string, unknown>>,
  teamColor: string,
): Array<Record<string, unknown>> {
  const existingByNumber = new Map<number, Record<string, unknown>>();
  for (const player of existingTeamPlayers) {
    if (typeof player.number === "number") {
      existingByNumber.set(player.number, player);
    }
  }
  return createTacticalSlateTeamFormationSeeds(team, numbers).map((seed) => {
    const existing = existingByNumber.get(seed.number);
    if (existing) return existing;
    return {
      id: seed.id,
      number: seed.number,
      team: seed.team,
      teamColor,
      x: seed.position.x,
      y: seed.position.y,
    };
  });
}
