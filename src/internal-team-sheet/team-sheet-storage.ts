import type { TeamSheetPlayer } from "./team-sheet-types";
import { DEFAULT_OUTFIELD_JERSEY, isOutfieldJerseyId, type OutfieldJerseyId } from "./team-sheet-jersey";

// Own key — deliberately separate from SAVED_SQUADS_STORAGE_KEY
// (src/core/stats/saved-match.ts) so this personal tool can never collide
// with or corrupt real Event Stats saved squads.
const TEAM_SHEET_STORAGE_KEY = "paircvision_internal_team_sheet_v1";

export interface TeamSheetData {
  players: TeamSheetPlayer[];
  substitutes: TeamSheetPlayer[];
  outfieldJersey: OutfieldJerseyId;
}

function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function buildDefaultTeamSheet(): TeamSheetPlayer[] {
  return Array.from({ length: 15 }, (_, i) => ({
    id: newId(),
    number: i + 1,
    name: "",
  }));
}

export function buildSubstitute(number: number): TeamSheetPlayer {
  return { id: newId(), number, name: "" };
}

function defaultTeamSheetData(): TeamSheetData {
  return { players: buildDefaultTeamSheet(), substitutes: [], outfieldJersey: DEFAULT_OUTFIELD_JERSEY };
}

function safeRead(): string | null {
  try {
    return window.localStorage.getItem(TEAM_SHEET_STORAGE_KEY);
  } catch {
    return null;
  }
}

function safeWrite(value: string): boolean {
  try {
    window.localStorage.setItem(TEAM_SHEET_STORAGE_KEY, value);
    return true;
  } catch {
    return false;
  }
}

// Same key as the original V1 shape (a bare 15-player array, no
// substitutes). Loading detects that legacy shape and upgrades it in
// memory — existing saved Starting XVs keep loading unchanged, with
// substitutes defaulting to []. Saves always write the current
// {players, substitutes, outfieldJersey} shape; a sheet saved before the
// jersey selector existed (or with an unknown jersey id) loads with the
// original yellow outfield jersey.
export function loadTeamSheet(): TeamSheetData {
  const raw = safeRead();
  if (!raw) return defaultTeamSheetData();
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      // Legacy V1 shape: a bare array of 15 players, no substitutes.
      const players = parsed.length === 15 ? (parsed as TeamSheetPlayer[]) : buildDefaultTeamSheet();
      return { players, substitutes: [], outfieldJersey: DEFAULT_OUTFIELD_JERSEY };
    }
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.players)) {
      const players = parsed.players.length === 15 ? (parsed.players as TeamSheetPlayer[]) : buildDefaultTeamSheet();
      const substitutes = Array.isArray(parsed.substitutes) ? (parsed.substitutes as TeamSheetPlayer[]) : [];
      const outfieldJersey = isOutfieldJerseyId(parsed.outfieldJersey) ? parsed.outfieldJersey : DEFAULT_OUTFIELD_JERSEY;
      return { players, substitutes, outfieldJersey };
    }
    return defaultTeamSheetData();
  } catch {
    return defaultTeamSheetData();
  }
}

export function saveTeamSheet(data: TeamSheetData): boolean {
  return safeWrite(JSON.stringify(data));
}
