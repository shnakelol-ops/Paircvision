export type ProTaggerSport = "gaelic" | "ladies_football" | "hurling" | "camogie";

export type ProTaggerMatchType = "league" | "championship" | "friendly" | "training";

export type ProTaggerAttackDirection = "left" | "right";

export type ProTaggerSquadPlayer = {
  id: string;
  number: number;
  name: string;
  position?: string; // "GK", "RB", "SUB" etc — optional for backward compat
};

export type ProTaggerSquad = {
  id: string;
  teamSide: "HOME" | "AWAY";
  players: ProTaggerSquadPlayer[];
  // Future team identity — hooks present, not populated in Phase 1:
  teamName?: string;
  primaryColour?: string;
  secondaryColour?: string;
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

// GAA football/hurling positional defaults — 15 starters + 5 subs = 20 players.
const GAA_POSITIONS: readonly string[] = [
  "GK",
  "RB", "FB", "LB",
  "RHB", "CHB", "LHB",
  "MF", "MF",
  "RHF", "CHF", "LHF",
  "RF", "FF", "LF",
  "SUB", "SUB", "SUB", "SUB", "SUB",
];

export function buildDefaultSquad(side: "HOME" | "AWAY"): ProTaggerSquad {
  const players: ProTaggerSquadPlayer[] = GAA_POSITIONS.map((pos, i) => ({
    id:       newId(),
    number:   i + 1,
    name:     "",
    position: pos,
  }));
  return { id: newId(), teamSide: side, players };
}
