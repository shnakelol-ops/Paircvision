import { createDefaultPlayers } from "../model/trainingScoring";
import { type SavedSquad, type SeasonPlayerStat, type TrainingSessionState } from "../model/trainingTypes";

const STORAGE_KEY = "pitchside.player-performance-tracker.v1";
const SEASON_TABLE_KEY = "pitchside.player-performance-tracker.season.v1";
const SQUADS_KEY = "pitchside.player-performance-tracker.squads.v1";

export function getInitialSessionState(): TrainingSessionState {
  return {
    sessionName: "Training",
    players: createDefaultPlayers(),
    hasStarted: false,
    isRunning: false,
    elapsedSeconds: 0,
    period: "PRE",
    logs: [],
    activeTab: "tracker",
    activeEventKey: null,
    lastDeleted: null,
  };
}

export function loadSessionState(): TrainingSessionState {
  const fallback = getInitialSessionState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<TrainingSessionState>;
    return { ...fallback, ...parsed, elapsedSeconds: Number.isFinite(parsed.elapsedSeconds) ? Number(parsed.elapsedSeconds) : 0 };
  } catch {
    return fallback;
  }
}

export function saveSessionState(state: TrainingSessionState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function loadSeasonTable(): SeasonPlayerStat[] {
  try {
    const raw = localStorage.getItem(SEASON_TABLE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SeasonPlayerStat[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export function saveSeasonTable(table: SeasonPlayerStat[]): void {
  localStorage.setItem(SEASON_TABLE_KEY, JSON.stringify(table));
}

export function loadSavedSquads(): SavedSquad[] {
  try {
    const raw = localStorage.getItem(SQUADS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedSquad[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export function saveSavedSquads(squads: SavedSquad[]): void {
  localStorage.setItem(SQUADS_KEY, JSON.stringify(squads));
}
