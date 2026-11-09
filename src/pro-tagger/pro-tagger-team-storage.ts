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

// SAVED_SQUADS_STORAGE_KEY is shared with legacy Match Stats
// (StatsModeSurface.tsx), whose saved squads are `{ id, name, players,
// updatedAt }` records with no `teamName` or colours. Reads for display
// return Event Stats' own teams only; writes start from EVERY stored record
// so Match Stats' squads are always carried through untouched.
function isSavedTeam(value: unknown): value is SavedTeam {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === "string" && typeof v.teamName === "string" && Array.isArray(v.players);
}

/** Every stored entry, or null when the stored value is present but not a readable JSON array. */
function readAllRecords(): unknown[] | null {
  const raw = safeRead();
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function loadSavedTeams(): SavedTeam[] {
  return (readAllRecords() ?? []).filter(isSavedTeam);
}

export function saveTeam(team: SavedTeam): boolean {
  const existing = readAllRecords();
  if (existing === null) return false; // never overwrite an unreadable store
  const idx = existing.findIndex((t) => isSavedTeam(t) && t.id === team.id);
  let next: unknown[];
  if (idx !== -1) {
    next = [...existing];
    next[idx] = team;
  } else {
    if (existing.filter(isSavedTeam).length >= MAX_SAVED_TEAMS) return false;
    next = [team, ...existing];
  }
  return safeWrite(JSON.stringify(next));
}

export function deleteTeam(id: string): boolean {
  const existing = readAllRecords();
  if (existing === null) return false;
  const next = existing.filter((t) => !(isSavedTeam(t) && t.id === id));
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
