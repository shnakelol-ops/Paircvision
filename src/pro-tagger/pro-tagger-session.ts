export type ProTaggerSport = "gaelic" | "ladies_football" | "hurling" | "camogie";

export type ProTaggerMatchType = "league" | "championship" | "friendly" | "training";

export type ProTaggerAttackDirection = "left" | "right";

export type ProTaggerSquadPlayer = {
  id: string;
  number: number;
  name: string;
};

export type ProTaggerSquad = {
  id: string;
  teamSide: "HOME" | "AWAY";
  players: ProTaggerSquadPlayer[];
};

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
  homeSquad: ProTaggerSquad;
  awaySquad: ProTaggerSquad;
}

export function newSessionId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `pro-session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function buildDefaultSquad(side: "HOME" | "AWAY"): ProTaggerSquad {
  const players: ProTaggerSquadPlayer[] = [];
  for (let n = 1; n <= 25; n++) {
    players.push({ id: newId(), number: n, name: "" });
  }
  return { id: newId(), teamSide: side, players };
}
