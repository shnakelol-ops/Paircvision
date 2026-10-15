import type { TeamSheetPlayer } from "./team-sheet-types";
import {
  DEFAULT_KIT_SELECTION,
  DEFAULT_TEAM,
  LEGACY_OUTFIELD_JERSEY_TO_KIT_ID,
  type TeamSheetKitSelection,
  type TeamSheetTeam,
} from "./team-sheet-kits";

// Own key — deliberately separate from SAVED_SQUADS_STORAGE_KEY
// (src/core/stats/saved-match.ts) so this personal tool can never collide
// with or corrupt real Event Stats saved squads.
const TEAM_SHEET_STORAGE_KEY = "paircvision_internal_team_sheet_v1";

export interface TeamSheetData {
  players: TeamSheetPlayer[];
  substitutes: TeamSheetPlayer[];
  team: TeamSheetTeam;
  kits: TeamSheetKitSelection;
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
  return { players: buildDefaultTeamSheet(), substitutes: [], team: { ...DEFAULT_TEAM }, kits: { ...DEFAULT_KIT_SELECTION } };
}

function parseTeam(value: unknown): TeamSheetTeam {
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (typeof v.id === "string" && v.id && typeof v.name === "string" && v.name.trim()) {
      return { id: v.id, name: v.name };
    }
  }
  return { ...DEFAULT_TEAM };
}

// Kit ids are stored as-is (a user kit may exist only on this device);
// TeamSheetScreen resolves a missing kit back to the role's default preset.
function parseKits(parsed: Record<string, unknown>): TeamSheetKitSelection {
  const kits = parsed.kits && typeof parsed.kits === "object" ? (parsed.kits as Record<string, unknown>) : {};
  const legacyOutfield =
    typeof parsed.outfieldJersey === "string" ? LEGACY_OUTFIELD_JERSEY_TO_KIT_ID[parsed.outfieldJersey] : undefined;
  return {
    outfieldKitId:
      typeof kits.outfieldKitId === "string" && kits.outfieldKitId
        ? kits.outfieldKitId
        : (legacyOutfield ?? DEFAULT_KIT_SELECTION.outfieldKitId),
    gkKitId: typeof kits.gkKitId === "string" && kits.gkKitId ? kits.gkKitId : DEFAULT_KIT_SELECTION.gkKitId,
  };
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
// {players, substitutes, team, kits} shape. Older shapes upgrade in memory:
//  - no team → Ballylanders;
//  - no kits → yellow outfield + black GK presets;
//  - the interim `outfieldJersey: "yellow" | "green" | "white"` field maps
//    onto the matching preset kit id.
export function loadTeamSheet(): TeamSheetData {
  const raw = safeRead();
  if (!raw) return defaultTeamSheetData();
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      // Legacy V1 shape: a bare array of 15 players, no substitutes.
      const players = parsed.length === 15 ? (parsed as TeamSheetPlayer[]) : buildDefaultTeamSheet();
      return { players, substitutes: [], team: { ...DEFAULT_TEAM }, kits: { ...DEFAULT_KIT_SELECTION } };
    }
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.players)) {
      const players = parsed.players.length === 15 ? (parsed.players as TeamSheetPlayer[]) : buildDefaultTeamSheet();
      const substitutes = Array.isArray(parsed.substitutes) ? (parsed.substitutes as TeamSheetPlayer[]) : [];
      return { players, substitutes, team: parseTeam(parsed.team), kits: parseKits(parsed) };
    }
    return defaultTeamSheetData();
  } catch {
    return defaultTeamSheetData();
  }
}

export function saveTeamSheet(data: TeamSheetData): boolean {
  return safeWrite(JSON.stringify(data));
}
