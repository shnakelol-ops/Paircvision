export type ProTaggerSport = "gaelic" | "ladies_football" | "hurling" | "camogie";

export type ProTaggerMatchType = "league" | "championship" | "friendly" | "training";

export type ProTaggerAttackDirection = "left" | "right";

export interface ProTaggerSession {
  id: string;
  sport: ProTaggerSport;
  homeTeamName: string;
  awayTeamName: string;
  venue: string;
  matchType: ProTaggerMatchType;
  attackDirection: ProTaggerAttackDirection;
  halfDurationMinutes: number;
  createdAt: number;
}

export function newSessionId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `pro-session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
