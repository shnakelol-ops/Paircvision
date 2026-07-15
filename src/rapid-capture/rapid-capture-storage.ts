// Isolated persistence for Rapid Capture.
//
// Deliberately separate from core/stats/saved-match.ts and its storage key —
// Rapid Capture sessions must never appear in Match Stats' saved-match list.
// Reuses the shared MatchEvent/MATCH_EVENT_KINDS contract so events round-trip
// through the same shape the rest of the app already understands.

import { MATCH_EVENT_KINDS, type MatchEventKind } from "../core/stats/stats-event-model";
import type { RapidMatchEvent, RapidSquadPlayer } from "./rapid-capture-events";
import { isLiveMatchState, type RapidMatchState } from "./rapid-match-state";
import type { AttackDirection, MatchType, RapidSession, Sport } from "./rapid-session";

export const RAPID_CAPTURE_SCHEMA_VERSION = 1;

export const RAPID_CAPTURE_ACTIVE_STORAGE_KEY = "paircvision_rapid_capture_active_v1";
export const RAPID_CAPTURE_MATCHES_STORAGE_KEY = "paircvision_rapid_capture_matches_v1";

const MAX_SAVED_RAPID_MATCHES = 30;

export type RapidMatchStatus = "IN_PROGRESS" | "COMPLETED";

export type RapidSavedMatch = {
  schemaVersion: number;
  id: string;
  createdAt: number;
  updatedAt: number;
  status: RapidMatchStatus;
  session: RapidSession;
  events: RapidMatchEvent[];
  half: 1 | 2;
  clockSeconds: number;
  matchState: RapidMatchState;
};

export function newRapidMatchId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `rapid-match-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ── Safe storage primitives ───────────────────────────────────────────────────

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

function safeRemove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

// ── Validation / corruption recovery ──────────────────────────────────────────
// A record that fails validation is dropped rather than patched with guessed
// defaults — for a match recorder, losing one bad record is safer than
// silently fabricating match data.

const SPORTS: readonly Sport[] = ["hurling", "camogie", "gaelic", "soccer"];
const MATCH_TYPES: readonly MatchType[] = ["league", "championship", "friendly", "training"];
const ATTACK_DIRECTIONS: readonly AttackDirection[] = ["left", "right"];
const EVENT_KIND_SET = new Set<MatchEventKind>(MATCH_EVENT_KINDS);

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Lenient — an invalid squad array is simply dropped, never treated as a corruption of the whole record. */
function parseRapidSquad(value: unknown): RapidSquadPlayer[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const players: RapidSquadPlayer[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const source = entry as Record<string, unknown>;
    if (!isFiniteNumber(source.number)) continue;
    players.push({
      number: source.number,
      ...(typeof source.name === "string" && source.name.length > 0 ? { name: source.name } : {}),
      ...(typeof source.id === "string" && source.id.length > 0 ? { id: source.id } : {}),
    });
  }
  return players.length > 0 ? players : undefined;
}

export function parseRapidSession(value: unknown): RapidSession | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  if (!SPORTS.includes(source.sport as Sport)) return null;
  if (!MATCH_TYPES.includes(source.matchType as MatchType)) return null;
  if (!ATTACK_DIRECTIONS.includes(source.attackDirection as AttackDirection)) return null;
  if (typeof source.forTeamName !== "string") return null;
  if (typeof source.oppTeamName !== "string") return null;
  if (typeof source.venue !== "string") return null;
  if (typeof source.forTeamColour !== "string") return null;
  if (typeof source.oppTeamColour !== "string") return null;
  if (!isFiniteNumber(source.halfDurationMinutes)) return null;
  const forSquad = parseRapidSquad(source.forSquad);
  const oppSquad = parseRapidSquad(source.oppSquad);
  return {
    sport: source.sport as Sport,
    forTeamName: source.forTeamName,
    oppTeamName: source.oppTeamName,
    venue: source.venue,
    matchType: source.matchType as MatchType,
    forTeamColour: source.forTeamColour,
    oppTeamColour: source.oppTeamColour,
    attackDirection: source.attackDirection as AttackDirection,
    halfDurationMinutes: source.halfDurationMinutes,
    ...(forSquad ? { forSquad } : {}),
    ...(oppSquad ? { oppSquad } : {}),
  };
}

export function parseRapidEvent(value: unknown): RapidMatchEvent | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  if (typeof source.id !== "string" || source.id.length === 0) return null;
  if (!EVENT_KIND_SET.has(source.kind as MatchEventKind)) return null;
  if (!isFiniteNumber(source.nx) || !isFiniteNumber(source.ny)) return null;
  if (source.half !== 1 && source.half !== 2) return null;
  if (!isFiniteNumber(source.timestamp)) return null;
  // Required fields are structurally sound — pass the record through as-is so
  // optional fields (tags, teamSide, matchClockSeconds, playerId/Name/Number,
  // squadId, ...) survive intact.
  return source as unknown as RapidMatchEvent;
}

/**
 * Records saved before matchState existed carry only status + half. COMPLETED
 * maps unambiguously to FULL_TIME; an in-progress record resumes into
 * whichever half its `half` field already says, since HALF_TIME was never a
 * representable state before this field existed.
 */
function deriveLegacyMatchState(status: RapidMatchStatus, half: 1 | 2): RapidMatchState {
  if (status === "COMPLETED") return "FULL_TIME";
  return half === 2 ? "SECOND_HALF" : "FIRST_HALF";
}

function parseStoredRapidMatch(value: unknown): RapidSavedMatch | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  if (source.schemaVersion !== RAPID_CAPTURE_SCHEMA_VERSION) return null;
  if (typeof source.id !== "string" || source.id.length === 0) return null;
  if (!isFiniteNumber(source.createdAt) || !isFiniteNumber(source.updatedAt)) return null;
  if (source.status !== "IN_PROGRESS" && source.status !== "COMPLETED") return null;
  if (source.half !== 1 && source.half !== 2) return null;
  if (!isFiniteNumber(source.clockSeconds)) return null;
  if (!Array.isArray(source.events)) return null;

  const session = parseRapidSession(source.session);
  if (!session) return null;

  const events = source.events
    .map(parseRapidEvent)
    .filter((event): event is RapidMatchEvent => event != null);

  // TEMP DIAGNOSTIC — see Review event-count investigation.
  if (events.length !== source.events.length) {
    // eslint-disable-next-line no-console
    console.log(
      "[REVIEW-PIPELINE-DEBUG] stage=parseStoredRapidMatch — events DROPPED by parseRapidEvent",
      "raw=", source.events.length,
      "parsed=", events.length,
      "droppedRaw=",
      source.events.filter((raw) => parseRapidEvent(raw) == null),
    );
  }

  const matchState = isLiveMatchState(source.matchState)
    ? source.matchState
    : deriveLegacyMatchState(source.status, source.half);

  return {
    schemaVersion: RAPID_CAPTURE_SCHEMA_VERSION,
    id: source.id,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
    status: source.status,
    session,
    events,
    half: source.half,
    clockSeconds: source.clockSeconds,
    matchState,
  };
}

// ── Active session (autosave / resume) ────────────────────────────────────────

export function saveActiveRapidSession(match: RapidSavedMatch): boolean {
  return safeWrite(RAPID_CAPTURE_ACTIVE_STORAGE_KEY, JSON.stringify(match));
}

export function loadActiveRapidSession(): RapidSavedMatch | null {
  const raw = safeRead(RAPID_CAPTURE_ACTIVE_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = parseStoredRapidMatch(JSON.parse(raw));
    if (!parsed) {
      // Corrupt or unreadable — self-heal so the bad value doesn't linger.
      safeRemove(RAPID_CAPTURE_ACTIVE_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    safeRemove(RAPID_CAPTURE_ACTIVE_STORAGE_KEY);
    return null;
  }
}

export function clearActiveRapidSession(): void {
  safeRemove(RAPID_CAPTURE_ACTIVE_STORAGE_KEY);
}

// ── Saved (completed) matches ──────────────────────────────────────────────────

function readSavedRapidMatches(): RapidSavedMatch[] {
  const raw = safeRead(RAPID_CAPTURE_MATCHES_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      safeRemove(RAPID_CAPTURE_MATCHES_STORAGE_KEY);
      return [];
    }
    // Partial corruption recovery: one bad record is dropped, the rest survive.
    return parsed
      .map(parseStoredRapidMatch)
      .filter((match): match is RapidSavedMatch => match != null);
  } catch {
    safeRemove(RAPID_CAPTURE_MATCHES_STORAGE_KEY);
    return [];
  }
}

export function listSavedRapidMatches(): RapidSavedMatch[] {
  return readSavedRapidMatches();
}

export function getSavedRapidMatch(id: string): RapidSavedMatch | null {
  return readSavedRapidMatches().find((match) => match.id === id) ?? null;
}

/** Upserts by id (newest-first), caps the list, and marks the record COMPLETED. */
export function saveCompletedRapidMatch(match: RapidSavedMatch): boolean {
  // COMPLETED and FULL_TIME must never diverge — force it here rather than
  // trusting every call site to have stamped it correctly.
  const record: RapidSavedMatch = { ...match, status: "COMPLETED", matchState: "FULL_TIME", updatedAt: Date.now() };
  const existing = readSavedRapidMatches();
  const idx = existing.findIndex((m) => m.id === record.id);
  let next: RapidSavedMatch[];
  if (idx !== -1) {
    next = [...existing];
    next[idx] = record;
  } else {
    next = [record, ...existing].slice(0, MAX_SAVED_RAPID_MATCHES);
  }
  return safeWrite(RAPID_CAPTURE_MATCHES_STORAGE_KEY, JSON.stringify(next));
}

export function deleteSavedRapidMatch(id: string): boolean {
  const existing = readSavedRapidMatches();
  const next = existing.filter((m) => m.id !== id);
  if (next.length === existing.length) return false;
  return safeWrite(RAPID_CAPTURE_MATCHES_STORAGE_KEY, JSON.stringify(next));
}
