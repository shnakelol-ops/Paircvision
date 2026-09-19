import type { MovementBoardToken } from "../../movement-board/shell/types";
import type { PremiumPlayerTokenColor } from "../../movement-board/tokens/createPremiumPlayerToken";
import type { VisionV3KitPattern } from "../../engine/pixi/createVisionV3PlayerToken";

/**
 * Game Timing's kit ownership model (locked product decision):
 *   KIT belongs to TEAM — Our Team's outfield players share one kit.
 *   GOALKEEPER may override KIT — independent from Our Team, GK only.
 *   IDENTITY belongs to PLAYER — number/name/nickname, never part of a kit.
 *   MOVEMENT belongs to PLAYER — routes/timing, untouched by any of this.
 *
 * There is no per-outfield-player kit customization. A kit is exactly one
 * base colour + one pattern + one pattern colour, applied to every player
 * in its group at once — never duplicated onto individual tokens as
 * independently-editable state.
 */
export type TeamKit = {
  baseColor: PremiumPlayerTokenColor;
  pattern: VisionV3KitPattern;
  patternColor: PremiumPlayerTokenColor;
};

export type TeamKitSet = {
  ourTeamKit: TeamKit;
  /** undefined = no override, goalkeeper wears Our Team's kit. */
  goalkeeperKit?: TeamKit;
  bibKit: TeamKit;
};

// Matches buildDefaultTokens() (movement-board/tokens/default-tokens.ts),
// the actual "fresh board" reference: red outfield, yellow goalkeeper. Bib
// default (yellow) matches the pre-existing bibColor useState default this
// replaces — coincidentally the same yellow as the goalkeeper default; both
// values predate this change and are preserved as-is, not redesigned here.
export const DEFAULT_OUR_TEAM_KIT: TeamKit = { baseColor: "red", pattern: "plain", patternColor: "white" };
export const DEFAULT_GOALKEEPER_KIT: TeamKit = { baseColor: "yellow", pattern: "plain", patternColor: "white" };
export const DEFAULT_BIB_KIT: TeamKit = { baseColor: "yellow", pattern: "plain", patternColor: "white" };

/**
 * "Opposition" for kit purposes is the union of Game Timing's two existing,
 * independent concepts — team === "away" and playerRole === "bib" — never
 * changed or merged by this file, only read. Matches the pre-existing
 * "Bib Players" colour swatch's own targeting (playerRole === "bib") plus
 * the away-team concept the UI doesn't currently expose a live control for.
 */
export function isOppositionToken(token: Pick<MovementBoardToken, "team" | "playerRole">): boolean {
  return token.team === "away" || token.playerRole === "bib";
}

/**
 * Goalkeeper detection uses the one existing convention already in the
 * codebase — jersey #1 — the same rule buildDefaultTokens() already uses to
 * pick the default GK colour, and the Gaelic-football convention Standard
 * Slate's own formation tables follow. Scoped to Our Team only: an
 * opposition/bib #1 is not "the" goalkeeper for kit purposes (opposition
 * has no GK override slot — see product decision above). Does not read or
 * alter player id.
 */
export function isGoalkeeperToken(token: Pick<MovementBoardToken, "team" | "playerRole" | "number">): boolean {
  return !isOppositionToken(token) && token.number === 1;
}

/** Which kit a given token should currently be wearing. */
export function resolveTokenKit(
  token: Pick<MovementBoardToken, "team" | "playerRole" | "number">,
  kits: TeamKitSet,
): TeamKit {
  if (isOppositionToken(token)) return kits.bibKit;
  if (isGoalkeeperToken(token)) return kits.goalkeeperKit ?? kits.ourTeamKit;
  return kits.ourTeamKit;
}

/**
 * Legacy-scenario upgrade path: a scenario saved before team kits existed
 * has no ourTeamKit/goalkeeperKit/bibKit at all. Rather than reset the
 * coach's board to a generic default, seed the new team-level kit from
 * whichever colour their existing tokens already show (pattern/pattern
 * colour default to plain/white, since no per-token pattern existed to
 * read back before this feature). Falls back to `fallback` only when no
 * matching token exists at all (e.g. a legacy Our Team of zero players).
 */
export function deriveLegacyTeamKit(
  tokens: readonly MovementBoardToken[],
  predicate: (token: MovementBoardToken) => boolean,
  fallback: TeamKit,
): TeamKit {
  const match = tokens.find(predicate);
  return match ? { baseColor: match.color, pattern: "plain", patternColor: "white" } : fallback;
}

/**
 * Re-derives every token's rendered kit fields (color/kitPattern/
 * kitPatternColor) from the current team-kit state. This is the single
 * place kit state ever reaches a token — never a per-player edit. Pure:
 * returns a new array, never mutates `tokens`, and touches only the three
 * kit-appearance fields — id, number, label, position, team, playerRole,
 * draggable, isGhost all pass through completely untouched, so this can be
 * called freely (on kit change, on scenario load, after adding players)
 * without risk to identity, routes, or any other state keyed by token id.
 */
export function applyTeamKitsToTokens(
  tokens: readonly MovementBoardToken[],
  kits: TeamKitSet,
): MovementBoardToken[] {
  return tokens.map((token) => {
    const kit = resolveTokenKit(token, kits);
    return { ...token, color: kit.baseColor, kitPattern: kit.pattern, kitPatternColor: kit.patternColor };
  });
}
