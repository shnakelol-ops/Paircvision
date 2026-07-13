/**
 * restartTeamMetrics.ts
 *
 * Per-team restart counts with explicit separation between:
 *   - Restart Share (all-match restarts won / conceded)
 *   - Own kickout outcomes (taken / retained / lost on kicks we took)
 *
 * Chain engine kickouts.won/lost are Restart Share figures — never own-kickout lost.
 */

import type { ChainableEvent, KickoutOutcome } from "../chains/chain-types";
import { resolveRestartOwner } from "../restarts/restartMetrics";

export type TeamRestartCounts = {
  /** Restarts this team won across the whole match (or scoped period). */
  restartShareWon: number;
  /** Restarts this team conceded (opposition won). */
  restartShareConceded: number;
  /** Total restart contests in scope. */
  restartShareTotal: number;
  /** Kickouts this team physically took. */
  ownRestartsTaken: number;
  /** Own kickouts where this team retained possession. */
  ownRestartsRetained: number;
  /** Own kickouts where this team lost possession. */
  ownRestartsLost: number;
};

export type RestartTeamMetrics = {
  for: TeamRestartCounts;
  opp: TeamRestartCounts;
};

export function computeRestartTeamMetrics<TEvent extends ChainableEvent>(
  outcomes: readonly KickoutOutcome<TEvent>[],
): RestartTeamMetrics {
  const total = outcomes.length;
  const forShareWon = outcomes.filter((o) => o.winningSide === "FOR").length;
  const oppShareWon = outcomes.filter((o) => o.winningSide === "OPP").length;

  const forOwn = outcomes.filter((o) => resolveRestartOwner(o.kickoutEvent) === "FOR");
  const oppOwn = outcomes.filter((o) => resolveRestartOwner(o.kickoutEvent) === "OPP");

  const forOwnRetained = forOwn.filter((o) => o.winningSide === "FOR").length;
  const oppOwnRetained = oppOwn.filter((o) => o.winningSide === "OPP").length;

  return {
    for: {
      restartShareWon: forShareWon,
      restartShareConceded: oppShareWon,
      restartShareTotal: total,
      ownRestartsTaken: forOwn.length,
      ownRestartsRetained: forOwnRetained,
      ownRestartsLost: forOwn.length - forOwnRetained,
    },
    opp: {
      restartShareWon: oppShareWon,
      restartShareConceded: forShareWon,
      restartShareTotal: total,
      ownRestartsTaken: oppOwn.length,
      ownRestartsRetained: oppOwnRetained,
      ownRestartsLost: oppOwn.length - oppOwnRetained,
    },
  };
}

/** Coach-facing: "Adare lost 10 of 22 own kickouts." */
export function formatOwnKickoutsLost(
  team: string,
  counts: TeamRestartCounts,
  sport?: "gaelic" | "hurling" | "camogie" | "ladies_football",
): string {
  const ko = sport === "hurling" || sport === "camogie" ? "puckouts" : "kickouts";
  if (counts.ownRestartsTaken === 0) return `${team} took no own ${ko}`;
  return `${team} lost ${counts.ownRestartsLost} of ${counts.ownRestartsTaken} own ${ko}`;
}

/** Coach-facing: "Mungret won 20 of the match's 42 restarts." */
export function formatRestartShareWon(
  team: string,
  counts: TeamRestartCounts,
): string {
  if (counts.restartShareTotal === 0) return `${team} contested no restarts`;
  return `${team} won ${counts.restartShareWon} of the match's ${counts.restartShareTotal} restarts`;
}
