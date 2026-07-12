// One-match repair for events tagged through the Pro Tagger portrait pitch
// view (ProTaggerPitchView.tsx) before its coordinate mirror fix.
//
// The audit proved the bug flips only the touchline axis:
//   correctedNy = 1 - storedNy   (ny/y)
//   nx/x is unchanged
//
// The stored schema (ProTaggerSavedMatch, LoggedMatchEvent) has no field
// that reliably distinguishes a match captured before the fix from one
// captured after it — createdAt is a wall-clock timestamp, not an app
// version. So this module deliberately does NOT run as an automatic global
// migration. It only repairs a single, explicitly chosen match, exactly
// once (idempotent via the `coordinateRepair` marker), and only after the
// caller has taken a backup.
import type { LoggedMatchEvent } from "../core/stats/saved-match";
import {
  readProTaggerMatches,
  saveProTaggerMatchFull,
  type ProTaggerSavedMatch,
} from "./pro-tagger-storage";

export const COORDINATE_REPAIR_VERSION = 1;

export type CoordinateRepairMeta = NonNullable<ProTaggerSavedMatch["coordinateRepair"]>;

export const PRO_TAGGER_COORDINATE_BACKUP_STORAGE_KEY =
  "pitchflow_pro_tagger_matches_backup_v1";
const MAX_BACKUPS = 40;

export type ProTaggerCoordinateBackupEntry = {
  matchId: string;
  backedUpAt: number;
  match: ProTaggerSavedMatch;
};

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

export function isCoordinateRepairApplied(match: ProTaggerSavedMatch): boolean {
  return match.coordinateRepair != null;
}

/** Flips only the touchline axis (y / ny); the length axis (x / nx) is untouched. */
export function flipEventTouchlineAxis(event: LoggedMatchEvent): LoggedMatchEvent {
  const flipped: LoggedMatchEvent = { ...event, y: 1 - event.y };
  if (typeof (event as { ny?: unknown }).ny === "number") {
    (flipped as { ny: number }).ny = 1 - (event as unknown as { ny: number }).ny;
  }
  return flipped;
}

export type RepairMatchResult =
  | { ok: true; match: ProTaggerSavedMatch }
  | { ok: false; reason: "already-repaired" };

/**
 * Pure — does not touch storage. Returns a new match object with every
 * event's touchline axis corrected and a coordinateRepair marker set.
 * Returns { ok: false } unchanged if the marker is already present, so
 * calling this twice on the same (or an already-repaired, re-imported)
 * match can never double-flip it.
 */
export function repairMirroredEventLocations(match: ProTaggerSavedMatch): RepairMatchResult {
  if (isCoordinateRepairApplied(match)) {
    return { ok: false, reason: "already-repaired" };
  }
  return {
    ok: true,
    match: {
      ...match,
      events: match.events.map(flipEventTouchlineAxis),
      coordinateRepair: {
        version: COORDINATE_REPAIR_VERSION,
        appliedAt: Date.now(),
      },
    },
  };
}

function readBackups(): ProTaggerCoordinateBackupEntry[] {
  const raw = safeRead(PRO_TAGGER_COORDINATE_BACKUP_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ProTaggerCoordinateBackupEntry[]) : [];
  } catch {
    return [];
  }
}

/** Exposed for verification/recovery tooling — not used by the repair flow itself. */
export function readProTaggerCoordinateRepairBackups(): ProTaggerCoordinateBackupEntry[] {
  return readBackups();
}

function backupMatch(match: ProTaggerSavedMatch): void {
  const existing = readBackups();
  const next = [
    { matchId: match.id, backedUpAt: Date.now(), match },
    ...existing,
  ].slice(0, MAX_BACKUPS);
  safeWrite(PRO_TAGGER_COORDINATE_BACKUP_STORAGE_KEY, JSON.stringify(next));
}

export type RepairMatchByIdResult =
  | { ok: true; match: ProTaggerSavedMatch }
  | { ok: false; reason: "not-found" | "already-repaired" };

/**
 * The full, storage-touching repair flow used by the UI:
 * find the match, back it up, apply the pure repair, and persist it via the
 * normal upsert-by-id save path (so every existing consumer — Review,
 * Event Map, PDF export, Intelligence Pack — automatically sees the
 * corrected coordinates without any change on their side).
 */
export function repairProTaggerMatchById(id: string): RepairMatchByIdResult {
  const matches = readProTaggerMatches();
  const match = matches.find((m) => m.id === id);
  if (!match) return { ok: false, reason: "not-found" };
  if (isCoordinateRepairApplied(match)) return { ok: false, reason: "already-repaired" };

  backupMatch(match);
  const result = repairMirroredEventLocations(match);
  if (!result.ok) return result;

  saveProTaggerMatchFull(result.match);
  return { ok: true, match: result.match };
}
