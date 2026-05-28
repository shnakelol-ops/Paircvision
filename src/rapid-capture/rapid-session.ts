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
}
