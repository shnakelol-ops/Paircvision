import type { TrainingSession } from "./types";

const SESSIONS_KEY = "paircvision_training_sessions_v1";
const ACTIVE_SESSION_KEY = "paircvision_training_active_session_v1";

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
