import {
  SAVED_MATCHES_STORAGE_KEY,
  MAX_SAVED_MATCHES,
} from "../core/stats/saved-match";
import type { SavedMatch, LoggedMatchEvent } from "../core/stats/saved-match";
import type {
  ProTaggerSport,
  ProTaggerMatchType,
  ProTaggerSquad,
  ProTaggerSquadPlayer,
} from "./pro-tagger-session";
import type { MatchTargets } from "../stats/matchTargets";

// ── Shared key (Stats Lite cross-visibility) ──────────────────────────────────

function safeRead(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeWrite(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function readExisting(): SavedMatch[] {
  const raw = safeRead(SAVED_MATCHES_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedMatch[]) : [];
  } catch {
    return [];
  }
}

export function saveProTaggerMatch(record: SavedMatch): boolean {
  const existing = readExisting();
  const next = [record, ...existing].slice(0, MAX_SAVED_MATCHES);
  return safeWrite(SAVED_MATCHES_STORAGE_KEY, JSON.stringify(next));
}

// ── Pro Tagger full restore key ───────────────────────────────────────────────

export const PRO_TAGGER_MATCHES_STORAGE_KEY = "pitchflow_pro_tagger_matches_v1";
const MAX_PRO_TAGGER_MATCHES = 20;

export type ProTaggerRestoreContext = {
  matchState: "PRE_MATCH" | "FIRST_HALF" | "HALF_TIME" | "SECOND_HALF" | "FULL_TIME";
  currentHalf: 1 | 2;
  matchTimeSeconds: number;
  firstHalfAttackingDirection: "left" | "right";
};

export type ProTaggerSavedMatch = {
  // Identity
  id: string;
  createdAt: number;

  // Match metadata
  homeTeamName: string;
  awayTeamName: string;
  venue: string;
  sport: ProTaggerSport;
  matchType: ProTaggerMatchType;
  halfDurationMinutes: number;

  // Score (pre-computed string for list display)
  scorelineSnapshot: string;
  eventCount: number;

  // Full event log
  events: readonly LoggedMatchEvent[];

  // Squad at session start (for player picker restore)
  homeSquad: ProTaggerSquad;
  awaySquad: ProTaggerSquad;

  // Live squad state at time of save (post-substitutions)
  homeSquadLiveState: ProTaggerSquadPlayer[];
  awaySquadLiveState: ProTaggerSquadPlayer[];

  // Clock + match phase restore
  restoreContext: ProTaggerRestoreContext;
  targets?: MatchTargets;

  // Set once the touchline-axis coordinate mirror repair (see
  // pro-tagger-coordinate-repair.ts) has been applied to this match's
  // events. Absent on every match that has never been repaired — its
  // presence is what makes the repair a one-time, idempotent action.
  coordinateRepair?: {
    version: number;
    appliedAt: number;
  };
};

function readProTaggerMatchesRaw(): ProTaggerSavedMatch[] {
  const raw = safeRead(PRO_TAGGER_MATCHES_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ProTaggerSavedMatch[]) : [];
  } catch {
    return [];
  }
}

export function readProTaggerMatches(): ProTaggerSavedMatch[] {
  return readProTaggerMatchesRaw();
}

export function saveProTaggerMatchFull(record: ProTaggerSavedMatch): boolean {
  const existing = readProTaggerMatchesRaw();
  // Upsert: if a record with same id exists, replace it; otherwise prepend.
  const idx = existing.findIndex((m) => m.id === record.id);
  let next: ProTaggerSavedMatch[];
  if (idx !== -1) {
    next = [...existing];
    next[idx] = record;
  } else {
    next = [record, ...existing].slice(0, MAX_PRO_TAGGER_MATCHES);
  }
  return safeWrite(PRO_TAGGER_MATCHES_STORAGE_KEY, JSON.stringify(next));
}

export function deleteProTaggerMatch(id: string): boolean {
  const existing = readProTaggerMatchesRaw();
  const next = existing.filter((m) => m.id !== id);
  if (next.length === existing.length) return false;
  return safeWrite(PRO_TAGGER_MATCHES_STORAGE_KEY, JSON.stringify(next));
}
