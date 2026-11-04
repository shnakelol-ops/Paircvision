import {
  SAVED_MATCHES_STORAGE_KEY,
  orderSavedMatches,
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

// ── Write results ─────────────────────────────────────────────────────────────
//
// Every write either succeeds or leaves storage exactly as it was (a
// localStorage setItem is all-or-nothing). A failed or refused write says why:
//   unreadable  — the key holds a value that is not a JSON array; it is never
//                 treated as empty and never overwritten (Settings → Backup
//                 still exports it verbatim);
//   full        — the browser's storage quota is exhausted;
//   unavailable — any other storage failure (blocked, private mode, …).

export type ProTaggerSaveFailure = "unreadable" | "full" | "unavailable";
export type ProTaggerSaveResult = { ok: boolean; reason: ProTaggerSaveFailure | null };
export type ProTaggerDeleteResult = { ok: boolean; reason: ProTaggerSaveFailure | "not-found" | null };

const SAVED: ProTaggerSaveResult = { ok: true, reason: null };

function isQuotaError(err: unknown): boolean {
  if (typeof DOMException === "undefined" || !(err instanceof DOMException)) return false;
  return err.name === "QuotaExceededError" || err.name === "NS_ERROR_DOM_QUOTA_REACHED" || err.code === 22 || err.code === 1014;
}

function safeWriteResult(key: string, value: string): ProTaggerSaveResult {
  try {
    window.localStorage.setItem(key, value);
    return SAVED;
  } catch (err) {
    return { ok: false, reason: isQuotaError(err) ? "full" : "unavailable" };
  }
}

/**
 * A stored JSON array, read without dropping anything. "unreadable" means the
 * key holds something that is not a JSON array — callers must not write over it.
 */
type StoredArray = { status: "empty" } | { status: "ok"; records: unknown[] } | { status: "unreadable" };

function readStoredArray(key: string): StoredArray {
  const raw = safeRead(key);
  if (raw == null || raw === "") return { status: "empty" };
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? { status: "ok", records: parsed } : { status: "unreadable" };
  } catch {
    return { status: "unreadable" };
  }
}

function storedRecords(read: StoredArray): unknown[] {
  return read.status === "ok" ? read.records : [];
}

// Shares SAVED_MATCHES_STORAGE_KEY with Match Stats' own archive (StatsModeSurface.tsx)
// — every saved match on either side is kept, no rolling cap. Like Match
// Stats' own save, an unreadable archive is never overwritten.
export function saveProTaggerMatchResult(record: SavedMatch): ProTaggerSaveResult {
  const existing = readStoredArray(SAVED_MATCHES_STORAGE_KEY);
  if (existing.status === "unreadable") return { ok: false, reason: "unreadable" };
  const next = orderSavedMatches([record, ...(storedRecords(existing) as SavedMatch[])]);
  return safeWriteResult(SAVED_MATCHES_STORAGE_KEY, JSON.stringify(next));
}

export function saveProTaggerMatch(record: SavedMatch): boolean {
  return saveProTaggerMatchResult(record).ok;
}

// ── Pro Tagger full restore key ───────────────────────────────────────────────

export const PRO_TAGGER_MATCHES_STORAGE_KEY = "pitchflow_pro_tagger_matches_v1";

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
  // Stamped by saveProTaggerMatchFull on every write (autosave, manual save,
  // import, coordinate repair) — the trustworthy "last touched" signal
  // findInProgressMatch sorts by, since array position reflects creation
  // order (upsert-in-place), not last activity. Absent on a record saved
  // before this field existed; treat as absent, never guess a value.
  updatedAt?: number;

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

// Shared by the normal storage read path and file import (ProTaggerOptionsScreen)
// so both reject the same malformed shapes. A record failing this check never
// reaches restoreContext.matchState or other UI state that assumes it's present.
export function isValidProMatch(obj: unknown): obj is ProTaggerSavedMatch {
  if (typeof obj !== "object" || obj === null) return false;
  const r = obj as Record<string, unknown>;
  return (
    typeof r["id"] === "string" &&
    typeof r["createdAt"] === "number" &&
    typeof r["homeTeamName"] === "string" &&
    typeof r["awayTeamName"] === "string" &&
    Array.isArray(r["events"]) &&
    typeof r["restoreContext"] === "object" &&
    r["restoreContext"] !== null
  );
}

function readProTaggerMatchesRaw(): ProTaggerSavedMatch[] {
  // A malformed record left over from a bad write (or a hand-edited/foreign
  // localStorage blob) must not reach restoreContext.matchState during
  // initial render — readers see only the valid records. Writers keep the
  // malformed ones in storage (see saveProTaggerMatchFullResult).
  return storedRecords(readStoredArray(PRO_TAGGER_MATCHES_STORAGE_KEY)).filter(isValidProMatch);
}

export function readProTaggerMatches(): ProTaggerSavedMatch[] {
  return readProTaggerMatchesRaw();
}

/** "unreadable" when the saved-match store holds a value that cannot be read as a list. */
export function readProTaggerStoreStatus(): "empty" | "ok" | "unreadable" {
  return readStoredArray(PRO_TAGGER_MATCHES_STORAGE_KEY).status;
}

/**
 * Upsert by id. No saved match is ever removed by a save, records that fail
 * isValidProMatch are written back untouched in their positions, and an
 * unreadable store is never overwritten.
 */
export function saveProTaggerMatchFullResult(record: ProTaggerSavedMatch): ProTaggerSaveResult {
  const existing = readStoredArray(PRO_TAGGER_MATCHES_STORAGE_KEY);
  if (existing.status === "unreadable") return { ok: false, reason: "unreadable" };
  const records = storedRecords(existing);
  const stamped: ProTaggerSavedMatch = { ...record, updatedAt: Date.now() };
  // Replace in place when the id exists; otherwise prepend. Array position
  // is left untouched on an update — findInProgressMatch sorts by updatedAt
  // itself rather than relying on array order.
  const idx = records.findIndex((m) => isValidProMatch(m) && m.id === record.id);
  const next = idx !== -1
    ? records.map((m, i) => (i === idx ? stamped : m))
    : [stamped, ...records];
  return safeWriteResult(PRO_TAGGER_MATCHES_STORAGE_KEY, JSON.stringify(next));
}

export function saveProTaggerMatchFull(record: ProTaggerSavedMatch): boolean {
  return saveProTaggerMatchFullResult(record).ok;
}

export type ImportIdCollisionResult = {
  match: ProTaggerSavedMatch;
  /** True when the candidate's id was rewritten to avoid clobbering an unrelated saved match. */
  idRewritten: boolean;
};

/**
 * Guards an imported match against a coincidental id collision with a
 * different, unrelated saved match (e.g. importing a file exported from a
 * different deployment/origin whose id happens to match something already
 * saved here). Only reuses the imported id when there's no collision, or the
 * collision is the same match (re-importing an identical file stays a stable
 * no-op upsert) — never silently overwrites a genuinely different record.
 */
export function resolveImportIdCollision(
  candidate: ProTaggerSavedMatch,
  existingMatches: readonly ProTaggerSavedMatch[],
): ImportIdCollisionResult {
  const collision = existingMatches.find((m) => m.id === candidate.id);
  const isDifferentMatch =
    collision != null &&
    (collision.homeTeamName !== candidate.homeTeamName ||
      collision.awayTeamName !== candidate.awayTeamName ||
      collision.createdAt !== candidate.createdAt);

  if (!isDifferentMatch) return { match: candidate, idRewritten: false };
  return {
    match: { ...candidate, id: `${candidate.id}-imported-${Date.now()}` },
    idRewritten: true,
  };
}

/**
 * Selects the most recently active unfinished match for the Home "Resume
 * in-progress match" banner. Sorts by updatedAt (stamped by every
 * saveProTaggerMatchFull write) rather than trusting array position — an
 * existing match updated in place keeps its original array slot (creation
 * order), so array position alone can point at a stale match instead of the
 * one actually being played. Falls back to createdAt for a record saved
 * before updatedAt existed, so a legacy record still sorts deterministically.
 */
export function selectMostRecentInProgressMatch(
  matches: readonly ProTaggerSavedMatch[],
): ProTaggerSavedMatch | null {
  const inProgress = matches.filter((m) => m.restoreContext.matchState !== "FULL_TIME");
  if (inProgress.length === 0) return null;
  function lastTouched(m: ProTaggerSavedMatch): number {
    return typeof m.updatedAt === "number" && Number.isFinite(m.updatedAt) ? m.updatedAt : m.createdAt;
  }
  return inProgress.reduce((best, m) => (lastTouched(m) > lastTouched(best) ? m : best));
}

/**
 * Removes exactly the valid match with this id; every other record —
 * including malformed ones — is written back untouched. "not-found" when no
 * such match is stored. An unreadable store is never rewritten.
 */
export function deleteProTaggerMatchResult(id: string): ProTaggerDeleteResult {
  const existing = readStoredArray(PRO_TAGGER_MATCHES_STORAGE_KEY);
  if (existing.status === "unreadable") return { ok: false, reason: "unreadable" };
  const records = storedRecords(existing);
  const next = records.filter((m) => !(isValidProMatch(m) && m.id === id));
  if (next.length === records.length) return { ok: false, reason: "not-found" };
  return safeWriteResult(PRO_TAGGER_MATCHES_STORAGE_KEY, JSON.stringify(next));
}

export function deleteProTaggerMatch(id: string): boolean {
  return deleteProTaggerMatchResult(id).ok;
}

// ── Coach-facing wording ──────────────────────────────────────────────────────

/** The warning shown wherever an Event Stats save is refused or fails. */
export function saveFailureText(reason: ProTaggerSaveFailure): string {
  switch (reason) {
    case "unreadable":  return "Save blocked — saved matches storage is corrupted.";
    case "full":        return "Save failed — storage full. Back up and delete old matches.";
    case "unavailable": return "Save failed — storage unavailable.";
  }
}

// Browsers give each site roughly 5 million characters of localStorage.
const STORAGE_CAPACITY_CHARS = 5_000_000;
const NEARLY_FULL_FRACTION = 0.8;

/** True when this site's localStorage holds ≥ 80 % of a typical 5 M-character quota. */
export function isStorageNearlyFull(storage: Storage | undefined = typeof window !== "undefined" ? window.localStorage : undefined): boolean {
  if (!storage) return false;
  let used = 0;
  try {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key == null) continue;
      used += key.length + (storage.getItem(key)?.length ?? 0);
    }
  } catch {
    return false;
  }
  return used >= STORAGE_CAPACITY_CHARS * NEARLY_FULL_FRACTION;
}
