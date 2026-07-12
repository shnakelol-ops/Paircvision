import type { RapidSquadPlayer } from "./rapid-capture-events";

export type Sport = "hurling" | "camogie" | "gaelic" | "soccer";
export type AttackDirection = "left" | "right";
export type MatchType = "league" | "championship" | "friendly" | "training";

export interface RapidSession {
  sport: Sport;
  forTeamName: string;
  oppTeamName: string;
  venue: string;
  matchType: MatchType;
  forTeamColour: string;
  oppTeamColour: string;
  attackDirection: AttackDirection;
  halfDurationMinutes: number;
  /**
   * Squad numbers for the Player Recognition bar — only present when the
   * match was imported from a source that carries a roster (e.g. Event
   * Stats). Absent for manually-started sessions; the bar falls back to a
   * default 1-20 jersey grid when these are undefined.
   */
  forSquad?: RapidSquadPlayer[];
  oppSquad?: RapidSquadPlayer[];
}
