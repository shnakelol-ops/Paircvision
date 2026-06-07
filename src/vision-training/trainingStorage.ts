import type { TrainingHubSquad, TrainingSession } from "./types";

const SESSIONS_KEY = "paircvision_training_sessions_v1";
const ACTIVE_SESSION_KEY = "paircvision_training_active_session_v1";
const TRAINING_HUB_SQUADS_KEY = "paircvision_training_saved_squads_v1";

export function loadSessions(): TrainingSession[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as TrainingSession[];
  } catch {
    return [];
  }
}

export function saveSessions(sessions: TrainingSession[]): void {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

export function loadSessionById(id: string): TrainingSession | null {
  return loadSessions().find((s) => s.id === id) ?? null;
}

export function upsertSession(session: TrainingSession): void {
  const sessions = loadSessions();
  const idx = sessions.findIndex((s) => s.id === session.id);
  if (idx >= 0) {
    sessions[idx] = session;
  } else {
    sessions.unshift(session);
  }
  saveSessions(sessions);
}

export function loadActiveSessionId(): string | null {
  return localStorage.getItem(ACTIVE_SESSION_KEY);
}

export function saveActiveSessionId(id: string | null): void {
  if (id === null) {
    localStorage.removeItem(ACTIVE_SESSION_KEY);
  } else {
    localStorage.setItem(ACTIVE_SESSION_KEY, id);
  }
}

export function loadTrainingHubSquads(): TrainingHubSquad[] {
  try {
    const raw = localStorage.getItem(TRAINING_HUB_SQUADS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as TrainingHubSquad[];
  } catch {
    return [];
  }
}

function saveTrainingHubSquads(squads: TrainingHubSquad[]): void {
  localStorage.setItem(TRAINING_HUB_SQUADS_KEY, JSON.stringify(squads));
}

export function upsertTrainingHubSquad(squad: TrainingHubSquad): void {
  const squads = loadTrainingHubSquads();
  const idx = squads.findIndex((s) => s.id === squad.id);
  if (idx >= 0) {
    squads[idx] = squad;
  } else {
    squads.unshift(squad);
  }
  saveTrainingHubSquads(squads);
}

export function deleteSessionById(id: string): void {
  saveSessions(loadSessions().filter((s) => s.id !== id));
}

export function deleteAllCompletedSessions(): void {
  saveSessions(loadSessions().filter((s) => s.status !== "completed"));
}
