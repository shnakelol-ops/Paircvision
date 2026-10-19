/**
 * player-possession-credit.ts
 *
 * Single source of truth for crediting a tagged player on the zero-sum
 * possession kinds — turnovers and kickouts/puckouts.
 *
 * Why this exists: these kinds store teamSide as possession OWNERSHIP, not
 * as the tagged player's own team.
 *   - KICKOUT_WON / KICKOUT_CONCEDED: teamSide is the restart owner — the
 *     side that kept it (WON) or lost it (CONCEDED). See
 *     resolveRestartOutcome in pro-tagger-adapter.ts.
 *   - TURNOVER_WON / TURNOVER_LOST: Event Stats always stores the
 *     opposition-row turnover as TURNOVER_LOST with teamSide "FOR".
 *
 * The capture sources disagree on which team the tagged player belongs to:
 *   - Event Stats tags the player on the row that was tapped — the team
 *     that WON the ball — so an opposition player who wins our kickout sits
 *     on a KICKOUT_CONCEDED event whose teamSide is "FOR".
 *   - Match Stats and Rapid Capture only ever tag a player from the
 *     event's own teamSide squad.
 *
 * Counting a player's event by kind alone therefore credited that
 * opposition ball-winner with "K/O Conceded" / "T/O Lost". The credit has
 * to be read relative to the player's own team: a player on the event's
 * teamSide gets the kind as named; a player on the other team gets the
 * opposite outcome. For Match Stats and Rapid Capture events the two teams
 * always agree, so their credit is unchanged.
 */

import type { MatchEventKind } from "../../core/stats/stats-event-model";

export type PlayerPossessionCredit = "TURNOVER_WON" | "TURNOVER_LOST" | "KICKOUT_WON" | "KICKOUT_LOST";

/**
 * The possession credit a tagged player earns from one event, or null for
 * any kind that isn't a turnover or kickout.
 *
 * `playerTeamSide` must be the player's real team (roster membership where
 * known) — never the event's own teamSide, which is what this resolves
 * against.
 */
export function resolvePlayerPossessionCredit(
  kind: MatchEventKind,
  eventTeamSide: "FOR" | "OPP",
  playerTeamSide: "FOR" | "OPP",
): PlayerPossessionCredit | null {
  const playerOnEventSide = playerTeamSide === eventTeamSide;
  switch (kind) {
    case "TURNOVER_WON":
      return playerOnEventSide ? "TURNOVER_WON" : "TURNOVER_LOST";
    case "TURNOVER_LOST":
      return playerOnEventSide ? "TURNOVER_LOST" : "TURNOVER_WON";
    case "KICKOUT_WON":
      return playerOnEventSide ? "KICKOUT_WON" : "KICKOUT_LOST";
    case "KICKOUT_CONCEDED":
      return playerOnEventSide ? "KICKOUT_LOST" : "KICKOUT_WON";
    default:
      return null;
  }
}
