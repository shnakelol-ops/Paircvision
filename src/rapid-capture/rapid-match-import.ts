// Universal PáircVision match loader for Rapid Capture.
//
// Recognises a small, explicit set of export formats and converts each into
// the Rapid Capture session/event model. Detection and parsing are combined
// per format (a format "detects" by successfully parsing); adding a future
// format means adding one more entry to IMPORT_FORMAT_PARSERS below — the
// caller (the Match Hub "Import JSON" action) never changes.
//
// Never mutates the parsed input: every returned event/session is a fresh
// object built from the source, not a reference into it.

import { parseReviewSession } from "../stats/reviewSession";
import { parseRapidEvent, parseRapidSession } from "./rapid-capture-storage";
import type { MatchEvent } from "../core/stats/stats-event-model";
import type { AttackDirection, MatchType, RapidSession, Sport } from "./rapid-session";

export type ImportSourceFormat = "RAPID_CAPTURE" | "MATCH_STATS" | "EVENT_STATS";

export type ImportedMatch = {
  session: RapidSession;
  events: MatchEvent[];
};

export type ImportResult =
  | { ok: true; format: ImportSourceFormat; match: ImportedMatch }
  | { ok: false; reason: string };

const DEFAULT_SESSION_DEFAULTS = {
  forTeamColour: "#1f6feb",
  oppTeamColour: "#b91c1c",
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Parses an events array with the same structural rules Rapid Capture's own
 * storage uses. An imported file is rejected as a whole if any event fails
 * validation — for a foreign file we'd rather refuse it outright than load a
 * silently incomplete match onto the pitch.
 */
function parseImportedEvents(value: unknown): MatchEvent[] | null {
  if (!Array.isArray(value)) return null;
  const events: MatchEvent[] = [];
  for (const raw of value) {
    const event = parseRapidEvent(raw);
    if (!event) return null;
    events.push(event);
  }
  return events;
}

// ─── Rapid Capture format ─────────────────────────────────────────────────────
// { version: 2, session: {...}, events: [...], exportedAt }

function parseRapidCaptureFormat(json: unknown): ImportedMatch | null {
  if (!isRecord(json)) return null;
  if (json.version !== 2) return null;
  const session = parseRapidSession(json.session);
  const events = parseImportedEvents(json.events);
  if (!session || !events) return null;
  return { session, events };
}

// ─── Match Stats format ───────────────────────────────────────────────────────
// ReviewSession: { version: 1, matchInfo: {homeTeam, awayTeam, venue?}, events, reviewContext, ... }
// Sport, colours, attack direction and half length are not part of this
// export — Rapid Capture defaults apply and are corrected on the Setup screen.

function parseMatchStatsFormat(json: unknown): ImportedMatch | null {
  const reviewSession = parseReviewSession(json);
  if (!reviewSession) return null;
  const events = parseImportedEvents(reviewSession.events);
  if (!events) return null;
  const session: RapidSession = {
    sport: "gaelic",
    forTeamName: reviewSession.matchInfo.homeTeam,
    oppTeamName: reviewSession.matchInfo.awayTeam,
    venue: reviewSession.matchInfo.venue ?? "",
    matchType: "friendly",
    forTeamColour: DEFAULT_SESSION_DEFAULTS.forTeamColour,
    oppTeamColour: DEFAULT_SESSION_DEFAULTS.oppTeamColour,
    attackDirection: "right",
    halfDurationMinutes: 30,
  };
  return { session, events };
}

// ─── Event Stats (Pro Tagger) format ─────────────────────────────────────────
// ProTaggerSavedMatch: no `version` field; homeTeamName/awayTeamName (flat),
// restoreContext, sport, matchType, halfDurationMinutes, homeSquad/awaySquad.

const EVENT_STATS_SPORT_MAP: Record<string, Sport> = {
  gaelic: "gaelic",
  hurling: "hurling",
  camogie: "camogie",
  // No distinct Rapid Capture sport for ladies football yet — closest family.
  ladies_football: "gaelic",
};

const RAPID_MATCH_TYPES: readonly MatchType[] = ["league", "championship", "friendly", "training"];
const RAPID_ATTACK_DIRECTIONS: readonly AttackDirection[] = ["left", "right"];

function isEventStatsShape(json: unknown): json is Record<string, unknown> {
  if (!isRecord(json)) return false;
  return (
    json.version === undefined &&
    typeof json.id === "string" &&
    typeof json.createdAt === "number" &&
    typeof json.homeTeamName === "string" &&
    typeof json.awayTeamName === "string" &&
    Array.isArray(json.events) &&
    isRecord(json.restoreContext)
  );
}

function parseEventStatsFormat(json: unknown): ImportedMatch | null {
  if (!isEventStatsShape(json)) return null;
  const events = parseImportedEvents(json.events);
  if (!events) return null;

  const sport = EVENT_STATS_SPORT_MAP[typeof json.sport === "string" ? json.sport : ""] ?? "gaelic";

  const matchTypeRaw = json.matchType;
  const matchType = RAPID_MATCH_TYPES.includes(matchTypeRaw as MatchType)
    ? (matchTypeRaw as MatchType)
    : "friendly";

  const halfDurationMinutes =
    typeof json.halfDurationMinutes === "number" && Number.isFinite(json.halfDurationMinutes)
      ? json.halfDurationMinutes
      : 30;

  const restoreContext = json.restoreContext as Record<string, unknown>;
  const attackDirRaw = restoreContext.firstHalfAttackingDirection;
  const attackDirection = RAPID_ATTACK_DIRECTIONS.includes(attackDirRaw as AttackDirection)
    ? (attackDirRaw as AttackDirection)
    : "right";

  const session: RapidSession = {
    sport,
    forTeamName: json.homeTeamName as string,
    oppTeamName: json.awayTeamName as string,
    venue: typeof json.venue === "string" ? json.venue : "",
    matchType,
    forTeamColour: DEFAULT_SESSION_DEFAULTS.forTeamColour,
    oppTeamColour: DEFAULT_SESSION_DEFAULTS.oppTeamColour,
    attackDirection,
    halfDurationMinutes,
  };
  return { session, events };
}

// ─── Registry ─────────────────────────────────────────────────────────────────

const IMPORT_FORMAT_PARSERS: ReadonlyArray<{
  id: ImportSourceFormat;
  parse: (json: unknown) => ImportedMatch | null;
}> = [
  { id: "RAPID_CAPTURE", parse: parseRapidCaptureFormat },
  { id: "MATCH_STATS", parse: parseMatchStatsFormat },
  { id: "EVENT_STATS", parse: parseEventStatsFormat },
];

export function parseImportedMatchFile(raw: string): ImportResult {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "This file is not valid JSON." };
  }

  for (const parser of IMPORT_FORMAT_PARSERS) {
    const match = parser.parse(json);
    if (match) return { ok: true, format: parser.id, match };
  }

  return {
    ok: false,
    reason: "Unrecognised or corrupted match file — expected a Rapid Capture, Match Stats, or Event Stats export.",
  };
}

/** Derives a sensible resume point (half + clock) from an imported event list. */
export function deriveHalfAndClockFromEvents(events: readonly MatchEvent[]): {
  half: 1 | 2;
  clockSeconds: number;
} {
  if (events.length === 0) return { half: 1, clockSeconds: 0 };
  const half: 1 | 2 = events.some((e) => e.half === 2) ? 2 : 1;
  const clockSeconds = events
    .filter((e) => e.half === half)
    .reduce((max, e) => Math.max(max, e.matchClockSeconds ?? e.timestamp ?? 0), 0);
  return { half, clockSeconds };
}
