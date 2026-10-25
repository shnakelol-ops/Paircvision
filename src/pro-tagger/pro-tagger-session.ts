import type { MatchTargets } from "../stats/matchTargets";

export type ProTaggerSport = "gaelic" | "ladies_football" | "hurling" | "camogie";

export type ProTaggerMatchType = "league" | "championship" | "friendly" | "training";

export type ProTaggerAttackDirection = "left" | "right";

// Where the secondary team colour appears on the jersey — a presentation
// choice only (see ProTaggerLineupJerseyTile.tsx, the one shared renderer
// for all three). Never read by capture, scoring, substitutions, discipline,
// Review, or reporting — those all operate on ProTaggerSquadPlayer or event
// data, neither of which this field touches.
export type ProTaggerJerseyStyle = "chest" | "sleeves" | "collar";

export type ProTaggerSquadPlayer = {
  id: string;
  number: number;
  name: string;
  position?: string;  // "GK", "RB", "SUB" etc — optional for backward compat
  isActive?: boolean; // undefined/true = on pitch; false = subbed off
  activeSlot?: number; // 1–15 formation slot while active
};

export type ProTaggerSquad = {
  id: string;
  teamSide: "HOME" | "AWAY";
  players: ProTaggerSquadPlayer[];
  // Future team identity — hooks present, not populated in Phase 1:
  teamName?: string;
  primaryColour?: string;
  secondaryColour?: string;
  // Presentation only — where the secondary colour appears on the jersey.
  // Optional/defaulted: absent on every squad saved before this field
  // existed, and every read site falls back to "chest" (jerseyStyle ??
  // "chest"), which is exactly what those older squads already looked
  // like. No migration, no schema-version bump.
  jerseyStyle?: ProTaggerJerseyStyle;
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
  targets?: MatchTargets;
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
