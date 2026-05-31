import { SAVED_SQUADS_STORAGE_KEY } from "../core/stats/saved-match";
import type { ProTaggerSquad, ProTaggerSquadPlayer } from "./pro-tagger-session";

export type SavedTeamPlayer = {
  id: string;
  number: number;
  name: string;
  position?: string;
};

export type SavedTeam = {
  // Identity
  id: string;
  createdAt: number;
  updatedAt: number;

  // Display
  teamName: string;
  county?: string;

  // Colours
  primaryColour: string;
  secondaryColour: string;

  // Roster
  players: SavedTeamPlayer[];

  // Phase 2+ schema slots — stored undefined in Phase 1, never shown in UI
  crestUrl?: string;
  groundName?: string;
  ageGroup?: string;
  grade?: string;
  season?: string;
  notes?: string;
};

const MAX_SAVED_TEAMS = 50;

function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function safeRead(): string | null {
  try {
    return window.localStorage.getItem(SAVED_SQUADS_STORAGE_KEY);
  } catch {
    return null;
  }
}

function safeWrite(value: string): boolean {
  try {
    window.localStorage.setItem(SAVED_SQUADS_STORAGE_KEY, value);
    return true;
  } catch {
    return false;
  }
}

export function loadSavedTeams(): SavedTeam[] {
  const raw = safeRead();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedTeam[]) : [];
  } catch {
    return [];
  }
}

export function saveTeam(team: SavedTeam): boolean {
  const existing = loadSavedTeams();
  const idx = existing.findIndex((t) => t.id === team.id);
  let next: SavedTeam[];
  if (idx !== -1) {
    next = [...existing];
    next[idx] = team;
  } else {
    if (existing.length >= MAX_SAVED_TEAMS) return false;
    next = [team, ...existing];
  }
  return safeWrite(JSON.stringify(next));
}

export function deleteTeam(id: string): boolean {
  const existing = loadSavedTeams();
  const next = existing.filter((t) => t.id !== id);
  if (next.length === existing.length) return false;
  return safeWrite(JSON.stringify(next));
}

export function exportTeamAsSquad(
  team: SavedTeam,
  side: "HOME" | "AWAY",
): ProTaggerSquad {
  const players: ProTaggerSquadPlayer[] = team.players.map((p) => ({
    id:       newId(),
    number:   p.number,
    name:     p.name,
    position: p.position,
  }));
  return {
    id:             newId(),
    teamSide:       side,
    players,
    teamName:       team.teamName,
    primaryColour:  team.primaryColour,
    secondaryColour: team.secondaryColour,
  };
}

export function buildNewTeam(partial: Pick<SavedTeam, "teamName" | "primaryColour" | "secondaryColour" | "players">): SavedTeam {
  const now = Date.now();
  return {
    id:             newId(),
    createdAt:      now,
    updatedAt:      now,
    county:         undefined,
    ...partial,
  };
}
