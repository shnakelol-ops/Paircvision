/**
 * pro-session-storage.ts
 *
 * PáircVision Pro Tagging — Session Storage
 *
 * Uses SEPARATE localStorage keys from all existing systems.
 * Never touches pitchflow_*, pitchsideclub.*, or paircvision_stats_* keys.
 *
 * Storage keys:
 *   paircvision.pro-tagging.session.v1   — active session state
 *   paircvision.pro-tagging.squads.v1    — saved squads
 */

import type { ProSessionState, ProPlayer } from "../model/pro-event-model";
import type { SportProfileId } from "../model/sport-profile-types";

const SESSION_KEY = "paircvision.pro-tagging.session.v1";
const SQUADS_KEY = "paircvision.pro-tagging.squads.v1";

// ---------------------------------------------------------------------------
// Default Squad
// ---------------------------------------------------------------------------

function createDefaultPlayers(): readonly ProPlayer[] {
  return Array.from({ length: 15 }, (_, idx) => {
    const number = idx + 1;
    return {
      id: `pro-player-${number}`,
      number,
      name: `#${number}`,
      role: "STARTER" as const,
      isActive: true,
    };
  });
}

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// Initial state factory
// ---------------------------------------------------------------------------

export function createInitialProSession(
  sportProfile: SportProfileId = "HURLING",
): ProSessionState {
  return {
    id: newId(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    homeTeamName: "Home",
    awayTeamName: "Away",
    venueName: "",
    sportProfile,
    homeSide: "FOR",
    attackingDirection: "RIGHT",
    half: 1,
    matchClockSeconds: 0,
    isRunning: false,
    hasStarted: false,
    players: createDefaultPlayers(),
    events: [],
    activePlayerId: null,
  };
}

// ---------------------------------------------------------------------------
// Session persistence
// ---------------------------------------------------------------------------

export function loadProSession(): ProSessionState | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ProSessionState;
    // Basic validation
    if (!parsed.id || !parsed.sportProfile || !Array.isArray(parsed.events)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveProSession(state: ProSessionState): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      ...state,
      updatedAt: Date.now(),
    }));
  } catch {
    // Storage full or private mode — fail silently
  }
}

export function clearProSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

// ---------------------------------------------------------------------------
// Saved Squads
// ---------------------------------------------------------------------------

export type SavedProSquad = {
  id: string;
  name: string;
  players: readonly ProPlayer[];
  createdAt: number;
};

export function loadSavedProSquads(): SavedProSquad[] {
  try {
    const raw = localStorage.getItem(SQUADS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedProSquad[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export function saveSavedProSquads(squads: readonly SavedProSquad[]): void {
  try {
    localStorage.setItem(SQUADS_KEY, JSON.stringify(squads));
  } catch {
    // fail silently
  }
}
