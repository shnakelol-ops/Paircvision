import type { TeamSheetPlayer } from "./team-sheet-types";

// Own key — deliberately separate from SAVED_SQUADS_STORAGE_KEY
// (src/core/stats/saved-match.ts) so this personal tool can never collide
// with or corrupt real Event Stats saved squads.
const TEAM_SHEET_STORAGE_KEY = "paircvision_internal_team_sheet_v1";

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

export function loadTeamSheet(): TeamSheetPlayer[] {
  const raw = safeRead();
  if (!raw) return buildDefaultTeamSheet();
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length !== 15) return buildDefaultTeamSheet();
    return parsed as TeamSheetPlayer[];
  } catch {
    return buildDefaultTeamSheet();
  }
}

export function saveTeamSheet(players: readonly TeamSheetPlayer[]): boolean {
  return safeWrite(JSON.stringify(players));
}
