import type { BallState, MovementBoardRoute, MovementBoardToken, MovementPlaybackSpeed, TacticalPassEvent, TacticalShotEvent, TacticalTrainingItem, ZoneRecord } from "../../movement-board/shell/types";
import type { TacticalUnit } from "./tacticalUnitTypes";

const STORAGE_KEY = "paircvision-tp-scenarios";
const MAX_SCENARIOS = 20;

export type TacticalScenario = {
  id: string;
  name: string;
  savedAt: number;
  tokens: MovementBoardToken[];
  routes: MovementBoardRoute[];
  ballState: BallState;
  passEvents: TacticalPassEvent[];
  shotEvents: TacticalShotEvent[];
  playbackSpeed?: MovementPlaybackSpeed;
  units?: TacticalUnit[];
  zones?: ZoneRecord[];
  items?: TacticalTrainingItem[];
};

export function listScenarios(): TacticalScenario[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as TacticalScenario[]) : [];
  } catch {
    return [];
  }
}

function persistList(list: TacticalScenario[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Storage full or disabled — silent fail
  }
}

export function saveScenario(
  name: string,
  tokens: MovementBoardToken[],
  routes: MovementBoardRoute[],
  ballState: BallState,
  passEvents: TacticalPassEvent[],
  shotEvents: TacticalShotEvent[],
  playbackSpeed?: MovementPlaybackSpeed,
  units?: TacticalUnit[],
  zones?: ZoneRecord[],
  items?: TacticalTrainingItem[],
): TacticalScenario {
  const scenario: TacticalScenario = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: name.trim() || "Untitled",
    savedAt: Date.now(),
    tokens,
    routes,
    ballState,
    passEvents,
    shotEvents,
    playbackSpeed,
    units,
    zones,
    items,
  };
  persistList([scenario, ...listScenarios()].slice(0, MAX_SCENARIOS));
  return scenario;
}

export function deleteScenario(id: string): void {
  persistList(listScenarios().filter((s) => s.id !== id));
}

export function renameScenario(id: string, name: string): void {
  persistList(
    listScenarios().map((s) => (s.id === id ? { ...s, name: name.trim() || s.name } : s)),
  );
}

export function duplicateScenario(id: string): TacticalScenario | null {
  const source = listScenarios().find((s) => s.id === id);
  if (!source) return null;
  const copy: TacticalScenario = {
    ...source,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: `${source.name} (copy)`,
    savedAt: Date.now(),
  };
  persistList([copy, ...listScenarios()].slice(0, MAX_SCENARIOS));
  return copy;
}
