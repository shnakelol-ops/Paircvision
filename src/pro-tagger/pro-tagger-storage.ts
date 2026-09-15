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

// Shares SAVED_MATCHES_STORAGE_KEY with Match Stats' own archive (StatsModeSurface.tsx)
// — every saved match on either side is kept, no rolling cap.
export function saveProTaggerMatch(record: SavedMatch): boolean {
  const existing = readExisting();
  const next = orderSavedMatches([record, ...existing]);
  return safeWrite(SAVED_MATCHES_STORAGE_KEY, JSON.stringify(next));
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

// A ProTaggerSquad-shaped value: an object with a `players` array. Doesn't
// validate player contents — only what ProTaggerLiveScreen/ProTaggerPage
// dereference unconditionally (session.homeSquad.players, etc.).
function isSquadShaped(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as Record<string, unknown>)["players"])
  );
}

// Shared by the normal storage read path and file import (ProTaggerOptionsScreen)
// so both reject the same malformed shapes. A record failing this check never
// reaches restoreContext.matchState or other UI state that assumes it's present.
//
// homeSquadLiveState/awaySquadLiveState/homeSquad/awaySquad are required here
// (not just events/restoreContext) because ProTaggerLiveScreen dereferences
// them unconditionally on the very first render of a resumed match
// (e.g. `subSquadState.filter(...)`, `session.homeSquad.players`) — a record
// missing them (an older export shape, or a hand-edited/foreign import file)
// previously passed this check, then crashed with no error boundary the
// moment the coach opened it. Rejecting it here, at the storage/import
// boundary, keeps it out of ProTaggerLiveScreen entirely.
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
    r["restoreContext"] !== null &&
    Array.isArray(r["homeSquadLiveState"]) &&
    Array.isArray(r["awaySquadLiveState"]) &&
    isSquadShaped(r["homeSquad"]) &&
    isSquadShaped(r["awaySquad"])
  );
}

function readProTaggerMatchesRaw(): ProTaggerSavedMatch[] {
  const raw = safeRead(PRO_TAGGER_MATCHES_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // A malformed record left over from a bad write (or a hand-edited/foreign
    // localStorage blob) must not reach restoreContext.matchState during
    // initial render — skip it, keep the valid siblings.
    return parsed.filter(isValidProMatch);
  } catch {
    return [];
  }
}

export function readProTaggerMatches(): ProTaggerSavedMatch[] {
  return readProTaggerMatchesRaw();
}

// Storage array order only ever reflects insertion order of a match's FIRST
// save (saveProTaggerMatchFull upserts an existing match's id in place — it
// never moves it to the front on a later save). That made "the first
// non-FULL_TIME match in the array" a proxy for "most recently CREATED",
// not "most recently WORKED ON" — starting Match B after Match A, then going
// back and adding events to A, still resumed B on next launch (P1-4).
//
// No schema/version migration is needed to fix this: every event already
// carries its own capture-time `createdAt` (LoggedMatchEvent.createdAt), so
// "last worked on" is simply the latest of the match's own createdAt and its
// most recent event's createdAt — derivable from data every saved match
// already has, old or new.
export function deriveLastActivityAt(match: ProTaggerSavedMatch): number {
  let latest = match.createdAt;
  for (const event of match.events) {
    if (event.createdAt > latest) latest = event.createdAt;
  }
  return latest;
}

// Upsert: if a record with same id exists, replace it; otherwise prepend.
// No rolling cap — every saved match is kept, exactly like saveProTaggerMatch
// (the shared Match Stats archive key) above. Saving a 21st distinct match
// must never silently delete the 1st: a completed match is a coach's real
// season record, not disposable cache. If storage genuinely runs out,
// safeWrite already fails closed (returns false, throws nothing) and the
// existing autosave-failure warning ("Save failed — storage unavailable.")
// surfaces that to the coach instead of a match vanishing with no signal.
export function saveProTaggerMatchFull(record: ProTaggerSavedMatch): boolean {
  const existing = readProTaggerMatchesRaw();
  const idx = existing.findIndex((m) => m.id === record.id);
  const next = idx !== -1
    ? existing.map((m, i) => (i === idx ? record : m))
    : [record, ...existing];
  return safeWrite(PRO_TAGGER_MATCHES_STORAGE_KEY, JSON.stringify(next));
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

export function deleteProTaggerMatch(id: string): boolean {
  const existing = readProTaggerMatchesRaw();
  const next = existing.filter((m) => m.id !== id);
  if (next.length === existing.length) return false;
  return safeWrite(PRO_TAGGER_MATCHES_STORAGE_KEY, JSON.stringify(next));
}
